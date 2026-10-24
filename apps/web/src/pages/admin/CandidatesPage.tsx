import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { CandidatePhoto } from '../../components/CandidatePhoto';
import { Pagination } from '../../components/Pagination';
import { useDebounced } from '../../hooks/useDebounced';
import { usePaginated } from '../../hooks/usePaginated';

interface EventSummary {
  id: number;
  name: string;
}

interface Candidate {
  id: number;
  number: number;
  name: string;
  thumbUrl: string | null;
  photoUrl: string | null;
  groups: { id: number; name: string; groupId: number }[];
}

export function CandidatesPage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [eventId, setEventId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const q = useDebounced(search);

  useEffect(() => {
    api<EventSummary[]>('/events').then((list) => {
      setEvents(list);
      setEventId((current) => current ?? list[0]?.id ?? null);
    });
  }, []);

  // Back to page 1 whenever the filter changes.
  useEffect(() => setPage(1), [q, eventId, pageSize]);

  const { data, loading, error, reload } = usePaginated<Candidate>(
    eventId ? `/events/${eventId}/candidates` : null,
    { page, pageSize, q },
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!eventId) return;
    try {
      await api(`/events/${eventId}/candidates`, { method: 'POST', body: JSON.stringify({ number, name }) });
      setNumber('');
      setName('');
      setMessage(null);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not add candidate');
    }
  }

  async function onUpload(candidateId: number, file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append('picture', file);
    try {
      await api(`/candidates/${candidateId}/picture`, { method: 'POST', body: form });
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  if (events.length === 0) {
    return (
      <section>
        <h2>Candidates</h2>
        <p className="muted">Create an event first.</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Candidates</h2>
      <div className="row">
        <select value={eventId ?? ''} onChange={(e) => setEventId(Number(e.target.value))} aria-label="Event">
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
        <input type="search" placeholder="Search name or number" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <form className="row" onSubmit={onCreate}>
        <input placeholder="No." type="number" min={1} value={number} onChange={(e) => setNumber(e.target.value)} required />
        <input placeholder="Candidate name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="primary" type="submit">
          Add candidate
        </button>
      </form>
      {(error || message) && <p className="error">{error ?? message}</p>}
      <table aria-busy={loading}>
        <thead>
          <tr>
            <th>Photo</th>
            <th>No.</th>
            <th>Name</th>
            <th>Groups</th>
            <th>Picture</th>
          </tr>
        </thead>
        <tbody className={loading ? 'loading' : undefined}>
          {data?.items.map((c) => (
            <tr key={c.id}>
              <td>
                <CandidatePhoto src={c.thumbUrl} name={c.name} />
              </td>
              <td>{c.number}</td>
              <td>{c.name}</td>
              <td>{c.groups.map((g) => g.name).join(', ')}</td>
              <td>
                <label className="upload">
                  {c.thumbUrl ? 'Replace' : 'Upload'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onUpload(c.id, e.target.files?.[0])} />
                </label>
              </td>
            </tr>
          ))}
          {data && data.items.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No candidates found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {data && (
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      )}
    </section>
  );
}
