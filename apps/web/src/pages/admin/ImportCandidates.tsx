import { useState } from 'react';
import { api } from '../../api/client';
import type { EventDetail } from '../../api/types';
import { downloadExcel } from '../../lib/exportExcel';
import { plural } from '../../lib/format';

interface ParsedRow {
  line: number;
  number: string | number | null;
  name: string | number | null;
  picture: string | null;
  groups: Record<string, string | number | null>;
}

interface PreviewRow {
  line: number;
  number: number | null;
  name: string;
  status: 'new' | 'update' | 'error';
  error?: string;
  groups: Record<string, string>;
}

interface Preview {
  rows: PreviewRow[];
  newValues: { group: string; value: string }[];
  ignoredColumns: string[];
  counts: { new: number; update: number; error: number };
  saved?: boolean;
}

const NUMBER_HEADERS = /^(no\.?|number|candidate (no\.?|number)|#)$/i;
const NAME_HEADERS = /^(name|full name|candidate|candidate name)$/i;
const PICTURE_HEADERS = /^(photo|photo file|picture|image|file|file ?name)$/i;
const IMAGE_FILE = /\.(jpe?g|png|webp)$/i;

const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const baseName = (path: string) => path.split('/').pop() ?? path;

/** Reads the first sheet of a CSV or Excel file. Headers are matched by name, in any order. */
async function parseFile(file: File): Promise<{ rows: ParsedRow[]; headers: string[] }> {
  const XLSX = await import('xlsx');
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = book.Sheets[book.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  const headerIndex = grid.findIndex((r) => r.some((c) => c !== null && String(c).trim() !== ''));
  if (headerIndex < 0) return { rows: [], headers: [] };
  const headers = grid[headerIndex].map((h) => String(h ?? '').trim());
  const col = (re: RegExp) => headers.findIndex((h) => re.test(h));
  const numberCol = col(NUMBER_HEADERS);
  const nameCol = col(NAME_HEADERS);
  const pictureCol = col(PICTURE_HEADERS);
  const rows = grid
    .slice(headerIndex + 1)
    .map((r, i) => ({ r, line: headerIndex + i + 2 }))
    .filter(({ r }) => r.some((c) => c !== null && String(c).trim() !== ''))
    .map(({ r, line }) => ({
      line,
      number: numberCol >= 0 ? r[numberCol] : null,
      name: nameCol >= 0 ? r[nameCol] : null,
      picture: pictureCol >= 0 && r[pictureCol] !== null ? String(r[pictureCol]).trim() : null,
      groups: Object.fromEntries(
        headers.map((h, i) => [h, r[i]] as const).filter(([h], i) => h && i !== numberCol && i !== nameCol && i !== pictureCol),
      ),
    }));
  return { rows, headers };
}

export function ImportCandidates({ event, onClose, onImported }: { event: EventDetail; onClose: () => void; onImported: () => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setDone(null);
    setError(null);
    setBusy(true);
    try {
      const { rows, headers } = await parseFile(file);
      if (!headers.some((h) => NAME_HEADERS.test(h)) || !headers.some((h) => NUMBER_HEADERS.test(h))) {
        throw new Error('The first row needs a "Number" and a "Name" column. Download the template to see the layout.');
      }
      if (rows.length === 0) throw new Error('The file has headers but no candidates under them.');
      setParsed(rows);
      setPreview(await api<Preview>(`/events/${event.id}/import/candidates`, { method: 'POST', body: JSON.stringify({ dryRun: true, rows }) }));
    } catch (err) {
      setParsed(null);
      setError(err instanceof Error ? err.message : 'Could not read the file');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!parsed) return;
    setBusy(true);
    try {
      const res = await api<Preview>(`/events/${event.id}/import/candidates`, { method: 'POST', body: JSON.stringify({ dryRun: false, rows: parsed }) });
      setDone(`Imported ${plural(res.counts.new, 'new candidate')} and updated ${res.counts.update}.${res.counts.error ? ` Skipped ${plural(res.counts.error, 'row')} with errors.` : ''}`);
      setPreview(null);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  function template() {
    const groups = event.groups;
    downloadExcel(`${event.name} candidates template`, 'Candidates', [
      ['Number', 'Name', ...groups.map((g) => g.name), 'Photo file'],
      [1, 'Maria Santos', ...groups.map((g) => g.values[0]?.name ?? ''), '1.jpg'],
      [2, 'Ana Reyes', ...groups.map((g) => g.values[1]?.name ?? g.values[0]?.name ?? ''), '2.jpg'],
    ]);
  }

  const importable = preview ? preview.counts.new + preview.counts.update : 0;
  const pictureNames = new Map((parsed ?? []).filter((r) => r.picture).map((r) => [r.picture!.toLowerCase(), String(r.number ?? '')]));

  return (
    <div className="form-panel">
      <h2 className="section-title">Import candidates</h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        A CSV or Excel file with a Number and a Name column{event.groups.length ? `, plus a column for ${event.groups.map((g) => g.name).join(' and ')}` : ''}. A number that already exists updates that candidate.
      </p>
      <div className="toolbar">
        <label className="btn">
          {fileName ? 'Choose another file' : 'Choose CSV or Excel file'}
          <input type="file" accept=".csv,.xlsx,.xls,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <button className="link-btn" onClick={template}>
          Download template
        </button>
        {fileName && <span className="muted">{fileName}</span>}
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>
          Done
        </button>
      </div>
      {busy && <p className="muted">Working...</p>}
      {error && <p className="error">{error}</p>}
      {done && <p className="muted" role="status">{done}</p>}

      {preview && (
        <>
          <p style={{ margin: '8px 0' }}>
            {plural(preview.counts.new, 'new candidate')}, {plural(preview.counts.update, 'update')}
            {preview.counts.error > 0 && <span className="error">, {plural(preview.counts.error, 'row')} with errors (skipped)</span>}.
          </p>
          {preview.newValues.length > 0 && (
            <p className="notice" style={{ marginBottom: 8 }}>
              New group values will be added: {preview.newValues.map((v) => `${v.group} "${v.value}"`).join(', ')}. Check the spelling if that is not intended.
            </p>
          )}
          {preview.ignoredColumns.length > 0 && <p className="meta">Columns not used: {preview.ignoredColumns.join(', ')}. Only groups set up for this event are read.</p>}
          <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto', marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th className="n" style={{ width: 56 }}>Line</th>
                  <th className="n" style={{ width: 56 }}>No.</th>
                  <th>Name</th>
                  {event.groups.map((g) => (
                    <th key={g.id}>{g.name}</th>
                  ))}
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line}>
                    <td className="n muted">{r.line}</td>
                    <td className="n">{r.number ?? '-'}</td>
                    <td>{r.name || <span className="muted">-</span>}</td>
                    {event.groups.map((g) => (
                      <td key={g.id}>{r.groups[g.name] ?? <span className="muted">-</span>}</td>
                    ))}
                    <td>
                      {r.status === 'error' ? <span className="pill neg">{r.error}</span> : r.status === 'update' ? <span className="pill">Updates No. {r.number}</span> : <span className="pill pos">New</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button className="btn primary" onClick={save} disabled={busy || importable === 0}>
              Import {plural(importable, 'candidate')}
            </button>
          </div>
        </>
      )}

      <PhotoZip event={event} pictureNames={pictureNames} onUploaded={onImported} />
    </div>
  );
}

interface Match {
  file: string;
  candidate: { id: number; number: number; name: string } | null;
  how: string;
}

/** Photos from a ZIP, each matched to a candidate by the sheet's photo column, by number (12.jpg) or by name. */
function PhotoZip({ event, pictureNames, onUploaded }: { event: EventDetail; pictureNames: Map<string, string>; onUploaded: () => void }) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [zip, setZip] = useState<import('jszip') | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onZip(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress(null);
    try {
      const JSZip = (await import('jszip')).default;
      const archive = await JSZip.loadAsync(file);
      // Every candidate in the event, 100 at a time.
      const all: { id: number; number: number; name: string }[] = [];
      for (let page = 1; ; page++) {
        const res = await api<{ items: { id: number; number: number; name: string }[]; total: number }>(`/events/${event.id}/candidates?pageSize=100&page=${page}`);
        all.push(...res.items);
        if (all.length >= res.total || res.items.length === 0) break;
      }
      const byNumber = new Map(all.map((c) => [c.number, c]));
      const bySlug = new Map(all.map((c) => [slug(c.name), c]));
      const files = Object.values(archive.files).filter((f) => !f.dir && IMAGE_FILE.test(f.name) && !f.name.startsWith('__MACOSX') && !baseName(f.name).startsWith('.'));
      const found = files.map((f): Match => {
        const name = baseName(f.name);
        const stem = name.replace(/\.[^.]+$/, '');
        const fromSheet = pictureNames.get(name.toLowerCase());
        if (fromSheet && byNumber.get(Number(fromSheet))) return { file: f.name, candidate: byNumber.get(Number(fromSheet))!, how: 'photo column' };
        if (/^\d+$/.test(stem) && byNumber.get(Number(stem))) return { file: f.name, candidate: byNumber.get(Number(stem))!, how: 'number' };
        if (bySlug.get(slug(stem))) return { file: f.name, candidate: bySlug.get(slug(stem))!, how: 'name' };
        return { file: f.name, candidate: null, how: '' };
      });
      if (found.length === 0) throw new Error('No JPG, PNG or WebP photos in this ZIP.');
      setZip(archive);
      setMatches(found.sort((a, b) => (a.candidate?.number ?? Infinity) - (b.candidate?.number ?? Infinity)));
    } catch (err) {
      setMatches(null);
      setError(err instanceof Error ? err.message : 'Could not read the ZIP');
    }
  }

  async function upload() {
    if (!zip || !matches) return;
    const todo = matches.filter((m) => m.candidate);
    const state = { done: 0, total: todo.length, failed: [] as string[] };
    setProgress({ ...state });
    // Three at a time: quick on a LAN, and the server resizes each photo as it arrives.
    let next = 0;
    async function worker() {
      while (next < todo.length) {
        const m = todo[next++];
        try {
          const blob = await zip!.file(m.file)!.async('blob');
          const ext = m.file.split('.').pop()!.toLowerCase();
          const form = new FormData();
          form.append('picture', new File([blob], baseName(m.file), { type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' }));
          await api(`/candidates/${m.candidate!.id}/picture`, { method: 'POST', body: form });
        } catch {
          state.failed.push(baseName(m.file));
        }
        state.done++;
        setProgress({ ...state, failed: [...state.failed] });
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    onUploaded();
  }

  const matched = matches?.filter((m) => m.candidate) ?? [];
  const unmatched = matches?.filter((m) => !m.candidate) ?? [];
  const twice = matched.length - new Set(matched.map((m) => m.candidate!.id)).size;

  return (
    <div style={{ marginTop: 24 }}>
      <h3 className="section-title">Photos from a ZIP</h3>
      <p className="muted" style={{ margin: '4px 0 12px' }}>Name each photo after the candidate's number (12.jpg), their name (maria-santos.jpg), or the file named in the sheet's photo column.</p>
      <div className="toolbar">
        <label className="btn">
          Choose ZIP of photos
          <input type="file" accept=".zip,application/zip" hidden onChange={(e) => onZip(e.target.files?.[0])} />
        </label>
        {matches && (
          <span className="muted">
            {matched.length} of {matches.length} photos match a candidate
          </span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {matches && (
        <>
          {twice > 0 && <p className="notice" style={{ marginBottom: 8 }}>{plural(twice, 'candidate has', 'candidates have')} more than one photo; the last one uploaded is kept.</p>}
          {unmatched.length > 0 && (
            <p className="meta" style={{ marginBottom: 8 }}>
              Not matched, so not uploaded: {unmatched.slice(0, 12).map((m) => baseName(m.file)).join(', ')}
              {unmatched.length > 12 ? ` and ${unmatched.length - 12} more` : ''}.
            </p>
          )}
          <div className="form-actions" style={{ marginTop: 0, alignItems: 'center' }}>
            <button className="btn primary" onClick={upload} disabled={matched.length === 0 || (progress !== null && progress.done < progress.total)}>
              Upload {plural(matched.length, 'photo')}
            </button>
            {progress && (
              <span className={progress.failed.length ? 'error' : 'muted'} role="status">
                {progress.done < progress.total
                  ? `Uploading ${progress.done} of ${progress.total}...`
                  : `Uploaded ${progress.total - progress.failed.length} of ${progress.total}.${progress.failed.length ? ` Failed: ${progress.failed.join(', ')}` : ''}`}
              </span>
            )}
          </div>
          {progress && progress.total > 0 && (
            <div className="share" style={{ marginTop: 8, height: 4 }}>
              <span style={{ width: `${(progress.done / progress.total) * 100}%`, background: 'var(--accent)' }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
