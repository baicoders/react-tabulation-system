import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, type Role } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { CandidatesPage } from './pages/admin/CandidatesPage';
import { EventsPage } from './pages/admin/EventsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ScoreSheetPage } from './pages/judge/ScoreSheetPage';

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="center">Loading...</p>;
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
        <Route path="candidates" element={<CandidatesPage />} />
        <Route path="rounds" element={<PlaceholderPage title="Rounds, categories and criteria" />} />
        <Route path="judges" element={<PlaceholderPage title="Judges" />} />
        <Route path="reports" element={<PlaceholderPage title="Reports" />} />
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
