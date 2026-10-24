import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { Group } from '../../api/types';
import { plural } from '../../lib/format';
import { useAdmin } from './AdminLayout';

// Settings two-column layout: each group is a section, its values in the panel beside it.
export function GroupsPage() {
  const { event, reloadEvent } = useAdmin();
  if (!event) return <p className="muted">Loading event…</p>;

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Groups</h1>
          <p className="sub">Groups sort candidates into houses, levels or types. Rankings can be split by any group.</p>
        </div>
      </div>

      <div className="settings">
        {event.groups.map((g) => (
          <GroupSection key={g.id} group={g} total={event._count.candidates} onChange={reloadEvent} />
        ))}
        <NewGroupSection eventId={event.id} first={event.groups.length === 0} onChange={reloadEvent} />
      </div>
    </section>
  );
}

function GroupSection({ group, total, onChange }: { group: Group; total: number; onChange: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const assigned = group.values.reduce((sum, v) => sum + (v._count?.candidates ?? 0), 0);

  async function addValue(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/groups/${group.id}/values`, { method: 'POST', body: JSON.stringify({ name: value }) });
      setValue('');
      setError(null);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add');
    }
  }

  async function removeValue(id: number, name: string, count: number) {
    if (count > 0 && !confirm(`Remove "${name}"? ${plural(count, 'candidate')} will lose this ${group.name.toLowerCase()}.`)) return;
    await api(`/group-values/${id}`, { method: 'DELETE' });
    onChange();
  }

  async function removeGroup() {
    if (!confirm(`Delete the group "${group.name}" and its ${plural(group.values.length, 'value')}? Candidates stay, but lose their ${group.name.toLowerCase()}.`)) return;
    await api(`/groups/${group.id}`, { method: 'DELETE' });
    onChange();
  }

  return (
    <div className="setting">
      <div className="label-col">
        <h2 className="section-title">{group.name}</h2>
        <p>
          {assigned} of {total} candidates have a {group.name.toLowerCase()}.
          {assigned < total && total > 0 && ' Set the rest from the candidate list.'}
        </p>
      </div>
      <div className="well">
        <div className="rows">
          {group.values.map((v) => (
            <div className="row" key={v.id}>
              <span className="grow">{v.name}</span>
              <span className="muted num">{plural(v._count?.candidates ?? 0, 'candidate')}</span>
              <button className="link-btn quiet" onClick={() => removeValue(v.id, v.name, v._count?.candidates ?? 0)} aria-label={`Remove ${v.name}`}>
                Remove
              </button>
            </div>
          ))}
          {group.values.length === 0 && <p className="muted" style={{ padding: '8px 0' }}>No values yet. Add the first one below.</p>}
        </div>
        <form className="toolbar" style={{ marginTop: 12, marginBottom: 0 }} onSubmit={addValue}>
          <input className="input" placeholder={`New ${group.name.toLowerCase()}`} value={value} onChange={(e) => setValue(e.target.value)} required aria-label={`New ${group.name.toLowerCase()}`} />
          <button className="btn" type="submit">
            Add
          </button>
          <span className="spacer" />
          <button className="link-btn danger" type="button" onClick={removeGroup}>
            Delete group
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function NewGroupSection({ eventId, first, onChange }: { eventId: number; first: boolean; onChange: () => void }) {
  const [name, setName] = useState('');
  const [values, setValues] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/events/${eventId}/groups`, {
        method: 'POST',
        body: JSON.stringify({ name, values: values.split(',').map((v) => v.trim()).filter(Boolean) }),
      });
      setName('');
      setValues('');
      setError(null);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the group');
    }
  }

  return (
    <div className="setting">
      <div className="label-col">
        <h2 className="section-title">{first ? 'Add the first group' : 'Add a group'}</h2>
        <p>For example House with Red, Blue and Gold, or Level with SHS and College.</p>
      </div>
      <form className="well" onSubmit={onSubmit}>
        <div className="form-row">
          <label className="field">
            <span>Group name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="House" required />
          </label>
          <label className="field">
            <span>Values, separated by commas</span>
            <input className="input" value={values} onChange={(e) => setValues(e.target.value)} placeholder="Red House, Blue House, Gold House" />
          </label>
        </div>
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="form-actions">
          <button className="btn primary" type="submit">
            Add group
          </button>
        </div>
      </form>
    </div>
  );
}
