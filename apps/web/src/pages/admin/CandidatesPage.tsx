import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Group } from '../../api/types';
import { CandidatePhoto } from '../../components/CandidatePhoto';
import { Pagination } from '../../components/Pagination';
import { useDebounced } from '../../hooks/useDebounced';
import { usePaginated } from '../../hooks/usePaginated';
import { plural } from '../../lib/format';
import { useAdmin } from './AdminLayout';

interface Candidate {
  id: number;
  number: number;
  name: string;
  thumbUrl: string | null;
  photoUrl: string | null;
  groups: { id: number; name: string; groupId: number }[];
}

export function CandidatesPage() {
  const { event, reloadEvent } = useAdmin();
  const [search, setSearch] = useState('');
  const [groupValueId, setGroupValueId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const q = useDebounced(search);

  // Back to page 1 whenever the filter changes.
  useEffect(() => setPage(1), [q, groupValueId, pageSize, event?.id]);

  const { data, loading, error, reload } = usePaginated<Candidate>(event ? `/events/${event.id}/candidates` : null, {
    page,
    pageSize,
    q,
    groupValueId: groupValueId || undefined,
  });

  if (!event) return <p className="muted">Loading event...</p>;

  async function onUpload(candidateId: number, file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append('picture', file);
    try {
      await api(`/candidates/${candidateId}/picture`, { method: 'POST', body: form });
      setMessage(null);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  const withPhoto = data?.items.filter((c) => c.thumbUrl).length ?? 0;

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Candidates</h1>
          <p className="sub">
            {plural(event._count.candidates, 'candidate')}
            {event.groups.length > 0 && ` in ${event.groups.map((g) => plural(g.values.length, g.name.toLowerCase())).join(' and ')}`}
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setAdding(true)} disabled={adding}>
            Add candidate
          </button>
        </div>
      </div>

      {adding && (
        <AddCandidateForm
          eventId={event.id}
          groups={event.groups}
          nextNumber={event._count.candidates + 1}
          onClose={() => setAdding(false)}
          onAdded={() => {
            reload();
            reloadEvent();
          }}
        />
      )}

      <div className="toolbar">
        <input className="input" type="search" placeholder="Search by name or number" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search candidates" />
        {event.groups.length > 0 && (
          <select className="input" value={groupValueId} onChange={(e) => setGroupValueId(e.target.value)} aria-label="Filter by group">
            <option value="">Every group</option>
            {event.groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {g.values.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <span className="spacer" />
        {data && (
          <span className="muted">
            {plural(data.total, 'candidate')}
            {data.items.length > 0 && `, ${withPhoto} of ${data.items.length} on this page with a photo`}
          </span>
        )}
      </div>
      {(error || message) && <p className="error">{error ?? message}</p>}

      <div className="table-wrap">
        <table aria-busy={loading}>
          <thead>
            <tr>
              <th className="n" style={{ width: 56 }}>No.</th>
              <th>Candidate</th>
              {event.groups.map((g) => (
                <th key={g.id} className="hide-phone">
                  {g.name}
                </th>
              ))}
              <th className="n">Photo</th>
            </tr>
          </thead>
          <tbody className={loading ? 'loading' : undefined}>
            {data?.items.map((c) => (
              <tr key={c.id}>
                <td className="n">{c.number}</td>
                <td>
                  <div className="identity">
                    <CandidatePhoto src={c.thumbUrl} name={c.name} size={40} />
                    <span>
                      <span className="name">{c.name}</span>
                      {c.groups.length > 0 && <span className="sub phone-only">{c.groups.map((g) => g.name).join(' · ')}</span>}
                    </span>
                  </div>
                </td>
                {event.groups.map((g) => (
                  <td key={g.id} className="hide-phone">
                    {c.groups.find((v) => v.groupId === g.id)?.name ?? <span className="muted">-</span>}
                  </td>
                ))}
                <td className="n">
                  <label className="link-btn" style={{ cursor: 'pointer' }}>
                    {c.thumbUrl ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onUpload(c.id, e.target.files?.[0])} />
                  </label>
                </td>
              </tr>
            ))}
            {!data &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <td className="n"><span className="skeleton" style={{ width: 16, height: 14 }} /></td>
                  <td><div className="identity"><span className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} /><span className="skeleton" style={{ width: 140, height: 14 }} /></div></td>
                  {event.groups.map((g) => (
                    <td key={g.id} className="hide-phone"><span className="skeleton" style={{ width: 80, height: 14 }} /></td>
                  ))}
                  <td className="n"><span className="skeleton" style={{ width: 48, height: 14 }} /></td>
                </tr>
              ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <div className="empty" style={{ marginTop: 8 }}>
            {data.total === 0 && !q && !groupValueId ? (
              <span>
                No candidates yet. Add them one by one, or set up <Link className="link-btn" to="../groups">groups</Link> first so each candidate gets a house and level.
              </span>
            ) : (
              'No candidates match this search.'
            )}
          </div>
        )}
      </div>
      {data && data.total > 0 && (
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      )}
    </section>
  );
}

function AddCandidateForm({
  eventId,
  groups,
  nextNumber,
  onClose,
  onAdded,
}: {
  eventId: number;
  groups: Group[];
  nextNumber: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [number, setNumber] = useState(String(nextNumber));
  const [name, setName] = useState('');
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/events/${eventId}/candidates`, {
        method: 'POST',
        body: JSON.stringify({ number, name, groupValueIds: Object.values(picks).filter(Boolean).map(Number) }),
      });
      setSaved(`Added No. ${number} ${name}.`);
      setError(null);
      setName('');
      setNumber(String(Number(number) + 1));
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the candidate');
    }
  }

  return (
    <form className="form-panel" onSubmit={onSubmit}>
      <h2 className="section-title">Add candidate</h2>
      <div className="form-row">
        <label className="field">
          <span>Number</span>
          <input className="input num" type="number" min={1} value={number} onChange={(e) => setNumber(e.target.value)} required />
        </label>
        <label className="field">
          <span>Full name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        {groups.map((g) => (
          <label className="field" key={g.id}>
            <span>{g.name}</span>
            <select className="input" value={picks[g.id] ?? ''} onChange={(e) => setPicks((p) => ({ ...p, [g.id]: e.target.value }))}>
              <option value="">None</option>
              {g.values.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      {saved && !error && <p className="muted" style={{ marginTop: 12 }}>{saved} The number moved on so you can add the next one.</p>}
      <div className="form-actions">
        <button className="btn primary" type="submit">
          Add candidate
        </button>
        <button className="btn" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </form>
  );
}
