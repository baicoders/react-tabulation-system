import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { useBranding } from '../../branding/BrandingContext';
import { BrandLogo } from '../../components/BrandLogo';

// The system's identity, set once for every event: the school's name, logo and colour.
export function SettingsPage() {
  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Settings</h1>
          <p className="sub">The school’s name, logo and color. They show on the login page, every screen and the letterhead of every event’s printed reports.</p>
        </div>
      </div>
      <div className="settings">
        <IdentitySection />
        <LogoSection />
      </div>
    </section>
  );
}

function IdentitySection() {
  const { branding, reload } = useBranding();
  const [appName, setAppName] = useState(branding.appName);
  const [organization, setOrganization] = useState(branding.organization ?? '');
  const [color, setColor] = useState(branding.brandColor ?? '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // The branding loads after the first render; fill the form once it arrives.
  useEffect(() => {
    setAppName(branding.appName);
    setOrganization(branding.organization ?? '');
    setColor(branding.brandColor ?? '');
  }, [branding]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ appName, organization: organization.trim() || null, brandColor: color || null }),
      });
      setMessage({ ok: true, text: 'Saved.' });
      reload();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setting">
      <div className="label-col">
        <h2 className="section-title">Name and color</h2>
        <p>The system name heads every screen and the browser tab. The organization’s full name heads every printed report.</p>
      </div>
      <form className="well form-grid" onSubmit={save}>
        <label className="field">
          <span>System name</span>
          <input className="input" value={appName} onChange={(e) => setAppName(e.target.value)} required maxLength={60} placeholder="ACLC Ormoc Tabulation" />
        </label>
        <label className="field">
          <span>Organization</span>
          <input className="input" value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={120} placeholder="Full name, for printed reports" />
        </label>
        <div className="field">
          <span id="brand-color-label">Brand color</span>
          <div className="color-row">
            <input type="color" className="swatch" value={color || '#1b6c80'} onChange={(e) => setColor(e.target.value)} aria-labelledby="brand-color-label" />
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
          <span className="hint">The rule under printed letterheads.</span>
        </div>
        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
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

function LogoSection() {
  const { branding, reload } = useBranding();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append('logo', file);
    setBusy(true);
    try {
      await api('/settings/logo', { method: 'POST', body: form });
      setError(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remove the logo? Screens and printouts go back to Tally’s mark.')) return;
    await api('/settings/logo', { method: 'DELETE' });
    reload();
  }

  return (
    <div className="setting">
      <div className="label-col">
        <h2 className="section-title">Logo</h2>
        <p>A square PNG with a transparent background prints best. It shows on the login page, the menu, the judges’ screens, the browser tab and printed reports.</p>
      </div>
      <div className="well logo-well">
        <div className="logo-preview">
          <BrandLogo size={96} />
        </div>
        <div className="logo-actions">
          <p className="muted">{branding.logoUrl ? 'This is the logo now.' : 'No logo yet. Tally’s mark shows instead.'}</p>
          <div className="form-actions">
            <label className="btn">
              {busy ? 'Uploading…' : branding.logoUrl ? 'Replace logo' : 'Upload logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} disabled={busy} />
            </label>
            {branding.logoUrl && (
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
