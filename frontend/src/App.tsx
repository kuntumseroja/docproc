import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WorkflowsPage from './pages/WorkflowsPage';
import UploadPage from './pages/UploadPage';
import SampleReviewPage from './pages/SampleReviewPage';
import WorkflowBuilderPage from './pages/WorkflowBuilderPage';
import ChatPage from './pages/ChatPage';
import CompliancePage from './pages/CompliancePage';
import DataRepositoryPage from './pages/DataRepositoryPage';
import WorkflowDetailPage from './pages/WorkflowDetailPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Dashboard is public — accessible without login */}
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
        </Route>
        {/* All other routes require authentication */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/new" element={<WorkflowBuilderPage />} />
          <Route path="/workflows/:workflowId" element={<WorkflowDetailPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/review" element={<SampleReviewPage />} />
          <Route path="/repository" element={<DataRepositoryPage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/documents/:documentId" element={<DocumentDetailPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
