import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { EventDetail, Judge, RoundSummary } from '../../api/types';
import { Initial } from '../../components/Initial';
import { useResource } from '../../hooks/useResource';
import { formatDateTime, plural } from '../../lib/format';
import { useAdmin } from './AdminLayout';

type RungState = 'done' | 'current' | 'planned';

interface Rung {
  round: RoundSummary;
  field: number;
  /** True when the field is the real entry list, false when it is the cut planned by the round before. */
  actual: boolean;
  state: RungState;
}

/** Each round's field: its real entries once filled, otherwise the Top N the previous round sends on. */
function buildLadder(event: EventDetail): Rung[] {
  let carried = event._count.candidates;
  const firstOpen = event.rounds.find((r) => r.status !== 'CLOSED');
  return event.rounds.map((round) => {
    const actual = round._count.entries > 0;
    const field = actual ? round._count.entries : carried;
    carried = round.advanceCount ?? field;
    const state: RungState = round.status === 'CLOSED' ? 'done' : round.id === firstOpen?.id && actual ? 'current' : 'planned';
    return { round, field, actual, state };
  });
}

export function EventOverviewPage() {
  const { event, reloadEvent, reloadEvents } = useAdmin();
  const judges = useResource<Judge[]>(event ? `/events/${event.id}/judges` : null);

  if (!event) return <p className="muted">Loading event...</p>;

  const ladder = buildLadder(event);
  const current = ladder.find((r) => r.state === 'current');
  const max = Math.max(1, ...ladder.map((r) => r.field));
  const judgeList = judges.data ?? [];
  const submitted = judgeList.filter((j) => j.submittedScores > 0).length;
  const groupSummary = event.groups.map((g) => `${plural(g.values.length, g.name.toLowerCase())}`).join(', ');

  async function setTestingMode(on: boolean) {
    await api(`/events/${event!.id}`, { method: 'PATCH', body: JSON.stringify({ testingMode: on }) });
    reloadEvent();
    reloadEvents();
  }

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
          <button className="btn" onClick={() => setTestingMode(!event.testingMode)}>
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
              <div className="kpi-label">Judges</div>
              <div className="kpi-value">{event._count.judges}</div>
              <div className="kpi-note">{judges.data ? `${submitted} of ${judgeList.length} have submitted` : '-'}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Rounds</div>
              <div className="kpi-value">{event._count.rounds}</div>
              <div className="kpi-note">{current ? `${current.round.name} is open` : 'None open'}</div>
            </div>
          </div>

          <div className="panel">
            <header>
              <div>
                <h2>How the field narrows</h2>
                <p className="muted" style={{ marginTop: 4 }}>
                  {current
                    ? `${current.round.name} is open with ${plural(current.field, 'candidate')}. ${submitted} of ${judgeList.length} judges have submitted.`
                    : ladder.length
                      ? 'No round is open yet. Round entries are filled when a round opens.'
                      : 'Add rounds to see how many candidates each one keeps.'}
                </p>
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
                      <span className="sub">{round.kind === 'PAIR_VOTE' ? 'Pair vote' : round.status === 'OPEN' ? 'Open' : round.status === 'CLOSED' ? 'Closed' : 'Not started'}</span>
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
                {(['current', 'done', 'planned'] as const)
                  .filter((s) => ladder.some((r) => r.state === s))
                  .map((s) => (
                    <span key={s}>
                      <i className={`swatch ${s === 'done' ? '' : s}`} />
                      {s === 'current' ? 'Open now, real entries' : s === 'done' ? 'Closed' : 'Planned cut from the round before'}
                    </span>
                  ))}
              </div>
            )}

            {current && (
              <div className="form-actions" style={{ alignItems: 'center' }}>
                <button className="btn primary" disabled>
                  Close {current.round.name}
                </button>
                <span className="muted">Closing ranks the field and sends the Top {current.round.advanceCount ?? current.field} on. It unlocks once every judge has submitted.</span>
              </div>
            )}
          </div>
        </div>

        <aside className="stack">
          <div className="rail-block">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              Judges
              <Link className="link-btn" to="judges" style={{ fontWeight: 400 }}>
                Manage
              </Link>
            </div>
            <div className="panel" style={{ padding: '4px 16px' }}>
              {judges.error && <p className="error" style={{ padding: '12px 0' }}>Couldn't load judges. <button className="link-btn" onClick={judges.reload}>Retry</button></p>}
              {judges.data && judgeList.length === 0 && <p className="muted" style={{ padding: '12px 0' }}>No judges yet.</p>}
              <div className="rows">
                {judgeList.slice(0, 6).map((j, i) => (
                  <div className="row" key={j.id}>
                    <Initial name={j.name} index={i} />
                    <span className="grow">{j.name}</span>
                    <span className="end muted num">{j.submittedScores > 0 ? `${j.submittedScores} scores` : 'Not submitted'}</span>
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
