import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type Role } from '../auth/AuthContext';
import { useBranding } from '../branding/BrandingContext';
import { BrandLogo } from '../components/BrandLogo';
import { formatDate } from '../lib/format';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>('judge');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The school's name and logo, and the live event, so judges know they are in the right place.
  const { branding } = useBranding();
  const live = branding.liveEvent;

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
        <div className="login-brand">
          <BrandLogo size={branding.logoUrl ? 88 : 32} />
          <span className="app-name">{branding.appName}</span>
          {branding.organization && <span className="org">{branding.organization}</span>}
        </div>
        {live && (
          <p className="live-event">
            <span className="pill pos">Live</span>
            <span>
              <strong>{live.name}</strong>
              {(live.date || live.venue) && <span className="sub">{[live.date ? formatDate(live.date) : null, live.venue].filter(Boolean).join(', ')}</span>}
            </span>
          </p>
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
      </form>
    </main>
  );
}
