import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { Judge, Round } from '../../api/types';
import { Initial } from '../../components/Initial';
import { useResource } from '../../hooks/useResource';
import { plural } from '../../lib/format';
import { useAdmin } from './AdminLayout';

interface Column {
  id: number;
  name: string;
  roundName: string;
  closed: boolean;
}

const columnLabel = (c: Column) => (c.name === c.roundName ? c.roundName : `${c.roundName}: ${c.name}`);

export function JudgesPage() {
  const { event, reloadEvent } = useAdmin();
  const judges = useResource<Judge[]>(event ? `/events/${event.id}/judges` : null);
  const rounds = useResource<Round[]>(event ? `/events/${event.id}/rounds` : null);
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!event) return <p className="muted">Loading event…</p>;

  // One column per scored category, in round order. Pair-vote rounds have no categories: every judge votes in them.
  const columns: Column[] = (rounds.data ?? []).flatMap((r) =>
    r.categories.map((c) => ({ id: c.id, name: c.name, roundName: r.name, closed: r.status === 'CLOSED' })),
  );
  const pairRounds = (rounds.data ?? []).filter((r) => r.kind === 'PAIR_VOTE');
  const list = judges.data ?? [];
  const perColumn = (cid: number) => list.filter((j) => j.categoryIds.includes(cid)).length;
  const uncovered = columns.filter((c) => !c.closed && perColumn(c.id) === 0);
  const refresh = () => {
    judges.reload();
    reloadEvent();
  };

  async function toggle(j: Judge, column: Column) {
    const on = j.categoryIds.includes(column.id);
    const categoryIds = on ? j.categoryIds.filter((cid) => cid !== column.id) : [...j.categoryIds, column.id];
    setSaving(true);
    setError(null);
    try {
      await api(`/judges/${j.id}`, { method: 'PATCH', body: JSON.stringify({ categoryIds }) });
      judges.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function remove(j: Judge) {
    if (!confirm(`Remove ${j.name}? ${j.submittedScores ? `Their ${plural(j.submittedScores, 'score')} are deleted too.` : 'They have not scored yet.'}`)) return;
    await api(`/judges/${j.id}`, { method: 'DELETE' });
    refresh();
  }

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Judges</h1>
          <p className="sub">
            {event.status === 'ACTIVE' ? 'Judges log in with their name and the password you set here.' : 'Judges can log in once this event is live.'} Tick the rounds each one
            scores.
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setAdding(true)} disabled={adding}>
            Add judge
          </button>
        </div>
      </div>

      {adding && (
        <AddJudgeForm eventId={event.id} categoryIds={columns.filter((c) => !c.closed).map((c) => c.id)} onClose={() => setAdding(false)} onAdded={refresh} />
      )}

      <div className="toolbar">
        <span className="muted">
          {plural(list.length, 'judge')}, {plural(columns.length, 'scored category', 'scored categories')}
        </span>
        <span className="spacer" />
        {saving && <span className="meta">Saving…</span>}
      </div>
      {error && <p className="error">{error}</p>}
      {uncovered.length > 0 && list.length > 0 && (
        <p className="notice" style={{ marginBottom: 12 }}>
          No judge scores {uncovered.map(columnLabel).join(', ')}. Tick at least one judge, or that part of the round goes unscored.
        </p>
      )}

      <div className="table-wrap">
        <table className="assign">
          <thead>
            <tr>
              <th>Judge</th>
              {columns.map((c) => (
                <th key={c.id} className="center hide-phone">
                  {c.roundName}
                  {c.name !== c.roundName && <span className="sub">{c.name}</span>}
                  {c.closed && <span className="sub">Closed</span>}
                </th>
              ))}
              <th className="n">Scores</th>
              <th className="n">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((j, i) => (
              <tr key={j.id}>
                <td>
                  <div className="identity">
                    <Initial name={j.name} index={i} />
                    <span>
                      <span className="name">{j.name}</span>
                      <span className="sub">
                        {columns.length ? `Scores ${columns.filter((c) => j.categoryIds.includes(c.id)).length} of ${columns.length}` : `Username: ${j.name}`}
                      </span>
                    </span>
                  </div>
                  {resetFor === j.id && <ResetPassword judge={j} onDone={() => setResetFor(null)} />}
                </td>
                {columns.map((c) => (
                  <td key={c.id} className="center hide-phone">
                    <input
                      type="checkbox"
                      checked={j.categoryIds.includes(c.id)}
                      disabled={c.closed || saving}
                      onChange={() => toggle(j, c)}
                      aria-label={`${j.name} scores ${columnLabel(c)}`}
                    />
                  </td>
                ))}
                <td className="n">{j.submittedScores > 0 ? j.submittedScores : <span className="muted">-</span>}</td>
                <td className="n" style={{ whiteSpace: 'nowrap' }}>
                  <button className="link-btn" onClick={() => setResetFor(j.id)}>
                    Set password
                  </button>
                  <button className="link-btn quiet" style={{ marginLeft: 16 }} onClick={() => remove(j)} aria-label={`Remove ${j.name}`}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {list.length > 0 && columns.length > 0 && (
            <tfoot className="hide-phone">
              <tr>
                <td className="muted">Judges per round</td>
                {columns.map((c) => {
                  const n = perColumn(c.id);
                  return (
                    <td key={c.id} className={n === 0 && !c.closed ? 'center error' : 'center muted'}>
                      {n === 0 ? 'None' : n}
                    </td>
                  );
                })}
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
        {judges.data && list.length === 0 && <div className="empty" style={{ marginTop: 8 }}>No judges yet. Add each judge with a password you give them on the day.</div>}
        {judges.error && (
          <p className="error">
            Couldn’t load judges. <button className="link-btn" onClick={judges.reload}>Retry</button>
          </p>
        )}
      </div>
      <p className="meta" style={{ marginTop: 12 }}>
        {pairRounds.length > 0 &&
          `${pairRounds.map((r) => r.name).join(' and ')} ${pairRounds.length === 1 ? 'is a pair vote, so every judge votes in it' : 'are pair votes, so every judge votes in them'}. `}
        Who scores a closed round is fixed; reopen the round to change it.
      </p>
    </section>
  );
}

function AddJudgeForm({ eventId, categoryIds, onClose, onAdded }: { eventId: number; categoryIds: number[]; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      // New judges score every category; narrow it later if a judge only covers some rounds.
      await api(`/events/${eventId}/judges`, { method: 'POST', body: JSON.stringify({ name, password, categoryIds }) });
      setSaved(`Added ${name}.`);
      setName('');
      setPassword('');
      setError(null);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the judge');
    }
  }

  return (
    <form className="form-panel" onSubmit={submit}>
      <h2 className="section-title">Add judge</h2>
      <div className="form-row">
        <label className="field">
          <span>Name (also the username)</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} required autoComplete="off" />
          <span className="hint">At least 4 characters. Hand it to the judge on the day.</span>
        </label>
      </div>
      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      {saved && !error && <p className="muted" style={{ marginTop: 12 }}>{saved} They score every round that is not closed; untick any they skip below.</p>}
      <div className="form-actions">
        <button className="btn primary" type="submit">
          Add judge
        </button>
        <button className="btn" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </form>
  );
}

function ResetPassword({ judge, onDone }: { judge: Judge; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/judges/${judge.id}`, { method: 'PATCH', body: JSON.stringify({ password }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  }

  return (
    <form className="toolbar" style={{ marginTop: 8, marginBottom: 0 }} onSubmit={submit}>
      <input className="input" style={{ width: 200 }} placeholder={`New password for ${judge.name.split(' ')[0]}`} value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} required autoComplete="off" aria-label="New password" />
      <button className="btn" type="submit">
        Save
      </button>
      <button className="link-btn" type="button" onClick={onDone}>
        Cancel
      </button>
      {error && <span className="error">{error}</span>}
    </form>
  );
}
