import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { EventDetail } from '../../api/types';
import { EventLogo } from '../../components/EventLogo';
import { useAdmin } from './AdminLayout';

// Settings layout like Groups: the event's facts, then its branding. Branding is per event, so the
// same install can run another school's pageant with its own logo and colour.
export function EventDetailsPage() {
  const { event, reloadEvent, reloadEvents } = useAdmin();
  if (!event) return <p className="muted">Loading event…</p>;

  function changed() {
    reloadEvent();
    reloadEvents();
  }

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Event details</h1>
          <p className="sub">The name, date and venue, and the branding shown on the login page, the judges’ screens and every printed report.</p>
        </div>
      </div>
      <div className="settings">
        <DetailsSection key={`details-${event.id}`} event={event} onChange={changed} />
        <LogoSection event={event} onChange={changed} />
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
  const [organization, setOrganization] = useState(event.organization ?? '');
  const [color, setColor] = useState(event.brandColor ?? '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/events/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          date: date ? new Date(date).toISOString() : undefined,
          venue: venue || undefined,
          organization: organization.trim() || null,
          brandColor: color || null,
        }),
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
        <p>The organization’s name heads every printed report, above the event name.</p>
      </div>
      <form className="well form-grid" onSubmit={save}>
        <label className="field">
          <span>Event name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Organization</span>
          <input className="input" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="School or organizer, for printouts" />
        </label>
        <label className="field">
          <span>Date and time</span>
          <input className="input" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Venue</span>
          <input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} />
        </label>
        <div className="field">
          <span id="brand-color-label">Brand color</span>
          <div className="color-row">
            <input
              type="color"
              className="swatch"
              value={color || '#1b6c80'}
              onChange={(e) => setColor(e.target.value)}
              aria-labelledby="brand-color-label"
            />
            <input
              className="input"
              value={color}
              onChange={(e) => setColor(e.target.value.trim())}
              placeholder="#03053e"
              aria-label="Brand color hex"
              pattern="#[0-9a-fA-F]{6}"
              style={{ width: 120 }}
            />
            {color && (
              <button type="button" className="link-btn quiet" onClick={() => setColor('')}>
                Clear
              </button>
            )}
          </div>
          <span className="hint">The rule under printed report headings, and the event’s name in the menu.</span>
        </div>
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

function LogoSection({ event, onChange }: { event: EventDetail; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setError(null), [event.logoUrl]);

  async function upload(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append('logo', file);
    setBusy(true);
    try {
      await api(`/events/${event.id}/logo`, { method: 'POST', body: form });
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remove the logo? Screens and printouts go back to Tally’s mark.')) return;
    await api(`/events/${event.id}/logo`, { method: 'DELETE' });
    onChange();
  }

  return (
    <div className="setting">
      <div className="label-col">
        <h2 className="section-title">Logo</h2>
        <p>A square PNG with a transparent background prints best. It shows on the login page, the judges’ screens, the menu and printed reports.</p>
      </div>
      <div className="well logo-well">
        <div className="logo-preview">
          <EventLogo src={event.logoUrl} name={event.name} size={96} />
        </div>
        <div className="logo-actions">
          <p className="muted">{event.logoUrl ? 'This is the logo now.' : 'No logo yet. Tally’s mark shows instead.'}</p>
          <div className="form-actions">
            <label className="btn">
              {busy ? 'Uploading…' : event.logoUrl ? 'Replace logo' : 'Upload logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
            </label>
            {event.logoUrl && (
              <button className="link-btn danger" onClick={remove}>
                Remove
              </button>
            )}
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
