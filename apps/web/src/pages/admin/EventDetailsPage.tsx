import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { EventDetail } from '../../api/types';
import { useAdmin } from './AdminLayout';

// The event's own facts. The school's name and logo are system-wide, on the Settings screen.
export function EventDetailsPage() {
  const { event, reloadEvent, reloadEvents } = useAdmin();
  if (!event) return <p className="muted">Loading event…</p>;

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Event details</h1>
          <p className="sub">The name, date and venue printed under the school’s letterhead on this event’s reports.</p>
        </div>
      </div>
      <div className="settings">
        <DetailsSection
          key={event.id}
          event={event}
          onChange={() => {
            reloadEvent();
            reloadEvents();
          }}
        />
      </div>
    </section>
  );
}

/** "2026-11-14T10:00:00.000Z" to the local "2026-11-14T18:00" a datetime-local input wants. */
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function DetailsSection({ event, onChange }: { event: EventDetail; onChange: () => void }) {
  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(toLocalInput(event.date));
  const [venue, setVenue] = useState(event.venue ?? '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/events/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, date: date ? new Date(date).toISOString() : undefined, venue: venue || undefined }),
      });
      setMessage({ ok: true, text: 'Saved.' });
      onChange();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setting">
      <div className="label-col">
        <h2 className="section-title">Details</h2>
        <p>Judges see the event name when they log in.</p>
      </div>
      <form className="well form-grid" onSubmit={save}>
        <label className="field">
          <span>Event name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Date and time</span>
          <input className="input" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Venue</span>
          <input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} />
        </label>
        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
          {message && (
            <span role="status" className={message.ok ? 'meta' : 'error'}>
              {message.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
