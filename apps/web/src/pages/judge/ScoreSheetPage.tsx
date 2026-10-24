import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { CandidatePhoto } from '../../components/CandidatePhoto';
import { Pagination } from '../../components/Pagination';
import { TallyMark } from '../../components/TallyMark';
import { useAutoInputShortcuts } from '../../hooks/useAutoInputShortcuts';
import { useDebounced } from '../../hooks/useDebounced';
import { usePaginated } from '../../hooks/usePaginated';
import { useResource } from '../../hooks/useResource';

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
}

interface Row {
  id: number;
  number: number;
  name: string;
  thumbUrl: string | null;
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
}

// Memoized: typing in one input re-renders that row only, not the whole sheet.
const ScoreRow = memo(function ScoreRow({ row, criteria, edits, locked, onChange }: RowProps) {
  const value = (cid: number): Points | undefined => (edits && cid in edits ? edits[cid] : row.scores[cid]);
  const total = categoryTotal(criteria, value);
  return (
    <tr>
      <td className="n">{row.number}</td>
      <td>
        <div className="identity">
          <CandidatePhoto src={row.thumbUrl} name={row.name} size={40} />
          <span className="name">{row.name}</span>
        </div>
      </td>
      {criteria.map((cr) => {
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
      <td className="n">{total === null ? <span className="muted">-</span> : total.toFixed(2)}</td>
    </tr>
  );
});

export function ScoreSheetPage() {
  const { user, logout } = useAuth();
  const sheet = useResource<Sheet>('/judge/sheet');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Edits>({});
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pending = useRef<Map<string, { candidateId: number; criterionId: number; points: number | null }>>(new Map());
  const timer = useRef<number | undefined>(undefined);
  const q = useDebounced(search);

  const categories = useMemo(() => (sheet.data?.rounds ?? []).flatMap((r) => r.categories.map((c) => ({ ...c, roundName: r.name }))), [sheet.data]);
  const category = categories.find((c) => c.id === categoryId) ?? null;

  // Start on the first category that still needs scores; move on when the open round changes.
  useEffect(() => {
    if (categories.length && !categories.some((c) => c.id === categoryId)) setCategoryId((categories.find((c) => !c.submitted) ?? categories[0]).id);
  }, [categories, categoryId]);
  useEffect(() => setPage(1), [q, pageSize, categoryId]);

  const rows = usePaginated<Row>(category ? `/judge/categories/${category.id}/candidates` : null, { page, pageSize, q });
  const locked = category?.submitted ?? false;
  const testingMode = sheet.data?.event.testingMode ?? false;

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!category || pending.current.size === 0) return;
    const scores = [...pending.current.values()];
    pending.current.clear();
    setSave({ kind: 'saving' });
    try {
      await api('/judge/scores', { method: 'PUT', body: JSON.stringify({ categoryId: category.id, scores }) });
      setSave({ kind: 'saved', at: new Date() });
      sheet.reload();
    } catch (err) {
      // Keep the unsaved values so the next change retries them.
      for (const s of scores) {
        const key = `${s.candidateId}:${s.criterionId}`;
        if (!pending.current.has(key)) pending.current.set(key, s);
      }
      setSave({ kind: 'error', message: err instanceof Error ? err.message : 'Could not save' });
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

  // Save what is pending if the judge closes the tab.
  useEffect(() => {
    const onLeave = () => void flush();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [flush]);

  // Testing mode shortcuts fill the candidates on this page only, then save.
  const fill = useCallback(
    (pick: (cr: Criterion, current: Points | undefined) => Points) => {
      if (!category || !rows.data || locked) return;
      const changes: Change[] = [];
      const next: Edits = { ...edits };
      for (const row of rows.data.items) {
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
    await flush();
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

  function switchCategory(id: number) {
    void flush();
    setEdits({});
    setCategoryId(id);
  }

  const missing = category ? category.required - category.scored : 0;

  return (
    <div className="judge-app">
      <header className="judge-bar">
        <span className="brand" style={{ margin: 0 }}>
          <TallyMark />
          Tally
        </span>
        <span className="muted hide-phone">{sheet.data?.event.name}</span>
        <span className="spacer" />
        {testingMode && <span className="pill warn">Testing mode</span>}
        <span className="hide-phone">{user?.name}</span>
        <button className="btn" onClick={logout}>
          Log out
        </button>
      </header>

      <main className="sheet judge-sheet">
        <div className="canvas">
          {sheet.error && (
            <p className="error">
              Couldn't load your score sheet. <button className="link-btn" onClick={sheet.reload}>Retry</button>
            </p>
          )}
          {sheet.data && categories.length === 0 && (
            <div className="title-row">
              <div>
                <h1>No round is open</h1>
                <p className="sub">The tabulator opens each round when it starts. Check again once they say it is open.</p>
              </div>
              <div className="actions">
                <button className="btn" onClick={sheet.reload}>
                  Check again
                </button>
              </div>
            </div>
          )}

          {category && (
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
                    {save.kind === 'saving' && 'Saving...'}
                    {save.kind === 'saved' && `Saved ${timeFmt.format(save.at)}`}
                    {save.kind === 'error' && save.message}
                  </span>
                  {!locked && (
                    <button className="btn primary" onClick={submit} disabled={missing > 0}>
                      Submit {category.name}
                    </button>
                  )}
                </div>
              </div>

              {categories.length > 1 && (
                <div className="tabs" role="tablist">
                  {categories.map((c) => (
                    <button key={c.id} role="tab" aria-selected={c.id === category.id} onClick={() => switchCategory(c.id)}>
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
              {submitError && <p className="error">{submitError}</p>}
              {!locked && missing > 0 && <p className="meta" style={{ marginBottom: 8 }}>You can submit once all {category.required} scores are in: {missing} to go.</p>}

              <div className="table-wrap">
                <table aria-busy={rows.loading}>
                  <thead>
                    <tr>
                      <th className="n" style={{ width: 56 }}>No.</th>
                      <th>Candidate</th>
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
                      <ScoreRow key={row.id} row={row} criteria={category.criteria} edits={edits[row.id]} locked={locked} onChange={onChange} />
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.data && rows.data.items.length === 0 && <div className="empty">No candidate matches this search.</div>}
              {rows.data && rows.data.total > 0 && (
                <Pagination page={rows.data.page} pageSize={rows.data.pageSize} total={rows.data.total} onPageChange={setPage} onPageSizeChange={setPageSize} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
