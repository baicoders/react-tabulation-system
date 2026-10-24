import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';

interface Event {
  id: number;
  name: string;
  venue: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  testingMode: boolean;
}

// First working admin screen. The other CRUD screens follow the same shape.
export function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setEvents(await api<Event[]>('/events'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load events');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api('/events', { method: 'POST', body: JSON.stringify({ name, venue: venue || undefined }) });
    setName('');
    setVenue('');
    load();
  }

  return (
    <section>
      <h2>Events</h2>
      <form className="row" onSubmit={onCreate}>
        <input placeholder="Event name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
        <button className="primary" type="submit">
          Add event
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Venue</th>
            <th>Status</th>
            <th>Testing mode</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr key={ev.id}>
              <td>{ev.name}</td>
              <td>{ev.venue ?? ''}</td>
              <td>{ev.status}</td>
              <td>{ev.testingMode ? 'On' : 'Off'}</td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No events yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
