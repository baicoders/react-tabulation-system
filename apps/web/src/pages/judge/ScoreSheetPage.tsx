import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { CandidatePhoto } from '../../components/CandidatePhoto';
import { Pagination } from '../../components/Pagination';
import { BrandLogo } from '../../components/BrandLogo';
import { useAutoInputShortcuts } from '../../hooks/useAutoInputShortcuts';
import { useDebounced } from '../../hooks/useDebounced';
import { usePaginated } from '../../hooks/usePaginated';
import { useDebouncedCallback, useLiveUpdates } from '../../hooks/useLiveUpdates';
import { useResource } from '../../hooks/useResource';
import { PairVotePanel, type PairRound } from './PairVotePanel';

interface Criterion {
  id: number;
  name: string;
  min: number;
  max: number;
  weight: number | null;
}

interface SheetCategory {
  id: number;
  name: string;
  criteria: Criterion[];
  scored: number;
  required: number;
  submitted: boolean;
}

interface Sheet {
  event: { id: number; name: string; testingMode: boolean };
  judge: { id: number; name: string };
  rounds: { id: number; name: string; entries: number; categories: SheetCategory[] }[];
  pairRounds: PairRound[];
  notScoring: string[];
}

interface Row {
  id: number;
  number: number;
  name: string;
  thumbUrl: string | null;
  photoUrl: string | null;
  withdrawn: boolean;
  scores: Record<number, number>;
}

type Points = number | '';
type Edits = Record<number, Record<number, Points>>;
type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error'; message: string };
type Change = { candidateId: number; criterionId: number; value: Points };

const timeFmt = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

/** The candidate's score out of 100 for this category, or null until every criterion has a valid value. */
function categoryTotal(criteria: Criterion[], values: (id: number) => Points | undefined): number | null {
  const weighted = criteria.some((c) => c.weight !== null);
  let total = 0;
  for (const c of criteria) {
    const v = values(c.id);
    if (v === undefined || v === '' || v < c.min || v > c.max) return null;
    total += (v / c.max) * (weighted ? (c.weight ?? 0) : 100 / criteria.length);
  }
  return Math.round(total * 100) / 100;
}

interface RowProps {
  row: Row;
  criteria: Criterion[];
  edits: Record<number, Points> | undefined;
  locked: boolean;
  onChange: (candidateId: number, criterionId: number, value: Points) => void;
  onPhoto: (row: Row) => void;
}

// Memoized: typing in one input re-renders that row only, not the whole sheet.
const ScoreRow = memo(function ScoreRow({ row, criteria, edits, locked, onChange, onPhoto }: RowProps) {
  const value = (cid: number): Points | undefined => (edits && cid in edits ? edits[cid] : row.scores[cid]);
  const total = categoryTotal(criteria, value);
  return (
    <tr>
      <td className="n judge-number">{row.number}</td>
      <td className="judge-candidate">
        <div className="identity">
          {row.photoUrl ? <button type="button" className="photo-button" onClick={() => onPhoto(row)} aria-label={`Enlarge photo of ${row.name}`}>
            <CandidatePhoto src={row.thumbUrl} name={row.name} size={40} interactive={false} />
          </button> : <CandidatePhoto src={row.thumbUrl} name={row.name} size={40} />}
          <span className="name">{row.name}<span className="judge-mobile-number">No. {row.number}</span></span>
        </div>
      </td>
      {row.withdrawn ? <td colSpan={criteria.length + 1}><span className="pill neg">Withdrawn</span></td> : <>{criteria.map((cr) => {
        const v = value(cr.id) ?? '';
        const invalid = v !== '' && (v < cr.min || v > cr.max);
        return (
          <td key={cr.id} className="n">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min={cr.min}
              max={cr.max}
              value={v}
              disabled={locked}
              aria-invalid={invalid}
              aria-label={`${cr.name} for ${row.name}`}
              onChange={(e) => onChange(row.id, cr.id, e.target.value === '' ? '' : Number(e.target.value))}
            />
          </td>
        );
      })}
      <td className="n">{total === null ? <span className="muted">-</span> : total.toFixed(2)}</td></>}
    </tr>
  );
});

// On narrow phones, show one candidate at a time in reading order instead of a wide grid.
const ScoreCard = memo(function ScoreCard({ row, criteria, edits, locked, onChange, onPhoto }: RowProps) {
  const value = (cid: number): Points | undefined => (edits && cid in edits ? edits[cid] : row.scores[cid]);
  const total = categoryTotal(criteria, value);
  return (
    <article className="judge-score-card" aria-label={`${row.name}, candidate ${row.number}`}>
      <header className="judge-card-header">
        {row.photoUrl ? <button type="button" className="photo-button" onClick={() => onPhoto(row)} aria-label={`Enlarge photo of ${row.name}`}>
          <CandidatePhoto src={row.thumbUrl} name={row.name} size={40} />
        </button> : <CandidatePhoto src={row.thumbUrl} name={row.name} size={40} />}
        <div className="judge-card-identity"><span>Candidate {row.number}</span><h2>{row.name}</h2></div>
        <div className="judge-card-total"><span>Total</span><strong>{total === null ? '—' : total.toFixed(2)}</strong></div>
      </header>
      <div className="judge-card-criteria">
        {criteria.map((cr) => {
          const v = value(cr.id) ?? '';
          const invalid = v !== '' && (v < cr.min || v > cr.max);
          return (
            <label className="judge-card-criterion" key={cr.id}>
              <span className="judge-card-label"><strong>{cr.name}</strong><span>{cr.min}–{cr.max} points{cr.weight !== null && ` · ${cr.weight}%`}</span></span>
              <input type="number" inputMode="decimal" step="any" min={cr.min} max={cr.max} value={v} disabled={locked} aria-invalid={invalid} aria-label={`${cr.name} for ${row.name}`} onChange={(e) => onChange(row.id, cr.id, e.target.value === '' ? '' : Number(e.target.value))} />
            </label>
          );
        })}
      </div>
    </article>
  );
});

export function ScoreSheetPage() {
  const { user, logout } = useAuth();
  const sheet = useResource<Sheet>('/judge/sheet');
  const reloadRows = useRef<() => void>(() => {});
  // The tabulator opening or closing a round, toggling testing mode or letting this judge change scores
  // arrives as a live notice, so the sheet updates without the judge pressing anything.
  const refreshSheet = useDebouncedCallback(() => sheet.reload());
  useLiveUpdates(user?.eventId, (notice) => {
    if (notice.type === 'round' || notice.type === 'event' || notice.type === 'judges') { refreshSheet(); reloadRows.current(); }
  });
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Edits>({});
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [photo, setPhoto] = useState<Row | null>(null);
  const photoDialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<Map<string, { candidateId: number; criterionId: number; points: number | null }>>(new Map());
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const q = useDebounced(search);

  useEffect(() => {
    const dialog = photoDialog.current;
    if (photo && dialog && !dialog.open) dialog.showModal();
    else if (!photo && dialog?.open) dialog.close();
  }, [photo]);
  const openPhoto = useCallback((row: Row) => setPhoto(row), []);

  const categories = useMemo(() => (sheet.data?.rounds ?? []).flatMap((r) => r.categories.map((c) => ({ ...c, roundName: r.name }))), [sheet.data]);
  const category = categories.find((c) => c.id === categoryId) ?? null;
  // Only one round is open at a time; a pair-vote round shows the pair picker instead of the score table.
  const pairRound = sheet.data?.pairRounds[0] ?? null;

  // Start on the first category that still needs scores; move on when the open round changes.
  useEffect(() => {
    if (categories.length && !categories.some((c) => c.id === categoryId) && !pending.current.size && !inFlight.current) {
      setCategoryId((categories.find((c) => !c.submitted) ?? categories[0]).id);
    }
  }, [categories, categoryId, save.kind]);
  useEffect(() => setPage(1), [q, pageSize]);

  const rows = usePaginated<Row>(category ? `/judge/categories/${category.id}/candidates` : null, { page, pageSize, q });
  reloadRows.current = rows.reload;
  const locked = category?.submitted ?? false;
  const testingMode = sheet.data?.event.testingMode ?? false;
  const hasInvalidEdits = Boolean(category && Object.values(edits).some((row) => Object.entries(row).some(([criterionId, value]) => {
    const criterion = category.criteria.find((c) => c.id === Number(criterionId));
    return value !== '' && criterion !== undefined && (value < criterion.min || value > criterion.max);
  })));
  const orphanedEdits = categoryId !== null && !category && (pending.current.size > 0 || inFlight.current !== null);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (inFlight.current) return inFlight.current;
    if (!category) return pending.current.size === 0;
    if (pending.current.size === 0) return true;
    const categoryId = category.id;
    const saving = (async () => {
      while (pending.current.size > 0) {
        const scores = [...pending.current.values()];
        pending.current.clear();
        setSave({ kind: 'saving' });
        try {
          await api('/judge/scores', { method: 'PUT', body: JSON.stringify({ categoryId, scores }) });
        } catch (err) {
          for (const s of scores) {
            const key = `${s.candidateId}:${s.criterionId}`;
            if (!pending.current.has(key)) pending.current.set(key, s);
          }
          setSave({ kind: 'error', message: err instanceof Error ? err.message : 'Could not save' });
          return false;
        }
      }
      setSave({ kind: 'saved', at: new Date() });
      sheet.reload();
      return true;
    })();
    inFlight.current = saving;
    try {
      return await saving;
    } finally {
      if (inFlight.current === saving) inFlight.current = null;
    }
  }, [category, sheet]);

  // Debounced auto-save: one request after typing pauses for half a second. Out-of-range values are not sent.
  const queue = useCallback(
    (changes: Change[]) => {
      for (const { candidateId, criterionId, value } of changes) {
        const cr = category?.criteria.find((c) => c.id === criterionId);
        const valid = value === '' || (cr !== undefined && value >= cr.min && value <= cr.max);
        const key = `${candidateId}:${criterionId}`;
        if (valid) pending.current.set(key, { candidateId, criterionId, points: value === '' ? null : value });
        else pending.current.delete(key);
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 500);
    },
    [category, flush],
  );

  const onChange = useCallback(
    (candidateId: number, criterionId: number, value: Points) => {
      setEdits((prev) => ({ ...prev, [candidateId]: { ...prev[candidateId], [criterionId]: value } }));
      queue([{ candidateId, criterionId, value }]);
    },
    [queue],
  );

  // Browsers cannot guarantee an async save during unload; warn rather than promising it succeeded.
  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (pending.current.size || inFlight.current || hasInvalidEdits) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [flush, hasInvalidEdits]);

  // Testing mode shortcuts fill the candidates on this page only, then save.
  const fill = useCallback(
    (pick: (cr: Criterion, current: Points | undefined) => Points) => {
      if (!category || !rows.data || locked) return;
      const changes: Change[] = [];
      const next: Edits = { ...edits };
      for (const row of rows.data.items) {
        if (row.withdrawn) continue;
        next[row.id] = { ...next[row.id] };
        for (const cr of category.criteria) {
          const current = cr.id in next[row.id] ? next[row.id][cr.id] : row.scores[cr.id];
          const value = pick(cr, current);
          if (value !== current) changes.push({ candidateId: row.id, criterionId: cr.id, value });
          next[row.id][cr.id] = value;
        }
      }
      setEdits(next);
      queue(changes);
    },
    [category, rows.data, locked, edits, queue],
  );
  const handlers = useMemo(
    () => ({
      random: () => fill((cr, cur) => (cur === undefined || cur === '' ? cr.min + Math.floor(Math.random() * (cr.max - cr.min + 1)) : cur)),
      perfect: () => fill((cr) => cr.max),
    }),
    [fill],
  );
  useAutoInputShortcuts(testingMode && !locked, handlers);

  async function submit() {
    if (!category) return;
    if (hasInvalidEdits) {
      setSubmitError('Fix out-of-range scores before submitting.');
      return;
    }
    if (!(await flush())) return;
    if (!confirm(`Submit ${category.name}? Your scores lock, and only the tabulator can let you change them.`)) return;
    try {
      await api(`/judge/categories/${category.id}/submit`, { method: 'POST' });
      setSubmitError(null);
      setEdits({});
      sheet.reload();
      rows.reload();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not submit');
    }
  }

  async function switchCategory(id: number) {
    if (!category || id === category.id || switching) return;
    if (hasInvalidEdits) {
      setSubmitError('Fix out-of-range scores before switching categories.');
      return;
    }
    setSwitching(true);
    try {
      if (!(await flush())) return;
      setSubmitError(null);
      setEdits({});
      setSave({ kind: 'idle' });
      setCategoryId(id);
    } finally {
      setSwitching(false);
    }
  }

  const missing = category ? category.required - category.scored : 0;

  async function safeLogout() {
    if (hasInvalidEdits) {
      setSubmitError('Fix out-of-range scores before logging out.');
      return;
    }
    if (!(await flush())) {
      setSubmitError('Scores have not been saved. Retry saving before logging out.');
      return;
    }
    logout();
  }

  return (
    <div className="judge-app">
      <header className="judge-bar">
        <span className="brand" style={{ margin: 0, minWidth: 0 }}>
          <BrandLogo size={28} />
          <span className="event-name">{sheet.data?.event.name ?? ''}</span>
        </span>
        <span className="spacer" />
        {testingMode && <span className="pill warn">Testing mode</span>}
        <span className="hide-phone">{user?.name}</span>
        <button className="btn" onClick={() => void safeLogout()} disabled={switching}>
          Log out
        </button>
      </header>

      <main className="sheet judge-sheet">
        <div className="canvas">
          {orphanedEdits && <p className="error" role="alert">Your scoring category is no longer open, but this tab has unsaved scores. Keep it open and contact the tabulator.</p>}
          {sheet.error && (
            <p className="error">
              Couldn’t load your score sheet. <button className="link-btn" onClick={sheet.reload}>Retry</button>
            </p>
          )}
          {sheet.data && categories.length === 0 && !pairRound && (
            <div className="title-row">
              <div>
                <h1>{sheet.data.notScoring.length ? `You are not scoring ${sheet.data.notScoring.join(' or ')}` : 'No round is open'}</h1>
                <p className="sub">{sheet.data.notScoring.length ? 'The tabulator set the other judges to score it. Check again when the next round opens.' : 'The tabulator opens each round when it starts. Check again once they say it is open.'}</p>
              </div>
              <div className="actions">
                <button className="btn" onClick={sheet.reload}>
                  Check again
                </button>
              </div>
            </div>
          )}

          {pairRound && <PairVotePanel round={pairRound} onChange={sheet.reload} />}

          {!pairRound && category && (
            <>
              <div className="title-row">
                <div>
                  <h1>{category.name === category.roundName ? category.roundName : `${category.roundName}: ${category.name}`}</h1>
                  <p className="sub">
                    {locked
                      ? 'Submitted. Your scores are locked; ask the tabulator if one needs changing.'
                      : `${category.scored} of ${category.required} scores entered. Each total is out of 100.`}
                  </p>
                </div>
                <div className="actions">
                  <span className={save.kind === 'error' ? 'error' : 'meta'} aria-live="polite">
                    {save.kind === 'saving' && 'Saving…'}
                    {save.kind === 'saved' && `Saved ${timeFmt.format(save.at)}`}
                    {save.kind === 'error' && save.message}
                  </span>
                  {save.kind === 'error' && <button className="link-btn" onClick={() => void flush()}>Retry save</button>}
                  {!locked && (
                    <button className="btn primary" onClick={submit} disabled={missing > 0 || switching || hasInvalidEdits}>
                      Submit {category.name}
                    </button>
                  )}
                </div>
              </div>

              {categories.length > 1 && (
                <div className="tabs" role="tablist">
                  {categories.map((c) => (
                    <button key={c.id} role="tab" aria-selected={c.id === category.id} disabled={switching} onClick={() => void switchCategory(c.id)}>
                      {c.name}
                      <span className="count">{c.submitted ? 'Submitted' : `${c.scored}/${c.required}`}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="toolbar">
                <input className="input" type="search" placeholder="Find a candidate by name or number" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a candidate" />
                <span className="spacer" />
                {testingMode && !locked && <span className="muted hide-phone">Shift + J fills empty scores at random. Shift + P gives every score its max.</span>}
              </div>
              <p className="meta" style={{ marginBottom: 8 }}>Select a candidate's photo to enlarge it.</p>
              {submitError && <p className="error">{submitError}</p>}
              {!locked && missing > 0 && <p className="meta" style={{ marginBottom: 8 }}>You can submit once all {category.required} scores are in: {missing} to go.</p>}

              <p className="judge-scroll-hint">Scroll the score table sideways to see all criteria and totals.</p>
              <div className="table-wrap judge-table-wrap" role="region" aria-label="Score table, scroll horizontally to see all criteria" tabIndex={0}>
                <table className="judge-score-table" aria-busy={rows.loading}>
                  <thead>
                    <tr>
                      <th className="n judge-number" style={{ width: 56 }}>No.</th>
                      <th className="judge-candidate">Candidate</th>
                      {category.criteria.map((cr) => (
                        <th key={cr.id} className="n">
                          {cr.name}
                          <span className="sub">
                            {cr.min}-{cr.max} points{cr.weight !== null && `, ${cr.weight}%`}
                          </span>
                        </th>
                      ))}
                      <th className="n">Total</th>
                    </tr>
                  </thead>
                  <tbody className={rows.loading ? 'loading' : undefined}>
                    {rows.data?.items.map((row) => (
                      <ScoreRow key={row.id} row={row} criteria={category.criteria} edits={edits[row.id]} locked={locked || switching} onChange={onChange} onPhoto={openPhoto} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={rows.loading ? 'judge-score-cards loading' : 'judge-score-cards'} aria-busy={rows.loading}>
                {rows.data?.items.map((row) => (
                  <ScoreCard key={row.id} row={row} criteria={category.criteria} edits={edits[row.id]} locked={locked || switching} onChange={onChange} onPhoto={openPhoto} />
                ))}
              </div>
              {rows.data && rows.data.items.length === 0 && <div className="empty">No candidate matches this search.</div>}
              {rows.data && rows.data.total > 0 && (
                <Pagination page={rows.data.page} pageSize={rows.data.pageSize} total={rows.data.total} onPageChange={setPage} onPageSizeChange={setPageSize} />
              )}
            </>
          )}
        </div>
      </main>
      <dialog ref={photoDialog} className="candidate-photo-dialog" aria-label={photo ? `Photo of ${photo.name}` : 'Candidate photo'} onClose={() => setPhoto(null)}>
        {photo && <>
          <div className="title-row"><h2>No. {photo.number} {photo.name}</h2><button type="button" className="btn" onClick={() => setPhoto(null)}>Close</button></div>
          <img src={photo.photoUrl ?? undefined} alt={photo.name} />
        </>}
      </dialog>
    </div>
  );
}
