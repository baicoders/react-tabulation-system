import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { Judge, Round } from '../../api/types';
import { Initial } from '../../components/Initial';
import { useResource } from '../../hooks/useResource';
import { plural } from '../../lib/format';
import { useAdmin } from './AdminLayout';

export function JudgesPage() {
  const { event, reloadEvent } = useAdmin();
  const judges = useResource<Judge[]>(event ? `/events/${event.id}/judges` : null);
  const rounds = useResource<Round[]>(event ? `/events/${event.id}/rounds` : null);
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<number | null>(null);

  if (!event) return <p className="muted">Loading event...</p>;

  const categories = (rounds.data ?? []).flatMap((r) => r.categories.map((c) => ({ ...c, roundName: r.name })));
  const list = judges.data ?? [];
  const refresh = () => {
    judges.reload();
    reloadEvent();
  };

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
            {event.status === 'ACTIVE'
              ? 'Judges log in with their name and the password you set here.'
              : 'Judges can log in once this event is live.'}
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setAdding(true)} disabled={adding}>
            Add judge
          </button>
        </div>
      </div>

      {adding && (
        <AddJudgeForm
          eventId={event.id}
          categoryIds={categories.map((c) => c.id)}
          onClose={() => setAdding(false)}
          onAdded={refresh}
        />
      )}

      <div className="toolbar">
        <span className="muted">{plural(list.length, 'judge')}</span>
        <span className="spacer" />
        <span className="muted">{plural(categories.length, 'scored category', 'scored categories')} in this event</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Judge</th>
              <th className="n">Scores</th>
              <th className="n hide-phone">Categories</th>
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
                      <span className="sub">Username: {j.name}</span>
                    </span>
                  </div>
                  {resetFor === j.id && <ResetPassword judge={j} onDone={() => setResetFor(null)} />}
                </td>
                <td className="n">{j.submittedScores > 0 ? j.submittedScores : <span className="muted">Not submitted</span>}</td>
                <td className="n hide-phone">
                  {categories.length === 0 ? '-' : `${j.categoryIds.length} of ${categories.length}`}
                </td>
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
        </table>
        {judges.data && list.length === 0 && <div className="empty" style={{ marginTop: 8 }}>No judges yet. Add each judge with a password you give them on the day.</div>}
        {judges.error && (
          <p className="error">
            Couldn't load judges. <button className="link-btn" onClick={judges.reload}>Retry</button>
          </p>
        )}
      </div>
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
      {saved && !error && <p className="muted" style={{ marginTop: 12 }}>{saved} They score every category in this event.</p>}
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
