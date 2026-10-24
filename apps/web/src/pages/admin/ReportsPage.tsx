import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedCallback, useLiveUpdates } from '../../hooks/useLiveUpdates';
import { useAdmin } from './AdminLayout';
import { CandidateReport, JudgeReport, OverallReport, RoundReport } from './reportViews';

const VIEWS = [
  { key: 'overall', label: 'Overall ranking' },
  { key: 'round', label: 'By round' },
  { key: 'candidate', label: 'By candidate' },
  { key: 'judge', label: 'By judge' },
] as const;

type View = (typeof VIEWS)[number]['key'];

export function ReportsPage() {
  const { event } = useAdmin();
  const [params, setParams] = useSearchParams();
  // Every live notice bumps the version; the open report reloads its data and keeps showing the old table meanwhile.
  const [version, setVersion] = useState(0);
  const bump = useDebouncedCallback(() => setVersion((v) => v + 1), 500);
  useLiveUpdates(event?.id, bump);
  const view = (VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'overall') as View;

  // Filters live in the URL, so a report can be reloaded or shared as it is.
  const set = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  if (!event) return <p className="muted">Loading event…</p>;

  return (
    <section className="report">
      <div className="title-row no-print">
        <div>
          <h1>Reports</h1>
          <p className="sub">From submitted scores only{event.testingMode ? ', including test scores while testing mode is on' : ''}. Print or download any report.</p>
        </div>
      </div>

      <div className="tabs no-print" role="tablist">
        {VIEWS.map((v) => (
          <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => set({ view: v.key })}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'overall' && <OverallReport event={event} params={params} set={set} version={version} />}
      {view === 'round' && <RoundReport event={event} params={params} set={set} version={version} />}
      {view === 'candidate' && <CandidateReport event={event} params={params} set={set} version={version} />}
      {view === 'judge' && <JudgeReport event={event} params={params} set={set} version={version} />}
    </section>
  );
}
