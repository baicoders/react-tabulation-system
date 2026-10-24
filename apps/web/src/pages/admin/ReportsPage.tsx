import { useAdmin } from './AdminLayout';

const REPORTS = [
  ['Overall ranking', 'Champion and runners-up, with raw score, deductions and final score side by side.'],
  ['By category', 'Each candidate\'s score and rank in one category.'],
  ['By candidate', 'One candidate\'s points per criterion, per judge.'],
  ['By judge', 'Every score one judge gave, with when it was submitted.'],
];

export function ReportsPage() {
  const { event } = useAdmin();
  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Reports</h1>
          <p className="sub">Reports fill in as judges submit scores{event ? ` for ${event.name}` : ''}. Each can be split by any group.</p>
        </div>
      </div>
      <div className="rows" style={{ maxWidth: 760 }}>
        {REPORTS.map(([name, about]) => (
          <div className="row" key={name}>
            <span className="grow">
              <span style={{ fontWeight: 500 }}>{name}</span>
              <span className="muted" style={{ display: 'block' }}>{about}</span>
            </span>
            <span className="pill">No scores yet</span>
          </div>
        ))}
      </div>
    </section>
  );
}
