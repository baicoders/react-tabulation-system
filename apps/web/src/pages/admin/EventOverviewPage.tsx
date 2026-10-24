import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { EventDetail, RoundSummary } from '../../api/types';
import { CandidatePhoto } from '../../components/CandidatePhoto';
import { Initial } from '../../components/Initial';
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

interface Tabulation {
  round: { id: number; name: string; status: string; kind: string; advanceCount: number | null };
  entries: number;
  complete: boolean;
  judges: { id: number; name: string; required: number; scored: number; done: boolean }[];
  standings: { candidateId: number; number: number; name: string; thumbUrl: string | null; score: number; rank: number; deduction: number }[];
  direction: 'asc' | 'desc';
  advancingIds: number[];
  tieAtCutLine: number[];
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

const STATE_LABEL: Record<RungState, string> = { current: 'Open now', done: 'Closed', ready: 'Ready to open', planned: 'Not started' };

export function EventOverviewPage() {
  const { event, reloadEvent, reloadEvents } = useAdmin();
  const ladder = event ? buildLadder(event) : [];
  const open = ladder.find((r) => r.state === 'current');
  const tab = useResource<Tabulation>(open ? `/rounds/${open.round.id}/tabulation` : null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tie, setTie] = useState<number[] | null>(null);

  // Live progress while a round is open: judges' counts and standings refresh every 5 seconds.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(tab.reload, 5000);
    return () => window.clearInterval(timer);
  }, [open?.round.id, tab.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!event) return <p className="muted">Loading event...</p>;

  const max = Math.max(1, ...ladder.map((r) => r.field));
  const lastClosed = [...ladder].reverse().find((r) => r.state === 'done');
  const nextToOpen = !open ? ladder.find((r, i) => r.state !== 'done' && (i === 0 || ladder[i - 1].state === 'done')) : undefined;
  const t = tab.data && open && tab.data.round.id === open.round.id ? tab.data : null;
  const scoringJudges = t?.judges.filter((j) => j.required > 0) ?? [];
  const doneJudges = scoringJudges.filter((j) => j.done).length;
  const groupSummary = event.groups.map((g) => plural(g.values.length, g.name.toLowerCase())).join(', ');

  async function run(action: () => Promise<unknown>, after?: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (after) setMessage(after);
      setTie(null);
      reloadEvent();
      reloadEvents();
      tab.reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const tieIds = err.body.tie;
        if (Array.isArray(tieIds)) setTie(tieIds as number[]);
      }
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const openRound = (r: RoundSummary) => run(() => api(`/rounds/${r.id}/open`, { method: 'POST' }), `${r.name} is open. Judges can score it now.`);
  const closeRound = (includeTies: boolean) =>
    open &&
    run(async () => {
      const res = await api<{ advanced: number; nextRound: { name: string } | null }>(`/rounds/${open.round.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ includeTies }),
      });
      setMessage(
        res.nextRound && open.round.advanceCount
          ? `${open.round.name} is closed. ${res.advanced} candidates go on to ${res.nextRound.name}.`
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
  const resetTestScores = () => {
    if (!open || !confirm(`Delete every test score in ${open.round.name}? Judges start this round again.`)) return;
    void run(() => api(`/rounds/${open.round.id}/reset-scores`, { method: 'POST', body: JSON.stringify({ testOnly: true }) }), 'Test scores deleted.');
  };

  // The finding under the ladder's title: what the tabulator needs to know right now.
  const finding = open
    ? t
      ? t.complete
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
          </p>
        </div>
        <div className="actions">
          {event.testingMode && open && (
            <button className="btn ghost" onClick={resetTestScores} disabled={busy}>
              Delete test scores
            </button>
          )}
          <button className="btn" onClick={() => run(() => api(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify({ testingMode: !event.testingMode }) }))} disabled={busy}>
            {event.testingMode ? 'Turn off testing mode' : 'Turn on testing mode'}
          </button>
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
                      <span className="sub">{round.advanceCount ? `Top ${round.advanceCount} go on` : 'Final'}</span>
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
                  <button className="btn primary" disabled={busy || !t?.complete || open.round.kind === 'PAIR_VOTE'} onClick={() => closeRound(false)}>
                    Close {open.round.name}
                  </button>
                  <span className="muted">
                    {open.round.kind === 'PAIR_VOTE'
                      ? 'Pair-vote rounds cannot be closed here yet.'
                      : t?.complete
                        ? `Ranks the field and sends the Top ${cut ?? open.field} on.`
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
              <p className={tie || message.startsWith('Waiting') || message.includes('first') ? 'error' : 'muted'} style={{ marginTop: 8 }} role="status">
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

          {open && t && (
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
                        <th className="n">Deduction</th>
                        <th className="n">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((s, i) => {
                        const cutAfter = cut !== null && i === t.advancingIds.length - 1 && i < shown.length - 1;
                        return (
                          <tr key={s.candidateId} style={cutAfter ? { borderBottom: '2px dashed var(--control)' } : undefined}>
                            <td className="n">{s.rank}</td>
                            <td className="n">{s.number}</td>
                            <td>
                              <div className="identity">
                                <CandidatePhoto src={s.thumbUrl} name={s.name} size={28} />
                                <span>{s.name}</span>
                              </div>
                            </td>
                            <td className="n">{s.deduction ? `-${s.deduction.toFixed(2)}` : <span className="muted">-</span>}</td>
                            <td className="n">{s.score.toFixed(2)}</td>
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
                  Couldn't load progress. <button className="link-btn" onClick={tab.reload}>Retry</button>
                </p>
              )}
              {!open && <p className="muted" style={{ padding: '12px 0' }}>{plural(event._count.judges, 'judge')}. Progress shows here while a round is open.</p>}
              {open && !t && !tab.error && <p className="muted" style={{ padding: '12px 0' }}>Loading progress...</p>}
              <div className="rows">
                {scoringJudges.map((j, i) => (
                  <div className="row" key={j.id}>
                    <Initial name={j.name} index={i} />
                    <span className="grow">
                      {j.name}
                      {j.done && (
                        <button className="link-btn quiet" style={{ display: 'block', fontSize: 12 }} onClick={() => allowChanges(j)}>
                          Allow changes
                        </button>
                      )}
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
