import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { STATUS_LABEL, type EventStatus } from '../../api/types';
import { formatDate, plural } from '../../lib/format';
import { useAdmin } from './AdminLayout';

const TABS: { key: 'ALL' | EventStatus; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Live' },
  { key: 'DRAFT', label: 'Setting up' },
  { key: 'CLOSED', label: 'Finished' },
];

const STATUS_PILL: Record<EventStatus, string> = { ACTIVE: 'pill pos', DRAFT: 'pill', CLOSED: 'pill' };

export function EventsPage() {
  const { events, reloadEvents } = useAdmin();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'ALL' | EventStatus>('ALL');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (events ?? []).filter((e) => (tab === 'ALL' || e.status === tab) && (!q || e.name.toLowerCase().includes(q) || e.venue?.toLowerCase().includes(q)));
  }, [events, tab, search]);

  const countFor = (key: 'ALL' | EventStatus) => (events ?? []).filter((e) => key === 'ALL' || e.status === key).length;
  const live = (events ?? []).find((e) => e.status === 'ACTIVE');

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Events</h1>
          <p className="sub">
            {events === null ? 'Loading events...' : live ? `${live.name} is live. Judges log in to this event.` : 'No event is live, so judges cannot log in yet.'}
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setCreating(true)} disabled={creating}>
            New event
          </button>
        </div>
      </div>

      {creating && (
        <NewEventForm
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            reloadEvents();
            navigate(`/admin/events/${id}`);
          }}
        />
      )}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
            <span className="count">{countFor(t.key)}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input className="input" type="search" placeholder="Search events or venues" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search events" />
        <span className="spacer" />
        <span className="muted">{plural(visible.length, 'event')}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th className="n hide-phone">Date</th>
              <th className="n">Candidates</th>
              <th className="n hide-phone">Judges</th>
              <th className="n hide-phone">Rounds</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link to={`/admin/events/${e.id}`} className="name" style={{ fontWeight: 500 }}>
                    {e.name}
                  </Link>
                  <span className="sub">{e.venue ?? 'No venue yet'}</span>
                </td>
                <td className="n hide-phone">{formatDate(e.date)}</td>
                <td className="n">{e._count.candidates}</td>
                <td className="n hide-phone">{e._count.judges}</td>
                <td className="n hide-phone">{e._count.rounds}</td>
                <td>
                  <span className={STATUS_PILL[e.status]}>{STATUS_LABEL[e.status]}</span>
                  {e.testingMode && <span className="sub">Testing mode on</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events !== null && visible.length === 0 && (
          <div className="empty" style={{ marginTop: 8 }}>
            {events.length === 0 ? 'No events yet. Create the first one to start adding candidates.' : 'No events match this view.'}
          </div>
        )}
      </div>
    </section>
  );
}

function NewEventForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api<{ id: number }>('/events', {
        method: 'POST',
        body: JSON.stringify({ name, venue: venue || undefined, date: date || undefined }),
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the event');
      setBusy(false);
    }
  }

  return (
    <form className="form-panel" onSubmit={onSubmit}>
      <h2 className="section-title">New event</h2>
      <div className="form-row">
        <label className="field">
          <span>Event name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Date and time</span>
          <input className="input" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Venue</span>
          <input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} />
        </label>
      </div>
      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      <div className="form-actions">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Creating...' : 'Create event'}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
