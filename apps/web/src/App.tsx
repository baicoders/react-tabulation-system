import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, type Role } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { CandidatesPage } from './pages/admin/CandidatesPage';
import { DeductionsPage } from './pages/admin/DeductionsPage';
import { EventOverviewPage } from './pages/admin/EventOverviewPage';
import { EventsPage } from './pages/admin/EventsPage';
import { GroupsPage } from './pages/admin/GroupsPage';
import { JudgesPage } from './pages/admin/JudgesPage';
import { ReportsPage } from './pages/admin/ReportsPage';
import { RoundsPage } from './pages/admin/RoundsPage';
import { ScoreSheetPage } from './pages/judge/ScoreSheetPage';

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted" style={{ padding: 24 }}>Loading...</p>;
  if (!user || user.role !== role) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="events" replace />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/:eventId" element={<EventOverviewPage />} />
        <Route path="events/:eventId/candidates" element={<CandidatesPage />} />
        <Route path="events/:eventId/groups" element={<GroupsPage />} />
        <Route path="events/:eventId/rounds" element={<RoundsPage />} />
        <Route path="events/:eventId/judges" element={<JudgesPage />} />
        <Route path="events/:eventId/deductions" element={<DeductionsPage />} />
        <Route path="events/:eventId/reports" element={<ReportsPage />} />
      </Route>
      <Route
        path="/judge"
        element={
          <RequireRole role="judge">
            <ScoreSheetPage />
          </RequireRole>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
