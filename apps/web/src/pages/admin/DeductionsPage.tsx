import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { useDebounced } from '../../hooks/useDebounced';
import { useResource } from '../../hooks/useResource';
import { formatDateTime, plural } from '../../lib/format';
import { useAdmin } from './AdminLayout';

interface Rule {
  id: number;
  label: string;
  points: number;
  _count: { deductions: number };
}

interface Deduction {
  id: number;
  points: number;
  note: string | null;
  createdBy: string;
  createdAt: string;
  candidate: { id: number; number: number; name: string };
  round: { id: number; name: string; status: string } | null;
  rule: { id: number; label: string } | null;
}

const pts = (n: number) => `-${n.toFixed(2)}`;

export function DeductionsPage() {
  const { event } = useAdmin();
  const rules = useResource<Rule[]>(event ? `/events/${event.id}/deduction-rules` : null);
  const list = useResource<Deduction[]>(event ? `/events/${event.id}/deductions` : null);
  const [adding, setAdding] = useState(false);

  if (!event) return <p className="muted">Loading event...</p>;

  const deductions = list.data ?? [];
  const total = deductions.reduce((sum, d) => sum + d.points, 0);
  const people = new Set(deductions.map((d) => d.candidate.id)).size;

  async function remove(d: Deduction) {
    const reason = prompt(`Remove ${pts(d.points)} from No. ${d.candidate.number} ${d.candidate.name}? Say why (it is kept in the audit log).`);
    if (!reason) return;
    try {
      await api(`/deductions/${d.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
      list.reload();
      rules.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not remove it');
    }
  }

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Deductions</h1>
          <p className="sub">Points come off a candidate's score in one round, after tabulation and before results are announced.</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setAdding(true)} disabled={adding}>
            Add deduction
          </button>
        </div>
      </div>

      {adding && (
        <AddDeductionForm
          rules={rules.data ?? []}
          onClose={() => setAdding(false)}
          onAdded={() => {
            list.reload();
            rules.reload();
          }}
        />
      )}

      <div className="toolbar">
        <span className="muted">
          {list.data ? (deductions.length ? `${plural(deductions.length, 'deduction')} on ${plural(people, 'candidate')}, ${pts(total)} points in all` : 'No deductions yet') : 'Loading...'}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Round</th>
              <th>Reason</th>
              <th className="n">Points</th>
              <th className="n hide-phone">Added</th>
              <th className="n">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {deductions.map((d) => (
              <tr key={d.id}>
                <td>
                  <span className="name">
                    No. {d.candidate.number} {d.candidate.name}
                  </span>
                </td>
                <td>
                  {d.round?.name ?? '-'}
                  {d.round?.status === 'CLOSED' && <span className="sub">Closed, so this is final</span>}
                </td>
                <td>
                  {d.rule?.label ?? 'Other'}
                  {d.note && <span className="sub">{d.note}</span>}
                </td>
                <td className="n">{pts(d.points)}</td>
                <td className="n hide-phone">
                  {formatDateTime(d.createdAt)}
                  <span className="sub">by {d.createdBy}</span>
                </td>
                <td className="n">
                  {d.round?.status !== 'CLOSED' && (
                    <button className="link-btn quiet" onClick={() => remove(d)} aria-label={`Remove deduction from ${d.candidate.name}`}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data && deductions.length === 0 && <div className="empty" style={{ marginTop: 8 }}>No deductions yet. Add one when a candidate breaks a guideline.</div>}
        {list.error && (
          <p className="error">
            Couldn't load deductions. <button className="link-btn" onClick={list.reload}>Retry</button>
          </p>
        )}
      </div>

      <div className="settings" style={{ marginTop: 48 }}>
        <RulesSection eventId={event.id} rules={rules.data ?? []} onChange={rules.reload} />
      </div>
    </section>
  );
}

function AddDeductionForm({ rules, onClose, onAdded }: { rules: Rule[]; onClose: () => void; onAdded: () => void }) {
  const { event } = useAdmin();
  // Points can only come off rounds that are not closed and are scored by points.
  const rounds = (event?.rounds ?? []).filter((r) => r._count.entries > 0 && r.status !== 'CLOSED' && r.kind === 'SCORED' && r.scoreMethod === 'AVERAGE');
  const [roundId, setRoundId] = useState(String(rounds.find((r) => r.status === 'OPEN')?.id ?? rounds[0]?.id ?? ''));
  const [search, setSearch] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [ruleId, setRuleId] = useState(rules[0] ? String(rules[0].id) : '');
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const q = useDebounced(search);
  const candidates = useResource<{ items: { id: number; number: number; name: string }[] }>(
    event && roundId ? `/events/${event.id}/candidates?pageSize=100&roundId=${roundId}${q ? `&q=${encodeURIComponent(q)}` : ''}` : null,
  );
  const rule = useMemo(() => rules.find((r) => String(r.id) === ruleId) ?? null, [rules, ruleId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/events/${event!.id}/deductions`, {
        method: 'POST',
        body: JSON.stringify({
          candidateId: Number(candidateId),
          roundId: Number(roundId),
          ruleId: rule ? rule.id : null,
          ...(points ? { points: Number(points) } : {}),
          ...(note ? { note } : {}),
        }),
      });
      const c = candidates.data?.items.find((i) => String(i.id) === candidateId);
      setSaved(`${pts(points ? Number(points) : (rule?.points ?? 0))} from No. ${c?.number} ${c?.name}.`);
      setError(null);
      setCandidateId('');
      setNote('');
      setPoints('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the deduction');
    }
  }

  if (rounds.length === 0) {
    return (
      <div className="form-panel">
        <h2 className="section-title">Add deduction</h2>
        <p className="muted">No round can take a deduction now. Points come off an open or upcoming round scored by average; reopen a closed round to change it.</p>
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="form-panel" onSubmit={submit}>
      <h2 className="section-title">Add deduction</h2>
      <div className="form-row">
        <label className="field">
          <span>Round</span>
          <select
            className="input"
            value={roundId}
            onChange={(e) => {
              setRoundId(e.target.value);
              setCandidateId('');
            }}
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.status === 'OPEN' ? ' (open now)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Find candidate</span>
          <input className="input" type="search" placeholder="Name or number" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field">
          <span>Candidate</span>
          <select className="input" value={candidateId} onChange={(e) => setCandidateId(e.target.value)} required>
            <option value="">Choose</option>
            {(candidates.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                No. {c.number} {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row" style={{ marginTop: 16 }}>
        <label className="field">
          <span>Rule</span>
          <select className="input" value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            {rules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}, {r.points} points
              </option>
            ))}
            <option value="">Other (say why in the note)</option>
          </select>
        </label>
        <label className="field">
          <span>Points</span>
          <input className="input num" type="number" min={0.01} step="0.01" value={points} onChange={(e) => setPoints(e.target.value)} placeholder={rule ? `${rule.points} from the rule` : 'Points'} required={!rule} />
        </label>
        <label className="field">
          <span>Note</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={rule ? 'What happened (optional)' : 'What happened'} required={!rule} />
        </label>
      </div>
      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      {saved && !error && <p className="muted" style={{ marginTop: 12 }}>Deducted {saved}</p>}
      <div className="form-actions">
        <button className="btn primary" type="submit">
          Deduct {points ? Number(points) : (rule?.points ?? '')} points
        </button>
        <button className="btn" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </form>
  );
}

function RulesSection({ eventId, rules, onChange }: { eventId: number; rules: Rule[]; onChange: () => void }) {
  const [label, setLabel] = useState('');
  const [points, setPoints] = useState('5');
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/events/${eventId}/deduction-rules`, { method: 'POST', body: JSON.stringify({ label, points: Number(points) }) });
      setLabel('');
      setError(null);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the rule');
    }
  }

  async function remove(r: Rule) {
    if (!confirm(`Delete the rule "${r.label}"? ${r._count.deductions ? `Its ${plural(r._count.deductions, 'deduction')} stay, listed as Other.` : ''}`)) return;
    await api(`/deduction-rules/${r.id}`, { method: 'DELETE' });
    onChange();
  }

  return (
    <div className="setting">
      <div className="label-col">
        <h2 className="section-title">Rules for this event</h2>
        <p>From the event's guidelines, so a deduction takes one pick. For example Guideline 7 at 5 points.</p>
      </div>
      <div className="well">
        <div className="rows">
          {rules.map((r) => (
            <div className="row" key={r.id}>
              <span className="grow">{r.label}</span>
              <span className="num">{pts(r.points)}</span>
              <span className="muted num" style={{ width: 96, textAlign: 'right' }}>
                {r._count.deductions ? `used ${plural(r._count.deductions, 'time')}` : 'not used'}
              </span>
              <button className="link-btn quiet" onClick={() => remove(r)} aria-label={`Delete rule ${r.label}`}>
                Delete
              </button>
            </div>
          ))}
          {rules.length === 0 && <p className="muted" style={{ padding: '8px 0' }}>No rules yet. Add the guidelines that carry a deduction.</p>}
        </div>
        <form className="toolbar" style={{ marginTop: 12, marginBottom: 0 }} onSubmit={add}>
          <input className="input" placeholder="Guideline 7" value={label} onChange={(e) => setLabel(e.target.value)} required aria-label="Rule name" />
          <input className="input num" style={{ width: 96 }} type="number" min={0.01} step="0.01" value={points} onChange={(e) => setPoints(e.target.value)} required aria-label="Points" />
          <button className="btn" type="submit">
            Add rule
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
