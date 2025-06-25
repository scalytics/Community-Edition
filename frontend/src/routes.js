import React from 'react';
import { Navigate } from 'react-router-dom';
import authService from './services/authService';
import { useAuth } from './contexts/AuthContext';

// Pages
import LoginPage from './pages/LoginPage';
import SetPasswordPage from './pages/SetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import AIAgentsPage from './pages/AIAgentsPage';
// Removed unused AgentDetailPage import
import GitHubCallback from './pages/GitHubCallback';
import DocumentationPage from './pages/DocumentationPage';


const ProtectedRoute = ({ children }) => {
  const isAuthenticated = authService.isAuthenticated();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: { pathname: window.location.pathname } }} />;
  }
  return children;
};

// Admin route wrapper component - Updated to use AuthContext
const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth(); 

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const canAccessAdmin = user?.isAdmin || user?.permissions?.includes('access_admin');

  if (!user) {
    return <Navigate to="/login" replace state={{ from: { pathname: window.location.pathname } }} />;
  }

  if (!canAccessAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const PublicRoute = ({ children }) => {
  const isAuthenticated = authService.isAuthenticated();
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

const routes = [
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />
  },
  {
    path: '/login',
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    )
  },
  {
    path: '/set-password',
    element: (
      <PublicRoute>
        <SetPasswordPage />
      </PublicRoute>
    )
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <DashboardPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/chat',
    element: (
      <ProtectedRoute>
        <ChatPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/chat/:id',
    element: (
      <ProtectedRoute>
        <ChatPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/settings',
    element: (
      <ProtectedRoute>
        <SettingsPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/settings/:section',
    element: (
      <ProtectedRoute>
        <SettingsPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/ai-agents',
    element: (
      <ProtectedRoute>
        <AIAgentsPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/ai-agents/:taskId', // This will match '/ai-agents/scalytics-seek' or '/ai-agents/agent-id'
    element: (
      <ProtectedRoute>
        <AIAgentsPage />
      </ProtectedRoute>
     )
   },
   {
     path: '/admin',
     element: (
      <AdminRoute>
        <AdminPage />
      </AdminRoute>
    )
  },
  {
    path: '/admin/:section',
    element: (
      <AdminRoute>
        <AdminPage />
      </AdminRoute>
    )
  },
  {
    path: '/github/callback',
    element: <GitHubCallback />
  },
  {
    path: '/documentation',
    element: (
      <ProtectedRoute>
        <DocumentationPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/documentation/:docId',
    element: (
      <ProtectedRoute>
        <DocumentationPage />
      </ProtectedRoute>
    )
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />
  }
];

export default routes;
