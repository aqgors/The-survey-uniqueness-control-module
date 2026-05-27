import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import CreateSurveyPage from './pages/CreateSurvey/CreateSurveyPage';
import TakeSurveyPage from './pages/TakeSurvey/TakeSurveyPage';
import ResultsPage from './pages/Results/ResultsPage';
import NotFoundPage from './pages/NotFoundPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MySurveysPage from './pages/MySurveys/MySurveysPage';
import EditSurveyPage from './pages/EditSurvey/EditSurveyPage';
import ProfilePage from './pages/ProfilePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import FriendsPage from './pages/Friends/FriendsPage';
import { WebSocketProvider } from './context/WebSocketContext';

// Admin pages
import AdminLayout    from './pages/admin/AdminLayout';
import DashboardPage  from './pages/admin/DashboardPage';
import UsersPage      from './pages/admin/UsersPage';
import SurveysPage    from './pages/admin/SurveysPage';
import AnomaliesPage  from './pages/admin/AnomaliesPage';
import ExportPage     from './pages/admin/ExportPage';

// ── Guards ─────────────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div style={{ padding: 32, textAlign: 'center' }}>Завантаження...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children, roles = ['ADMIN', 'MODERATOR'] }: { children: JSX.Element; roles?: string[] }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div style={{ padding: 32, textAlign: 'center' }}>Завантаження...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <WebSocketProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>

        {/* ── Public / User routes ──────────────────────────────────────── */}
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="survey/:id" element={<TakeSurveyPage />} />
          <Route path="results/:id" element={<ResultsPage />} />
          <Route path="login"    element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="create"   element={<ProtectedRoute><CreateSurveyPage /></ProtectedRoute>} />
          <Route path="my-surveys" element={<ProtectedRoute><MySurveysPage /></ProtectedRoute>} />
          <Route path="edit/:id"   element={<ProtectedRoute><EditSurveyPage /></ProtectedRoute>} />
          <Route path="profile"    element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="friends"    element={<ProtectedRoute><FriendsPage /></ProtectedRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* ── Admin CMS routes ──────────────────────────────────────────── */}
        <Route path="/admin" element={
          <AdminRoute><AdminLayout /></AdminRoute>
        }>
          <Route index element={<AdminRoute roles={['ADMIN']}><DashboardPage /></AdminRoute>} />
          <Route path="users"     element={<AdminRoute roles={['ADMIN']}><UsersPage /></AdminRoute>} />
          <Route path="surveys"   element={<AdminRoute roles={['ADMIN']}><SurveysPage /></AdminRoute>} />
          <Route path="anomalies" element={<AnomaliesPage />} />
          <Route path="export"    element={<ExportPage />} />
          <Route path="profile"   element={<ProfilePage />} />
        </Route>

      </Routes>
    </BrowserRouter>
    </WebSocketProvider>
  );
}
