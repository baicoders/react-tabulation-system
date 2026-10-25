import { useMemo, useState, type ReactNode } from 'react';
import type { EventDetail, Group } from '../../api/types';
import { CandidatePhoto } from '../../components/CandidatePhoto';
import { useBranding } from '../../branding/BrandingContext';
import { BrandLogo } from '../../components/BrandLogo';
import { useDebounced } from '../../hooks/useDebounced';
import { useResource } from '../../hooks/useResource';
import { downloadExcel, type Cell } from '../../lib/exportExcel';
import { formatDate, formatDateTime } from '../../lib/format';

interface ViewProps {
  event: EventDetail;
  params: URLSearchParams;
  set: (changes: Record<string, string | null>) => void;
  /** Goes up on every live notice; adding it to a request makes the open report reload its data. */
  version: number;
}

const live = (path: string, version: number) => `${path}${path.includes('?') ? '&' : '?'}v=${version}`;

interface ReportCandidate {
  id: number;
  number: number;
  name: string;
  thumbUrl: string | null;
  groups: { id: number; name: string; groupId: number }[];
}

const fmt = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? '-' : n.toFixed(digits));
const groupNames = (c: ReportCandidate) => c.groups.map((g) => g.name).join(' · ');

function groupLabel(groups: Group[], id: string | null): string | null {
  if (!id) return null;
  for (const g of groups) for (const v of g.values) if (String(v.id) === id) return `${g.name}: ${v.name}`;
  return null;
}

/** "All candidates" or one value of any group, so every ranking can be split by house, level or type. */
function GroupSelect({ groups, value, onChange }: { groups: Group[]; value: string | null; onChange: (v: string | null) => void }) {
  if (groups.length === 0) return null;
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Split by group">
      <option value="">All candidates</option>
      {groups.map((g) => (
        <optgroup key={g.id} label={g.name}>
          {g.values.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} only
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** The report's own heading: on screen with Print and Excel, on paper under the event's letterhead. */
function ReportHead({ event, title, sub, controls, onExcel, disabled }: { event: EventDetail; title: string; sub?: ReactNode; controls?: ReactNode; onExcel: () => void; disabled?: boolean }) {
  return (
    <>
      <div className="toolbar no-print">
        {controls}
        <span className="spacer" />
        <button className="btn" onClick={() => window.print()} disabled={disabled}>
          Print
        </button>
        <button className="btn" onClick={onExcel} disabled={disabled}>
          Download Excel
        </button>
      </div>
      <header className="report-head">
        <Letterhead event={event} />
        <h2 className="report-title">{title}</h2>
        {sub && <p className="muted">{sub}</p>}
        <p className="print-only meta">Printed {formatDateTime(new Date().toISOString())}</p>
      </header>
    </>
  );
}

/** Printed reports open with the school's letterhead: logo, organization, then the event, date and venue, over a rule in the brand colour. */
function Letterhead({ event }: { event: EventDetail }) {
  const { branding } = useBranding();
  const when = [event.date ? formatDate(event.date) : null, event.venue].filter(Boolean).join(', ');
  return (
    <div className="print-brand">
      <BrandLogo size={64} />
      <div>
        <p className="org">{branding.organization ?? branding.appName}</p>
        <p className="event-name">{event.name}</p>
        {when && <p className="when">{when}</p>}
      </div>
    </div>
  );
}

/** The first rows of every Excel export: the school, the event, then the report's own lines. */
function useSheetMeta(event: EventDetail) {
  const { branding } = useBranding();
  return (...lines: string[]) => [branding.organization ?? branding.appName, event.name, ...lines];
}

/** Signature lines for printed results. */
function Signatures({ names, label }: { names: string[]; label: string }) {
  if (names.length === 0) return null;
  return (
    <div className="signatures print-only">
      <p className="meta">{label}</p>
      <div className="signature-grid">
        {names.map((n) => (
          <div key={n} className="signature">
            <span className="signature-line" />
            <span>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Loading({ error, retry }: { error: string | null; retry: () => void }) {
  return error ? (
    <p className="error">
      Couldn’t load this report. <button className="link-btn" onClick={retry}>Retry</button>
    </p>
  ) : (
    <p className="muted">Loading report…</p>
  );
}

/* ------------------------------------------------------------------ overall ranking */

interface OverallData {
  finalRound: { id: number; name: string; closed: boolean } | null;
  rows: {
    candidate: ReportCandidate;
    position: number;
    title: string | null;
    reached: { id: number; name: string; kind: 'SCORED' | 'PAIR_VOTE'; closed: boolean } | null;
    roundRank: number | null;
    score: number | null;
  }[];
}

export function OverallReport({ event, params, set, version }: ViewProps) {
  const meta = useSheetMeta(event);
  const group = params.get('group');
  const data = useResource<OverallData>(live(`/events/${event.id}/reports/overall${group ? `?groupValueId=${group}` : ''}`, version));
  const judges = useResource<{ name: string }[]>(`/events/${event.id}/judges`);
  const scope = groupLabel(event.groups, group);
  const title = scope ? `Overall ranking, ${scope}` : 'Overall ranking';
  const d = data.data;
  const provisional = d && d.finalRound && !d.finalRound.closed;

  function excel() {
    if (!d) return;
    downloadExcel(`${event.name} ${title}`, 'Overall', [
      ['Place', 'Title', 'No.', 'Candidate', 'Groups', 'Furthest round', 'Rank in that round', 'Score there (votes in a pair round)'],
      ...d.rows.map((r): Cell[] => [r.position, r.title, r.candidate.number, r.candidate.name, groupNames(r.candidate), r.reached?.name ?? null, r.roundRank, r.score]),
    ], meta(title, provisional ? `Provisional: ${d.finalRound!.name} is not closed` : 'Final'));
  }

  return (
    <>
      <ReportHead
        event={event}
        title={title}
        sub={d && (provisional ? `Provisional. ${d.finalRound!.name} is not closed yet, so places can still change.` : d.finalRound ? `Final, after ${d.finalRound.name}.` : 'No rounds yet.')}
        controls={<GroupSelect groups={event.groups} value={group} onChange={(v) => set({ group: v })} />}
        onExcel={excel}
        disabled={!d}
      />
      {!d ? (
        <Loading error={data.error} retry={data.reload} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th className="n" style={{ width: 56 }}>Place</th>
                  <th className="n wide-only" style={{ width: 48 }}>No.</th>
                  <th>Candidate</th>
                  <th className="wide-only">Furthest round</th>
                  <th className="n wide-only">Rank there</th>
                  <th className="n">Score there</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.candidate.id} className={r.title ? 'titled' : undefined}>
                    <td className="n">{r.position}</td>
                    <td className="n wide-only">{r.candidate.number}</td>
                    <td>
                      <div className="identity">
                        <CandidatePhoto src={r.candidate.thumbUrl} name={r.candidate.name} size={32} />
                        <span>
                          <span className="name">{r.candidate.name}</span>
                          {r.title && <span className="title-tag">{r.title}</span>}
                          <span className="sub">{groupNames(r.candidate)}</span>
                          <span className="sub narrow-only">
                            No. {r.candidate.number}
                            {r.reached && `, ${r.reached.name}${r.roundRank ? `, rank ${r.roundRank}` : ''}`}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="wide-only">
                      {r.reached?.name ?? '-'}
                      {r.reached && !r.reached.closed && <span className="sub">Still open</span>}
                    </td>
                    <td className="n wide-only">{r.roundRank ?? '-'}</td>
                    <td className="n">{r.reached?.kind === 'PAIR_VOTE' && r.score !== null ? `${r.score} votes` : fmt(r.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.rows.length === 0 && <div className="empty">No candidates in this group.</div>}
          <Signatures names={(judges.data ?? []).map((j) => j.name).concat('Tabulator')} label="Certified by the board of judges and the tabulator" />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ by round */

interface RoundData {
  round: { id: number; name: string; kind: 'SCORED' | 'PAIR_VOTE'; status: string; advanceCount: number | null };
  categories: { id: number; name: string; weight: number | null }[];
  judgesSubmitted: number;
  judges: number;
  rows: {
    candidate: ReportCandidate;
    categories: Record<number, number | null>;
    score: number | null;
    rank: number | null;
    position: number | null;
    advanced: boolean | null;
    pair: { opponent: { number: number; name: string }; votesFor: number; votesAgainst: number; won: boolean } | null;
  }[];
}

function useRoundChoice(event: EventDetail, params: URLSearchParams) {
  const withEntries = event.rounds.filter((r) => r._count.entries > 0);
  const chosen = params.get('round');
  return withEntries.find((r) => String(r.id) === chosen) ?? withEntries.at(-1) ?? null;
}

function RoundSelect({ event, value, onChange }: { event: EventDetail; value: number | null; onChange: (id: string) => void }) {
  const rounds = event.rounds.filter((r) => r._count.entries > 0);
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label="Round">
      {rounds.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
          {r.status === 'OPEN' ? ' (open)' : ''}
        </option>
      ))}
    </select>
  );
}

export function RoundReport({ event, params, set, version }: ViewProps) {
  const meta = useSheetMeta(event);
  const round = useRoundChoice(event, params);
  const group = params.get('group');
  const data = useResource<RoundData>(round ? live(`/rounds/${round.id}/report${group ? `?groupValueId=${group}` : ''}`, version) : null);
  const d = data.data && round && data.data.round.id === round.id ? data.data : null;
  const scope = groupLabel(event.groups, group);
  const isPair = d?.round.kind === 'PAIR_VOTE';
  const title = `${round?.name ?? 'Round'} results${scope ? `, ${scope}` : ''}`;

  if (!round) return <div className="empty">No round has started yet, so there is nothing to report.</div>;

  function excel() {
    if (!d) return;
    const head: Cell[] = isPair
      ? [scope ? 'Place in group' : 'Rank', 'No.', 'Candidate', 'Groups', 'Against', 'Votes for', 'Votes against', 'Won pair', 'Went on']
      : [scope ? 'Place in group' : 'Rank', 'No.', 'Candidate', 'Groups', ...d.categories.map((c) => c.name), 'Score', 'Went on'];
    const rows = d.rows.map((r): Cell[] =>
      isPair
        ? [r.position, r.candidate.number, r.candidate.name, groupNames(r.candidate), r.pair ? `No. ${r.pair.opponent.number} ${r.pair.opponent.name}` : null, r.pair?.votesFor ?? null, r.pair?.votesAgainst ?? null, r.pair ? (r.pair.won ? 'Yes' : 'No') : null, r.advanced === null ? null : r.advanced ? 'Yes' : 'No']
        : [r.position, r.candidate.number, r.candidate.name, groupNames(r.candidate), ...d.categories.map((c) => r.categories[c.id]), r.score, r.advanced === null ? null : r.advanced ? 'Yes' : 'No'],
    );
    downloadExcel(`${event.name} ${title}`, round!.name, [head, ...rows], meta(title, `${d.judgesSubmitted} of ${d.judges} judges submitted`));
  }

  return (
    <>
      <ReportHead
        event={event}
        title={title}
        sub={
          d &&
          `${d.round.status === 'CLOSED' ? 'Closed' : 'Still open, so this can change'}. ${d.judgesSubmitted} of ${d.judges} judges submitted. ${
            isPair ? 'Votes from submitted judges.' : 'Category scores are the judges’ average, out of 100.'
          }`
        }
        controls={
          <>
            <RoundSelect event={event} value={round.id} onChange={(id) => set({ round: id })} />
            <GroupSelect groups={event.groups} value={group} onChange={(v) => set({ group: v })} />
          </>
        }
        onExcel={excel}
        disabled={!d}
      />
      {!d ? (
        <Loading error={data.error} retry={data.reload} />
      ) : (
        <div className="table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th className="n" style={{ width: 56 }}>{scope ? 'Place' : 'Rank'}</th>
                <th className="n wide-only" style={{ width: 48 }}>No.</th>
                <th>Candidate</th>
                {isPair ? (
                  <>
                    <th>Against</th>
                    <th className="n">Votes</th>
                  </>
                ) : (
                  <>
                    {d.categories.length > 1 &&
                      d.categories.map((c) => (
                        <th key={c.id} className="n">
                          {c.name}
                        </th>
                      ))}
                    <th className="n">Score</th>
                  </>
                )}
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.candidate.id}>
                  <td className="n">{r.position ?? '-'}</td>
                  <td className="n wide-only">{r.candidate.number}</td>
                  <td>
                    <div className="identity">
                      <CandidatePhoto src={r.candidate.thumbUrl} name={r.candidate.name} size={32} />
                      <span>
                        <span className="name">{r.candidate.name}</span>
                        <span className="sub">{groupNames(r.candidate)}</span>
                        <span className="sub narrow-only">No. {r.candidate.number}</span>
                      </span>
                    </div>
                  </td>
                  {isPair ? (
                    <>
                      <td>{r.pair ? `No. ${r.pair.opponent.number} ${r.pair.opponent.name}` : '-'}</td>
                      <td className="n">{r.pair ? `${r.pair.votesFor} to ${r.pair.votesAgainst}` : '-'}</td>
                    </>
                  ) : (
                    <>
                      {d.categories.length > 1 &&
                        d.categories.map((c) => (
                          <td key={c.id} className="n">
                            {fmt(r.categories[c.id])}
                          </td>
                        ))}
                      <td className="n">{fmt(r.score)}</td>
                    </>
                  )}
                  <td>{r.advanced === true ? <span className="pill pos">Went on</span> : r.advanced === false ? <span className="muted">Out</span> : isPair && r.pair?.won ? 'Won pair' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ by candidate */

interface CandidateData {
  candidate: ReportCandidate;
  judges: { id: number; name: string }[];
  rounds: {
    id: number;
    name: string;
    kind: 'SCORED' | 'PAIR_VOTE';
    status: string;
    rank: number | null;
    score: number | null;
    advanced: boolean | null;
    categories: { id: number; name: string; criteria: { id: number; name: string; max: number; weight: number | null; points: Record<number, number> }[] }[];
    pair: { opponent: { number: number; name: string }; votes: Record<number, boolean> } | null;
  }[];
}

export function CandidateReport({ event, params, set, version }: ViewProps) {
  const meta = useSheetMeta(event);
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const list = useResource<{ items: ReportCandidate[] }>(`/events/${event.id}/candidates?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ''}`);
  const chosen = params.get('candidate');
  const data = useResource<CandidateData>(chosen ? live(`/candidates/${chosen}/report`, version) : null);
  const d = data.data && String(data.data.candidate.id) === chosen ? data.data : null;
  const title = d ? `No. ${d.candidate.number} ${d.candidate.name}` : 'Candidate report';

  function excel() {
    if (!d) return;
    const rows: Cell[][] = [['Round', 'Category', 'Criterion', 'Max', ...d.judges.map((j) => j.name), 'Average']];
    for (const r of d.rounds) {
      if (r.pair) {
        rows.push([r.name, 'Pair vote', `Against No. ${r.pair.opponent.number} ${r.pair.opponent.name}`, null, ...d.judges.map((j) => (j.id in r.pair!.votes ? (r.pair!.votes[j.id] ? 'Voted for' : 'Voted against') : null)), null]);
      }
      for (const c of r.categories)
        for (const cr of c.criteria) {
          const pts = d.judges.map((j) => cr.points[j.id] ?? null);
          const given = pts.filter((p): p is number => p !== null);
          rows.push([r.name, c.name, cr.name, cr.max, ...pts, given.length ? Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 100) / 100 : null]);
        }
      rows.push([r.name, 'Round result', `Rank ${r.rank ?? '-'}`, null, ...d.judges.map(() => null), r.score]);
    }
    downloadExcel(`${event.name} ${title}`, 'Candidate', rows, meta(title, groupNames(d.candidate)));
  }

  return (
    <>
      <ReportHead
        event={event}
        title={title}
        sub={d && groupNames(d.candidate)}
        controls={
          <>
            <input className="input" type="search" placeholder="Find by name or number" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find a candidate" />
            <select className="input" value={chosen ?? ''} onChange={(e) => set({ candidate: e.target.value || null })} aria-label="Candidate">
              <option value="">Choose a candidate</option>
              {(list.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  No. {c.number} {c.name}
                </option>
              ))}
            </select>
          </>
        }
        onExcel={excel}
        disabled={!d}
      />
      {!chosen ? (
        <div className="empty no-print">Choose a candidate to see every judge’s points in every round they entered.</div>
      ) : !d ? (
        <Loading error={data.error} retry={data.reload} />
      ) : (
        <div className="stack">
          {d.rounds.map((r) => (
            <div key={r.id} className="report-block">
              <h3 className="section-title">
                {r.name}
                <span className="muted" style={{ fontWeight: 400 }}>
                  {' '}
                  {r.status === 'CLOSED' ? `Rank ${r.rank ?? '-'}${r.score !== null && r.kind === 'SCORED' ? `, ${fmt(r.score)}` : ''}` : 'Still open'}
                  {r.advanced === true ? ', went on' : r.advanced === false ? ', out' : ''}
                </span>
              </h3>
              <div className="table-wrap">
                <table className="report-table report-grid">
                  <thead>
                    <tr>
                      <th className="sticky">{r.pair ? 'Pair' : 'Criterion'}</th>
                      {d.judges.map((j) => (
                        <th key={j.id} className="n">
                          {j.name}
                        </th>
                      ))}
                      {!r.pair && <th className="n">Average</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {r.pair && (
                      <tr>
                        <td className="sticky">Against No. {r.pair.opponent.number} {r.pair.opponent.name}</td>
                        {d.judges.map((j) => (
                          <td key={j.id} className="n">
                            {j.id in r.pair!.votes ? (r.pair!.votes[j.id] ? 'For' : 'Against') : '-'}
                          </td>
                        ))}
                      </tr>
                    )}
                    {r.categories.flatMap((c) =>
                      c.criteria.map((cr) => {
                        const given = d.judges.map((j) => cr.points[j.id]).filter((p): p is number => p !== undefined);
                        return (
                          <tr key={cr.id}>
                            <td className="sticky">
                              {cr.name}
                              <span className="sub">
                                out of {cr.max}
                                {cr.weight !== null ? `, ${cr.weight}%` : ''}
                              </span>
                            </td>
                            {d.judges.map((j) => (
                              <td key={j.id} className="n">
                                {cr.points[j.id] ?? '-'}
                              </td>
                            ))}
                            <td className="n">{given.length ? fmt(given.reduce((a, b) => a + b, 0) / given.length) : '-'}</td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {d.rounds.length === 0 && <div className="empty">This candidate has not entered a round yet.</div>}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ by judge */

interface JudgeData {
  round: { id: number; name: string; kind: 'SCORED' | 'PAIR_VOTE'; status: string };
  judge: { id: number; name: string };
  criteria: { id: number; name: string; category: string; max: number }[];
  rows: { candidate: ReportCandidate; points: Record<number, number>; total: number | null; submitted: boolean; updatedAt: string | null; vote?: 'won' | 'lost' | null }[];
}

export function JudgeReport({ event, params, set, version }: ViewProps) {
  const meta = useSheetMeta(event);
  const round = useRoundChoice(event, params);
  const judges = useResource<{ id: number; name: string }[]>(`/events/${event.id}/judges`);
  const judgeId = params.get('judge') ?? (judges.data?.[0] ? String(judges.data[0].id) : null);
  const data = useResource<JudgeData>(round && judgeId ? live(`/rounds/${round.id}/judges/${judgeId}/report`, version) : null);
  const d = data.data && round && data.data.round.id === round.id && String(data.data.judge.id) === judgeId ? data.data : null;
  const isPair = d?.round.kind === 'PAIR_VOTE';
  const title = d ? `${d.judge.name}, ${d.round.name}` : 'Judge report';
  const timeFmt = useMemo(() => new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }), []);

  if (!round) return <div className="empty">No round has started yet, so there is nothing to report.</div>;

  function excel() {
    if (!d) return;
    const head: Cell[] = isPair ? ['No.', 'Candidate', 'Vote', 'Submitted'] : ['No.', 'Candidate', ...d.criteria.map((c) => `${c.name} (of ${c.max})`), 'Total of 100', 'Submitted'];
    const rows = d.rows.map((r): Cell[] =>
      isPair
        ? [r.candidate.number, r.candidate.name, r.vote === 'won' ? 'Picked' : r.vote === 'lost' ? 'Not picked' : null, r.submitted ? 'Yes' : 'No']
        : [r.candidate.number, r.candidate.name, ...d.criteria.map((c) => r.points[c.id] ?? null), r.total, r.submitted ? 'Yes' : 'No'],
    );
    downloadExcel(`${event.name} ${title}`, 'Judge', [head, ...rows], meta(title));
  }

  const submitted = d?.rows.filter((r) => r.submitted).length ?? 0;

  return (
    <>
      <ReportHead
        event={event}
        title={title}
        sub={d && `${submitted} of ${d.rows.length} ${isPair ? 'votes' : 'candidates'} submitted. Every score this judge gave, for them to check and sign.`}
        controls={
          <>
            <select className="input" value={judgeId ?? ''} onChange={(e) => set({ judge: e.target.value })} aria-label="Judge">
              {(judges.data ?? []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
            <RoundSelect event={event} value={round.id} onChange={(id) => set({ round: id })} />
          </>
        }
        onExcel={excel}
        disabled={!d}
      />
      {!d ? (
        <Loading error={data.error} retry={data.reload} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="report-table report-grid">
              <thead>
                <tr>
                  <th className="n wide-only" style={{ width: 48 }}>No.</th>
                  <th className="sticky">Candidate</th>
                  {isPair ? (
                    <th>Vote</th>
                  ) : (
                    <>
                      {d.criteria.map((c) => (
                        <th key={c.id} className="n">
                          {c.name}
                          <span className="sub">of {c.max}</span>
                        </th>
                      ))}
                      <th className="n">Total</th>
                    </>
                  )}
                  <th className="n">Saved</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.candidate.id}>
                    <td className="n wide-only">{r.candidate.number}</td>
                    <td className="sticky">
                      {r.candidate.name}
                      <span className="sub narrow-only">No. {r.candidate.number}</span>
                    </td>
                    {isPair ? (
                      <td>{r.vote === 'won' ? 'Picked' : r.vote === 'lost' ? <span className="muted">Not picked</span> : '-'}</td>
                    ) : (
                      <>
                        {d.criteria.map((c) => (
                          <td key={c.id} className="n">
                            {r.points[c.id] ?? '-'}
                          </td>
                        ))}
                        <td className="n">{fmt(r.total)}</td>
                      </>
                    )}
                    <td className="n">{r.updatedAt ? `${timeFmt.format(new Date(r.updatedAt))}${r.submitted ? '' : ', draft'}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Signatures names={[d.judge.name]} label="I confirm these are the scores I gave" />
        </>
      )}
    </>
  );
}
