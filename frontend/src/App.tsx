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

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div className="p-8 text-center text-textMuted">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="survey/:id" element={<TakeSurveyPage />} />
          <Route path="results/:id" element={<ResultsPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="create" element={<ProtectedRoute><CreateSurveyPage /></ProtectedRoute>} />
          <Route path="my-surveys" element={<ProtectedRoute><MySurveysPage /></ProtectedRoute>} />
          <Route path="edit/:id" element={<ProtectedRoute><EditSurveyPage /></ProtectedRoute>} />
          
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
