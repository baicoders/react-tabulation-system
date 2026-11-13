import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { EventDetail, RoundSummary } from '../../api/types';
import { CandidatePhoto } from '../../components/CandidatePhoto';
import { Initial } from '../../components/Initial';
import { useDebouncedCallback, useLiveUpdates } from '../../hooks/useLiveUpdates';
import { useResource } from '../../hooks/useResource';
import { formatDateTime, plural } from '../../lib/format';
import { useAdmin } from './AdminLayout';

type RungState = 'done' | 'current' | 'ready' | 'planned';

interface Rung {
  round: RoundSummary;
  field: number;
  /** True when the field is the real entry list, false when it is the cut planned by the round before. */
  actual: boolean;
  state: RungState;
}

interface Standing {
  candidateId: number;
  number: number;
  name: string;
  thumbUrl: string | null;
  score: number | null;
  rank: number | null;
  withdrawn?: boolean;
}

interface Tabulation {
  round: { id: number; name: string; status: string; kind: string; advanceCount: number | null };
  entries: number;
  complete: boolean;
  judges: { id: number; name: string; required: number; scored: number; done: boolean; categories?: { id: number; name: string; required: number; scored: number; submitted: boolean }[] }[];
  standings: Standing[];
  direction: 'asc' | 'desc';
  advancingIds: number[];
  tieAtCutLine: number[];
  /** The combined ranking the cut uses when it is based on more rounds than this one. */
  basis: { sources: { roundId: number; name: string; weight: number; closed: boolean }[]; names: string[]; standings: Standing[] } | null;
  adjustments: { id: number; candidateId: number; points: number; reason: string | null }[];
  pairs: PairTally[];
  pairTies: number[];
  unpaired: number;
}

interface FieldRow {
  candidateId: number;
  number: number;
  name: string;
  thumbUrl: string | null;
  status: 'ACTIVE' | 'WITHDRAWN';
  prevScore: number | null;
  prevRank: number | null;
  basisScore: number | null;
  basisRank: number | null;
}

interface FieldData {
  round: { id: number; name: string; order: number; status: string; kind: string; advanceCount: number | null };
  editable: boolean;
  previous: { id: number; name: string; closed: boolean; basisNames: string[] | null } | null;
  entries: (FieldRow & { score: number | null; rank: number | null; advanced: boolean | null })[];
  pool: FieldRow[];
}

interface AdjustmentRow {
  id: number;
  points: number;
  reason: string | null;
  candidate: { id: number; number: number; name: string };
}

interface PairSide {
  id: number;
  number: number;
  name: string;
  thumbUrl: string | null;
}

interface PairTally {
  id: number;
  a: PairSide;
  b: PairSide;
  castA: number;
  castB: number;
  votesA: number;
  votesB: number;
  winnerId: number | null;
  tied: boolean;
}

/** Pairs for a pair-vote round, and the live tally of judges' votes once they are set. */
function PairsPanel({
  roundName,
  tab,
  judges,
  busy,
  onSetPairs,
}: {
  roundName: string;
  tab: Tabulation;
  judges: number;
  busy: boolean;
  onSetPairs: (method: 'RANKED' | 'RANDOM') => void;
}) {
  const votesCast = tab.pairs.reduce((sum, p) => sum + p.castA + p.castB, 0);
  const side = (c: PairSide, won: boolean, right: boolean) => (
    <span className={right ? 'side right' : 'side'}>
      {!right && <CandidatePhoto src={c.thumbUrl} name={c.name} size={32} />}
      <span>
        <span className={won ? 'won' : undefined}>{c.name}</span>
        <span className="meta" style={{ display: 'block' }}>
          No. {c.number}
          {won ? ', wins' : ''}
        </span>
      </span>
      {right && <CandidatePhoto src={c.thumbUrl} name={c.name} size={32} />}
    </span>
  );

  return (
    <div className="panel">
      <header>
        <div>
          <h2>{tab.pairs.length ? `Votes in ${roundName}` : `Pairs for ${roundName}`}</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            {tab.pairs.length === 0
              ? `${plural(tab.entries, 'candidate')} make ${tab.entries / 2} pairs. Judges see them as soon as they are set.`
              : `${plural(votesCast, 'vote')} cast of ${tab.pairs.length * judges}. A pair's winner has the most submitted votes.`}
          </p>
        </div>
        {tab.pairs.length > 0 && votesCast === 0 && (
          <button className="link-btn" disabled={busy} onClick={() => onSetPairs('RANDOM')}>
            Draw again
          </button>
        )}
      </header>

      {tab.pairs.length === 0 ? (
        <div className="form-actions" style={{ marginTop: 0 }}>
          <button className="btn primary" disabled={busy || tab.entries % 2 !== 0} onClick={() => onSetPairs('RANKED')}>
            Pair by rank
          </button>
          <button className="btn" disabled={busy || tab.entries % 2 !== 0} onClick={() => onSetPairs('RANDOM')}>
            Draw pairs at random
          </button>
          <span className="muted">By rank puts the best of the round before against the lowest.</span>
        </div>
      ) : (
        <ol className="tally">
          {tab.pairs.map((p) => {
            const total = Math.max(1, judges);
            const lead = p.castA === p.castB ? null : p.castA > p.castB ? 'a' : 'b';
            return (
              <li key={p.id} className="tally-row">
                {side(p.a, p.winnerId === p.a.id, false)}
                <span className="bar">
                  <span className="split" aria-hidden="true">
                    <span className={lead === 'a' ? 'lead' : undefined} style={{ width: `${(p.castA / total) * 100}%` }} />
                    <span style={{ flex: 1, background: 'var(--rule)' }} />
                    <span className={lead === 'b' ? 'lead' : undefined} style={{ width: `${(p.castB / total) * 100}%` }} />
                  </span>
                  <span className="tally-count">
                    <span>{p.castA}</span>
                    {p.tied ? <span className="error">Tied</span> : <span />}
                    <span>{p.castB}</span>
                  </span>
                </span>
                {side(p.b, p.winnerId === p.b.id, true)}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** The chip showing what the round before (or its cut basis) says about a candidate. */
function FieldContext({ row }: { row: FieldRow }) {
  const rank = row.basisRank ?? row.prevRank;
  const score = row.basisRank !== null ? row.basisScore : row.prevScore;
  if (rank === null) return <span className="muted">-</span>;
  return (
    <span className="num">
      #{rank}
      {score !== null ? ` (${score.toFixed(1)})` : ''}
    </span>
  );
}

/** Who competes in a round: the field the admin shapes by hand when a cut is not (only) decided by scores. */
function FieldPanel({
  data,
  busy,
  onAdd,
  onRemove,
}: {
  data: FieldData;
  busy: boolean;
  onAdd: (candidateIds: number[]) => void;
  onRemove: (candidateId: number) => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const trimmed = search.trim().toLowerCase();
  const pool = data.pool.filter((c) => !trimmed || c.name.toLowerCase().includes(trimmed) || String(c.number) === trimmed);
  const contextHeader = data.previous?.basisNames ? `Basis, ${data.previous.basisNames.join(' + ')}` : 'Round before';
  const toggle = (candidateId: number) => setPicked((p) => (p.includes(candidateId) ? p.filter((x) => x !== candidateId) : [...p, candidateId]));

  return (
    <div className="panel">
      <header>
        <div>
          <h2>Who competes in {data.round.name}</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            {data.editable
              ? `${plural(data.entries.length, 'candidate')} in. Shape the field by hand: a judges' choice, a draw by lot on stage, or a last-minute change.`
              : `${plural(data.entries.length, 'candidate')}. This round is closed; reopen it to change the field.`}
          </p>
        </div>
      </header>

      {data.entries.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="n" style={{ width: 48 }}>No.</th>
                <th>Candidate</th>
                <th className="n">{contextHeader}</th>
                {data.round.status === 'CLOSED' && <th className="n">Result</th>}
                <th className="n">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.candidateId}>
                  <td className="n">{e.number}</td>
                  <td>
                    <div className="identity">
                      <CandidatePhoto src={e.thumbUrl} name={e.name} size={28} />
                      <span>
                        {e.name}
                        {e.status === 'WITHDRAWN' && <span className="pill">Withdrew</span>}
                      </span>
                    </div>
                  </td>
                  <td className="n"><FieldContext row={e} /></td>
                  {data.round.status === 'CLOSED' && (
                    <td className="n">{e.rank !== null ? `Rank ${e.rank}${e.score !== null ? `, ${e.score.toFixed(2)}` : ''}` : e.score !== null ? e.score.toFixed(2) : '-'}</td>
                  )}
                  <td className="n">
                    {data.editable && (
                      <button className="link-btn quiet" disabled={busy} onClick={() => onRemove(e.candidateId)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          {data.round.order === 1
            ? 'Opening this round adds every candidate. Remove anyone who is not competing here.'
            : `Nobody in ${data.round.name} yet. Add the candidates who go on from below.`}
        </div>
      )}

      {data.editable && (
        <div style={{ marginTop: 16 }}>
          <div className="toolbar" style={{ padding: 0 }}>
            <span className="section-title" style={{ marginBottom: 0 }}>Add to the field</span>
            <span className="spacer" />
            <input
              className="input"
              type="search"
              style={{ width: 220 }}
              placeholder="Find by name or number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Find a candidate to add"
            />
            <button
              className="btn"
              disabled={busy || picked.length === 0}
              onClick={() => {
                onAdd(picked);
                setPicked([]);
              }}
            >
              Add {picked.length > 0 ? `${picked.length} ` : ''}selected
            </button>
          </div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th className="n" style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Select everyone in the list"
                      checked={pool.length > 0 && picked.length === pool.length}
                      onChange={(e) => setPicked(e.target.checked ? pool.map((c) => c.candidateId) : [])}
                    />
                  </th>
                  <th className="n" style={{ width: 48 }}>No.</th>
                  <th>Candidate</th>
                  <th className="n">{contextHeader}</th>
                </tr>
              </thead>
              <tbody>
                {pool.map((c) => (
                  <tr key={c.candidateId}>
                    <td className="n">
                      <input type="checkbox" checked={picked.includes(c.candidateId)} onChange={() => toggle(c.candidateId)} aria-label={`Add ${c.name}`} />
                    </td>
                    <td className="n">{c.number}</td>
                    <td>
                      <div className="identity">
                        <CandidatePhoto src={c.thumbUrl} name={c.name} size={28} />
                        <span>
                          {c.name}
                          {c.status === 'WITHDRAWN' && <span className="pill">Withdrew</span>}
                        </span>
                      </div>
                    </td>
                    <td className="n"><FieldContext row={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pool.length === 0 && <div className="empty">Everyone matching is already in the field.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Points added to or taken off scores after tabulation: guideline penalties and last-minute fixes. */
function AdjustmentsPanel({
  roundName,
  rows,
  entries,
  busy,
  onAdd,
  onRemove,
}: {
  roundName: string;
  rows: AdjustmentRow[];
  entries: FieldData['entries'];
  busy: boolean;
  onAdd: (candidateId: number, points: number, reason: string) => void;
  onRemove: (adjustmentId: number) => void;
}) {
  const [candidateId, setCandidateId] = useState('');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');

  return (
    <div className="panel">
      <header>
        <div>
          <h2>Score adjustments in {roundName}</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            Points added or taken off after tabulation — guideline penalties and last-minute fixes. They count at full value in
            the round's score and its cut.
          </p>
        </div>
      </header>
      {rows.length > 0 && (
        <div className="rows">
          {rows.map((a) => (
            <div className="row" key={a.id}>
              <span className="grow">
                No. {a.candidate.number} {a.candidate.name}
                {a.reason && <span className="meta" style={{ display: 'block' }}>{a.reason}</span>}
              </span>
              <span className="num">{a.points > 0 ? `+${a.points}` : a.points}</span>
              <button className="link-btn quiet" disabled={busy} onClick={() => onRemove(a.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        className="toolbar"
        style={{ padding: rows.length > 0 ? '8px 0 0' : 0 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!candidateId || !points) return;
          onAdd(Number(candidateId), Number(points), reason.trim());
          setCandidateId('');
          setPoints('');
          setReason('');
        }}
      >
        <select className="input" value={candidateId} onChange={(e) => setCandidateId(e.target.value)} aria-label="Candidate">
          <option value="">Choose a candidate</option>
          {entries.map((en) => (
            <option key={en.candidateId} value={en.candidateId}>
              No. {en.number} {en.name}
            </option>
          ))}
        </select>
        <input className="input num" style={{ width: 88 }} type="number" step="any" placeholder="Points" value={points} onChange={(e) => setPoints(e.target.value)} aria-label="Points to add or take off" />
        <input className="input" style={{ width: 240 }} placeholder="Reason (shown on reports)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
        <button className="btn" type="submit" disabled={busy || !candidateId || !points}>
          Add adjustment
        </button>
      </form>
    </div>
  );
}

/** Each round's field: its real entries once filled, otherwise the Top N the previous round sends on. */
function buildLadder(event: EventDetail): Rung[] {
  let carried = event._count.candidates;
  return event.rounds.map((round) => {
    const actual = round._count.entries > 0;
    const field = actual ? round._count.entries : carried;
    carried = round.advanceCount ?? field;
    const state: RungState = round.status === 'OPEN' ? 'current' : round.status === 'CLOSED' ? 'done' : actual ? 'ready' : 'planned';
    return { round, field, actual, state };
  });
}

/** "Top 8 go on", "Final", or "Decided by hand" for a round whose cut is not a computed Top N. */
function cutLabel(round: RoundSummary, isLast: boolean): string {
  return round.advanceCount ? `Top ${round.advanceCount} go on` : isLast ? 'Final' : 'Decided by hand';
}

const STATE_LABEL: Record<RungState, string> = { current: 'Open now', done: 'Closed', ready: 'Ready to open', planned: 'Not started' };

export function EventOverviewPage() {
  const { event, reloadEvent, reloadEvents } = useAdmin();
  const ladder = event ? buildLadder(event) : [];
  const open = ladder.find((r) => r.state === 'current');
  const tab = useResource<Tabulation>(open ? `/rounds/${open.round.id}/tabulation` : null);
  // The field of the round that can still be shaped: the open one, or the next one before it starts.
  const upcoming = !open ? ladder.find((r, i) => r.state !== 'done' && (i === 0 || ladder[i - 1].state === 'done')) : undefined;
  const fieldRung = open ?? upcoming;
  const field = useResource<FieldData>(fieldRung ? `/rounds/${fieldRung.round.id}/field` : null);
  const adjustments = useResource<AdjustmentRow[]>(open ? `/rounds/${open.round.id}/adjustments` : null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [tie, setTie] = useState<number[] | null>(null);

  // Live updates: the server pushes a notice the moment a judge saves or a round changes, and only the data
  // reloads, never the page. A burst of notices (a judge saving a page) becomes one reload.
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const refreshScores = useDebouncedCallback(() => {
    tab.reload();
    setUpdatedAt(new Date());
  });
  const refreshAll = useDebouncedCallback(() => {
    reloadEvent();
    reloadEvents();
    tab.reload();
    field.reload();
    adjustments.reload();
    setUpdatedAt(new Date());
  });
  const live = useLiveUpdates(event?.id, (notice) => (notice.type === 'round' || notice.type === 'event' ? refreshAll() : refreshScores()));

  // Fallback while the stream is reconnecting: ask every 15 seconds instead.
  useEffect(() => {
    if (!open || live) return;
    const timer = window.setInterval(tab.reload, 15000);
    return () => window.clearInterval(timer);
  }, [open?.round.id, live, tab.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!event) return <p className="muted">Loading event…</p>;

  const max = Math.max(1, ...ladder.map((r) => r.field));
  const lastClosed = [...ladder].reverse().find((r) => r.state === 'done');
  const nextToOpen = !open ? ladder.find((r, i) => r.state !== 'done' && (i === 0 || ladder[i - 1].state === 'done')) : undefined;
  const t = tab.data && open && tab.data.round.id === open.round.id ? tab.data : null;
  // In a pair-vote round every judge votes; in a scored round, the judges assigned to its categories.
  const scoringJudges = t ? (t.round.kind === 'PAIR_VOTE' ? t.judges : t.judges.filter((j) => j.required > 0)) : [];
  const doneJudges = scoringJudges.filter((j) => j.done).length;
  const groupSummary = event.groups.map((g) => plural(g.values.length, g.name.toLowerCase())).join(', ');

  async function run(action: () => Promise<unknown>, after?: string) {
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      await action();
      if (after) setMessage(after);
      setTie(null);
      reloadEvent();
      reloadEvents();
      tab.reload();
      field.reload();
      adjustments.reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const tieIds = err.body.tie;
        if (Array.isArray(tieIds)) setTie(tieIds as number[]);
      }
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const openRound = (r: RoundSummary) => run(() => api(`/rounds/${r.id}/open`, { method: 'POST' }), `${r.name} is open. Judges can score it now.`);
  const closeRound = (includeTies: boolean) =>
    open &&
    run(async () => {
      const res = await api<{ advanced: number; manualAdvancement: boolean; nextRound: { name: string } | null }>(`/rounds/${open.round.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ includeTies }),
      });
      setMessage(
        res.nextRound && !res.manualAdvancement
          ? `${open.round.name} is closed. ${res.advanced} candidates go on to ${res.nextRound.name}.`
          : res.nextRound
            ? `${open.round.name} is closed. Choose who goes on to ${res.nextRound.name} by hand, in Who competes below.`
            : `${open.round.name} is closed.`,
      );
    });
  const reopen = (r: RoundSummary) => {
    if (!confirm(`Reopen ${r.name}? Its results are cleared and the next round is emptied until it closes again.`)) return;
    void run(() => api(`/rounds/${r.id}/reopen`, { method: 'POST' }), `${r.name} is open again.`);
  };
  const allowChanges = (judge: { id: number; name: string }) => {
    if (!open || !confirm(`Let ${judge.name} change their scores in ${open.round.name}? They must submit again afterwards.`)) return;
    void run(() => api(`/rounds/${open.round.id}/judges/${judge.id}/unlock`, { method: 'POST' }), `${judge.name} can change their scores again.`); // taste-skill-ignore: API path, not copy
  };
  const allowCategoryChanges = (judge: { id: number; name: string }, category: { id: number; name: string }) => {
    if (!confirm(`Let ${judge.name} change their scores in ${category.name}? They must submit that category again; other categories stay submitted.`)) return;
    void run(() => api(`/categories/${category.id}/judges/${judge.id}/unlock`, { method: 'POST' }), `${judge.name} can change ${category.name} again.`);
  };
  // Rehearsal clean-up: every score, vote, pair and round result goes; candidates, rounds and judges stay.
  const startOver = () => {
    if (!confirm(`Start ${event.name} over? Every score and vote is deleted and all rounds go back to not started. Candidates, rounds and judges stay.`)) return;
    void run(() => api(`/events/${event.id}/start-over`, { method: 'POST' }), 'Started over. Every round is back to not started.');
  };
  const setStatus = (status: 'ACTIVE' | 'CLOSED') => {
    const ask =
      status === 'ACTIVE'
        ? `Make ${event.name} live? Judges can then log in to it.`
        : `Finish ${event.name}? Judges can no longer log in. Results and reports stay.`;
    if (!confirm(ask)) return;
    void run(() => api(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }), status === 'ACTIVE' ? 'The event is live. Judges can log in.' : 'The event is finished.');
  };

  // The finding under the ladder's title: what the tabulator needs to know right now.
  const finding = open
    ? t
      ? open.round.kind === 'PAIR_VOTE' && t.pairs.length === 0
        ? `${open.round.name} is open with ${plural(open.field, 'candidate')}. Set the pairs so judges can vote.`
        : t.complete
        ? `All ${scoringJudges.length} judges have submitted ${open.round.name}. Ready to close.`
        : `${open.round.name} is open with ${plural(open.field, 'candidate')}. ${doneJudges} of ${scoringJudges.length} judges have submitted.`
      : `${open.round.name} is open.`
    : nextToOpen
      ? `${nextToOpen.round.name} is next${nextToOpen.actual ? ` with ${plural(nextToOpen.field, 'candidate')}` : ''}. Open it when the segment starts.`
      : ladder.length
        ? 'Every round is closed.'
        : 'Add rounds to see how many candidates each one keeps.';

  const cut = open?.round.advanceCount ?? null;
  // Show the Top N plus three below the cut, so the cut line is always visible.
  const shown = t ? t.standings.slice(0, Math.max(t.advancingIds.length, cut ?? 10) + 3) : [];

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>{event.name}</h1>
          <p className="sub">
            {formatDateTime(event.date)}
            {event.venue ? ` at ${event.venue}` : ''}
            {'. '}
            {event.status === 'ACTIVE' ? 'Live: judges can log in.' : event.status === 'CLOSED' ? 'Finished.' : 'Setting up: judges cannot log in until it goes live.'}
          </p>
        </div>
        <div className="actions">
          {event.testingMode && (
            <button className="btn ghost" onClick={startOver} disabled={busy}>
              Start over
            </button>
          )}
          <button className="btn" onClick={() => run(() => api(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify({ testingMode: !event.testingMode }) }))} disabled={busy}>
            {event.testingMode ? 'Turn off testing mode' : 'Turn on testing mode'}
          </button>
          {event.status === 'ACTIVE' ? (
            <button className="btn" onClick={() => setStatus('CLOSED')} disabled={busy}>
              Finish event
            </button>
          ) : (
            <button className="btn primary" onClick={() => setStatus('ACTIVE')} disabled={busy}>
              {event.status === 'CLOSED' ? 'Make live again' : 'Go live'}
            </button>
          )}
        </div>
      </div>

      <div className="with-rail">
        <div className="stack">
          <div className="kpis">
            <div className="kpi">
              <div className="kpi-label">Candidates</div>
              <div className="kpi-value">{event._count.candidates}</div>
              <div className="kpi-note">{groupSummary || 'No groups yet'}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Judges submitted</div>
              <div className="kpi-value">
                {open && t ? doneJudges : '-'}
                {open && t && <small>/{scoringJudges.length}</small>}
              </div>
              <div className="kpi-note">{open ? `in ${open.round.name}` : 'No round open'}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Rounds closed</div>
              <div className="kpi-value">
                {ladder.filter((r) => r.state === 'done').length}
                <small>/{ladder.length}</small>
              </div>
              <div className="kpi-note">{lastClosed ? `Last: ${lastClosed.round.name}` : 'None yet'}</div>
            </div>
          </div>

          <div className="panel">
            <header>
              <div>
                <h2>How the field narrows</h2>
                <p className="muted" style={{ marginTop: 4 }}>{finding}</p>
              </div>
              <span className="meta" style={{ whiteSpace: 'nowrap' }} role="status">
                {live
                  ? `Live${updatedAt ? `, updated ${updatedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : ''}`
                  : 'Reconnecting… checking every 15 seconds'}
              </span>
            </header>

            {ladder.length === 0 ? (
              <div className="empty">
                <span>
                  No rounds yet. <Link className="link-btn" to="rounds">Add the first round</Link>
                </span>
              </div>
            ) : (
              <ol className="ladder">
                {ladder.map(({ round, field, actual, state }) => (
                  <li key={round.id} className="rung" data-state={state}>
                    <span className="rung-name">
                      {round.name}
                      <span className="sub">{round.kind === 'PAIR_VOTE' && state !== 'done' ? `Pair vote, ${STATE_LABEL[state].toLowerCase()}` : STATE_LABEL[state]}</span>
                    </span>
                    <span className="rung-track" aria-hidden="true">
                      <span className="rung-bar" style={{ display: 'block', width: `${(field / max) * 100}%` }} />
                    </span>
                    <span className="rung-count">
                      {field}
                      {!actual && <span className="visually-hidden"> planned</span>}
                      <span className="sub">{cutLabel(round, round.id === ladder[ladder.length - 1]?.round.id)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {ladder.length > 0 && (
              <div className="legend" style={{ marginTop: 12 }}>
                {(['current', 'done', 'ready', 'planned'] as const)
                  .filter((s) => ladder.some((r) => r.state === s))
                  .map((s) => (
                    <span key={s}>
                      <i className={`swatch ${s === 'done' ? '' : s}`} />
                      {s === 'planned' ? 'Planned cut from the round before' : s === 'ready' ? 'Ready to open, field set' : STATE_LABEL[s]}
                    </span>
                  ))}
              </div>
            )}

            <div className="form-actions" style={{ alignItems: 'center' }}>
              {open && (
                <>
                  <button className="btn primary" disabled={busy || !t?.complete} onClick={() => closeRound(false)}>
                    Close {open.round.name}
                  </button>
                  <span className="muted">
                    {t?.complete
                      ? open.round.kind === 'PAIR_VOTE'
                        ? cut
                          ? `Sends the ${cut} pair winners on.`
                          : 'Ranks the pairs. Who goes on is decided by hand.'
                        : cut
                          ? `Ranks the field and sends the Top ${cut} on.`
                          : 'Ranks the field. Who goes on is decided by hand.'
                      : open.round.kind === 'PAIR_VOTE' && t && t.pairs.length === 0
                        ? 'Set the pairs first.'
                        : t && t.pairTies.length > 0
                          ? 'A pair is tied on votes; a judge needs to change a vote.'
                          : 'Available once every judge has submitted.'}
                  </span>
                </>
              )}
              {!open && nextToOpen && (
                <button className="btn primary" disabled={busy} onClick={() => openRound(nextToOpen.round)}>
                  Open {nextToOpen.round.name}
                </button>
              )}
              {!open && lastClosed && (
                <button className="link-btn" disabled={busy} onClick={() => reopen(lastClosed.round)}>
                  Reopen {lastClosed.round.name}
                </button>
              )}
            </div>
            {message && (
              <p className={failed ? 'error' : 'muted'} style={{ marginTop: 8 }} role="status">
                {message}
              </p>
            )}
            {tie && open && (
              <div className="notice" style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>
                  {tie.length} candidates share the rank at the Top {cut} line, so {t?.advancingIds.length} would go on instead of {cut}.
                </span>
                <button className="btn" onClick={() => closeRound(true)} disabled={busy}>
                  Send all {t?.advancingIds.length} on
                </button>
              </div>
            )}
          </div>

          {open && t && open.round.kind === 'PAIR_VOTE' && (
            <PairsPanel
              roundName={open.round.name}
              tab={t}
              judges={scoringJudges.length}
              busy={busy}
              onSetPairs={(method) =>
                run(
                  () => api(`/rounds/${open.round.id}/pairs`, { method: 'POST', body: JSON.stringify({ method }) }),
                  method === 'RANDOM' ? 'Pairs drawn at random.' : 'Pairs set by rank: the best of the round before meets the lowest.',
                )
              }
            />
          )}

          {open && t && open.round.kind === 'SCORED' && (
            <div className="panel">
              <header>
                <div>
                  <h2>Standings in {open.round.name}</h2>
                  <p className="muted" style={{ marginTop: 4 }}>
                    {t.standings.length === 0
                      ? 'Standings appear as judges submit.'
                      : `From ${plural(doneJudges, 'submitted judge')} so far. ${t.direction === 'asc' ? 'Rank-sum: lower is better.' : 'Average out of 100.'}`}
                  </p>
                </div>
                {t.standings.length > shown.length && <span className="meta">Top {shown.length} of {t.standings.length}</span>}
              </header>
              {t.standings.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="n" style={{ width: 48 }}>Rank</th>
                        <th className="n" style={{ width: 48 }}>No.</th>
                        <th>Candidate</th>
                        <th className="n">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((s, i) => {
                        const cutAfter = cut !== null && i === t.advancingIds.length - 1 && i < shown.length - 1;
                        return (
                          <tr key={s.candidateId} style={cutAfter ? { borderBottom: '2px dashed var(--control)' } : undefined}>
                            <td className="n">{s.rank ?? '-'}</td>
                            <td className="n">{s.number}</td>
                            <td>
                              <div className="identity">
                                <CandidatePhoto src={s.thumbUrl} name={s.name} size={28} />
                                <span>
                                  {s.name}
                                  {s.withdrawn && <span className="pill">Withdrew</span>}
                                </span>
                              </div>
                            </td>
                            <td className="n">{s.score === null ? '-' : s.score.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {cut !== null && <p className="meta" style={{ marginTop: 8 }}>The dashed line is the Top {cut} cut.</p>}
                </div>
              )}
            </div>
          )}
          {t?.basis && (
            <div className="panel">
              <header>
                <div>
                  <h2>{cut ? `Basis for the Top ${cut} cut` : 'Combined ranking'}</h2>
                  <p className="muted" style={{ marginTop: 4 }}>
                    {t.basis.names.join(' + ')}
                    {t.basis.sources.some((s) => !s.closed && s.roundId !== t.round.id) && ' — a round in the basis is not closed yet'}
                    {'. Each score times its weight, added up.'}
                  </p>
                </div>
              </header>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="n" style={{ width: 48 }}>Rank</th>
                      <th className="n" style={{ width: 48 }}>No.</th>
                      <th>Candidate</th>
                      <th className="n">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.basis.standings.slice(0, cut ? cut + 3 : 12).map((s, i) => (
                      <tr key={s.candidateId} style={cut !== null && i === cut - 1 ? { borderBottom: '2px dashed var(--control)' } : undefined}>
                        <td className="n">{s.rank ?? '-'}</td>
                        <td className="n">{s.number}</td>
                        <td>
                          <div className="identity">
                            <CandidatePhoto src={s.thumbUrl} name={s.name} size={28} />
                            <span>{s.name}</span>
                          </div>
                        </td>
                        <td className="n">{s.score === null ? '-' : s.score.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cut !== null && <p className="meta" style={{ marginTop: 8 }}>The dashed line is the Top {cut} cut.</p>}
              </div>
            </div>
          )}

          {open && t && (
            <AdjustmentsPanel
              roundName={open.round.name}
              rows={adjustments.data ?? []}
              entries={field.data?.entries ?? []}
              busy={busy}
              onAdd={(candidateId, points, reason) =>
                run(
                  () => api(`/rounds/${open.round.id}/adjustments`, { method: 'POST', body: JSON.stringify({ candidateId, points, reason: reason || undefined }) }),
                  'Adjustment saved. It counts from the next tabulation.',
                )
              }
              onRemove={(adjustmentId) => run(() => api(`/adjustments/${adjustmentId}`, { method: 'DELETE' }), 'Adjustment removed.')}
            />
          )}

          {field.data && (
            <FieldPanel
              data={field.data}
              busy={busy}
              onAdd={(candidateIds) => run(() => api(`/rounds/${field.data!.round.id}/entries`, { method: 'POST', body: JSON.stringify({ candidateIds }) }), 'Field updated.')}
              onRemove={(candidateId) => {
                const row = field.data!.entries.find((e) => e.candidateId === candidateId);
                if (!confirm(`Remove No. ${row?.number} ${row?.name} from ${field.data!.round.name}?`)) return;
                void run(() => api(`/rounds/${field.data!.round.id}/entries/${candidateId}`, { method: 'DELETE' }), 'Field updated.');
              }}
            />
          )}
        </div>

        <aside className="stack">
          <div className="rail-block">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              {open ? `Judges in ${open.round.name}` : 'Judges'}
              <Link className="link-btn" to="judges" style={{ fontWeight: 400 }}>
                Manage
              </Link>
            </div>
            <div className="panel" style={{ padding: '4px 16px' }}>
              {tab.error && (
                <p className="error" style={{ padding: '12px 0' }}>
                  Couldn’t load progress. <button className="link-btn" onClick={tab.reload}>Retry</button>
                </p>
              )}
              {!open && <p className="muted" style={{ padding: '12px 0' }}>{plural(event._count.judges, 'judge')}. Progress shows here while a round is open.</p>}
              {open && !t && !tab.error && <p className="muted" style={{ padding: '12px 0' }}>Loading progress…</p>}
              <div className="rows">
                {scoringJudges.map((j, i) => (
                  <div className="row" key={j.id}>
                    <Initial name={j.name} index={i} />
                    <span className="grow">
                      {j.name}
                      {j.done && (j.categories?.length ?? 0) <= 1 && (
                        <button className="link-btn quiet" style={{ display: 'block', fontSize: 12 }} onClick={() => allowChanges(j)}>
                          Allow changes
                        </button>
                      )}
                      {(j.categories?.length ?? 0) > 1 && j.categories?.map((c) => (
                        <span key={c.id} className="meta" style={{ display: 'block' }}>
                          {c.name}: {c.submitted ? 'Submitted' : `${c.scored}/${c.required}`}
                          {c.submitted && <> · <button className="link-btn quiet" onClick={() => allowCategoryChanges(j, c)}>Allow changes</button></>}
                        </span>
                      ))}
                    </span>
                    {j.done ? <span className="pill pos">Submitted</span> : <span className="end muted num">{j.scored}/{j.required}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {event.groups.map((g) => {
            const total = g.values.reduce((sum, v) => sum + (v._count?.candidates ?? 0), 0);
            // Bars show each value's share of the whole field, so equal houses read as equal thirds.
            const top = Math.max(1, event._count.candidates);
            return (
              <div className="rail-block" key={g.id}>
                <div className="section-title">Candidates by {g.name.toLowerCase()}</div>
                <div className="panel" style={{ padding: '4px 16px' }}>
                  <div className="rows">
                    {g.values.map((v) => (
                      <div className="row" key={v.id} style={{ display: 'block' }}>
                        <div style={{ display: 'flex' }}>
                          <span>{v.name}</span>
                          <span className="end num">{v._count?.candidates ?? 0}</span>
                        </div>
                        <div className="share">
                          <span style={{ width: `${((v._count?.candidates ?? 0) / top) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="meta" style={{ padding: '4px 0 12px' }}>
                    {total} of {event._count.candidates} candidates have a {g.name.toLowerCase()}
                  </p>
                </div>
              </div>
            );
          })}
        </aside>
      </div>
    </section>
  );
}
