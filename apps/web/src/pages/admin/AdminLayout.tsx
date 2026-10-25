import { useEffect, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { EventDetail, EventListItem } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { EventLogo, useEventFavicon } from '../../components/EventLogo';
import { Icon, type IconName } from '../../components/Icon';
import { TallyMark } from '../../components/TallyMark';
import { useResource } from '../../hooks/useResource';

export interface AdminContext {
  events: EventListItem[] | null;
  reloadEvents: () => void;
  event: EventDetail | null;
  reloadEvent: () => void;
}

export function useAdmin() {
  return useOutletContext<AdminContext>();
}

const EVENT_NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '', label: 'Overview', icon: 'overview', end: true },
  { to: 'candidates', label: 'Candidates', icon: 'candidates' },
  { to: 'groups', label: 'Groups', icon: 'groups' },
  { to: 'rounds', label: 'Rounds and criteria', icon: 'rounds' },
  { to: 'judges', label: 'Judges', icon: 'judges' },
  { to: 'reports', label: 'Reports', icon: 'reports' },
  { to: 'details', label: 'Event details', icon: 'details' },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const events = useResource<EventListItem[]>('/events');
  const event = useResource<EventDetail>(eventId ? `/events/${eventId}` : null);
  const current = eventId && event.data?.id === Number(eventId) ? event.data : null;

  useEventFavicon(current?.logoUrl);

  // Close the phone menu after navigating.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Switching events keeps the same screen: /admin/events/3/judges -> /admin/events/7/judges.
  function switchEvent(nextId: string) {
    const rest = eventId ? location.pathname.split(`/admin/events/${eventId}`)[1] ?? '' : '';
    navigate(`/admin/events/${nextId}${rest}`);
  }

  const counts: Record<string, number | undefined> = {
    candidates: current?._count.candidates,
    judges: current?._count.judges,
  };

  return (
    <div className="app" style={current?.brandColor ? ({ '--brand': current.brandColor } as CSSProperties) : undefined}>
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'} aria-label="Main">
        <div className="brand">
          <TallyMark />
          Tally
          <button className="btn ghost menu-toggle" style={{ marginLeft: 'auto' }} onClick={() => setMenuOpen(false)}>
            Close
          </button>
        </div>
        <nav className="rows-nav">
          <NavLink className="nav-item" to="/admin/events" end aria-current={!eventId && location.pathname === '/admin/events' ? 'page' : undefined}>
            <Icon name="events" />
            All events
          </NavLink>
          {eventId && (
            <>
              <div className="event-label" title={current?.name}>
                {current?.logoUrl && <EventLogo src={current.logoUrl} size={24} />}
                <span>{current?.name ?? 'Loading event…'}</span>
              </div>
              {EVENT_NAV.map((item) => (
                <NavLink key={item.label} className="nav-item" to={`/admin/events/${eventId}${item.to ? `/${item.to}` : ''}`} end={item.end}>
                  <Icon name={item.icon} />
                  {item.label}
                  {counts[item.to] !== undefined && <span className="count">{counts[item.to]}</span>}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="bottom">
          <div className="user-row">
            <span className="grow">Signed in as {user?.name}</span>
          </div>
          <button className="nav-item" style={{ border: 0, background: 'none', cursor: 'pointer', width: '100%' }} onClick={logout}>
            <Icon name="logout" />
            Log out
          </button>
        </div>
      </aside>

      <header className="topbar">
        <button className="btn ghost menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Icon name="menu" />
        </button>
        {eventId && events.data && events.data.length > 0 && (
          <div className="scope">
            <label className="visually-hidden" htmlFor="event-switch">
              Event
            </label>
            <select id="event-switch" className="input" style={{ height: 32 }} value={eventId} onChange={(e) => switchEvent(e.target.value)}>
              {events.data.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <span className="spacer" />
        {current?.testingMode && <span className="pill warn">Testing mode on</span>}
      </header>

      <main className="sheet">
        <div className="canvas">
          <Outlet
            context={{ events: events.data, reloadEvents: events.reload, event: current, reloadEvent: event.reload } satisfies AdminContext}
          />
        </div>
      </main>
    </div>
  );
}
