import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

const links = [
  { to: 'events', label: 'Events' },
  { to: 'candidates', label: 'Candidates' },
  { to: 'rounds', label: 'Rounds and criteria' },
  { to: 'judges', label: 'Judges' },
  { to: 'reports', label: 'Reports' },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <strong>Admin</strong>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="muted">{user?.name}</span>
          <button onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
