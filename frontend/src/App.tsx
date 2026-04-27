import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import HomePage from '@/pages/HomePage'
import CreateSurveyPage from '@/pages/CreateSurvey/CreateSurveyPage'
import TakeSurveyPage from '@/pages/TakeSurvey/TakeSurveyPage'
import ResultsPage from '@/pages/Results/ResultsPage'
import NotFoundPage from '@/pages/NotFoundPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"                    element={<HomePage />} />
        <Route path="/create"              element={<CreateSurveyPage />} />
        <Route path="/survey/:id"          element={<TakeSurveyPage />} />
        <Route path="/survey/:id/results"  element={<ResultsPage />} />
        <Route path="/404"                 element={<NotFoundPage />} />
        <Route path="*"                    element={<Navigate to="/404" replace />} />
      </Routes>
    </Layout>
  )
}
