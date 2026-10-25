import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type Role } from '../auth/AuthContext';
import { api } from '../api/client';
import type { Branding } from '../api/types';
import { EventLogo, useEventFavicon } from '../components/EventLogo';
import { TallyMark } from '../components/TallyMark';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>('judge');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The live event's name and logo, so judges know they are in the right place.
  const [branding, setBranding] = useState<Branding | null>(null);
  useEffect(() => {
    api<Branding | null>('/branding').then(setBranding, () => setBranding(null));
  }, []);
  useEventFavicon(branding?.logoUrl);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(role, username, password);
      navigate(user.role === 'admin' ? '/admin' : '/judge', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={onSubmit}>
        {branding ? (
          <div className="login-event">
            {branding.logoUrl && <EventLogo src={branding.logoUrl} name={branding.organization ?? branding.name} size={88} />}
            <span className="event-name">{branding.name}</span>
            {branding.organization && <span className="org">{branding.organization}</span>}
          </div>
        ) : (
          <div className="brand">
            <TallyMark />
            Tally
          </div>
        )}
        <h1>Log in to score</h1>
        <div className="segmented" role="group" aria-label="Log in as">
          {(['judge', 'admin'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>
              {r === 'judge' ? 'Judge' : 'Admin'}
            </button>
          ))}
        </div>
        <label className="field">
          <span>{role === 'judge' ? 'Your name' : 'Username'}</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn primary" style={{ height: 40 }} disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        {branding && (
          <span className="powered">
            <TallyMark size={14} />
            Tabulated with Tally
          </span>
        )}
      </form>
    </main>
  );
}
