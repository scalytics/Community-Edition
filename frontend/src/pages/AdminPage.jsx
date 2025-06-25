import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import StatisticsPanel from '../components/admin/statistics';
import UserManager from '../components/admin/users';
import ModelManager from '../components/admin/models';
import ProvidersAdmin from '../components/admin/providers';
import HardwareMonitor from '../components/admin/hardware';
import HuggingFaceModelManager from '../components/admin/huggingface';
import MaintenancePanel from '../components/admin/maintenance';
import IntegrationsManager from '../components/admin/integrations/IntegrationsManager';
import LocalToolsManager from '../components/admin/local-tools/LocalToolsManager'; 
import { useAuth } from '../contexts/AuthContext';
import { ModelStatusProvider } from '../contexts/ModelStatusContext';

const AdminPage = () => {
  const { section = 'stats' } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth(); 
  const [accessibleTabs, setAccessibleTabs] = useState([]);

  const allTabs = useMemo(() => [
    { name: 'Statistics', id: 'stats', requiredPermission: 'stats:view' },
    { name: 'Users', id: 'users', requiredPermission: 'users:manage' },
    { name: 'Models', id: 'models', requiredPermission: 'models:manage' },
    { name: 'Hugging Face', id: 'huggingface', requiredPermission: 'huggingface:access' }, 
    { name: 'API Provider', id: 'providers', requiredPermission: 'providers:manage' }, 
    { name: 'Hardware', id: 'hardware', requiredPermission: 'hardware:view' },
    { name: 'Maintenance', id: 'system', requiredPermission: 'access_admin' }, 
    { name: 'Integrations', id: 'integrations', requiredPermission: 'view_integrations' },
    { name: 'Local Tools', id: 'local-tools', requiredPermission: 'access_admin' }
  ], []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      navigate('/login');
      return;
    }

    const userPermissions = user.permissions || [];
    const canAccessAdmin = user.isAdmin || userPermissions.length > 0;

    if (!canAccessAdmin) {
      navigate('/dashboard');
      return;
    }

    const visibleTabs = allTabs.filter(tab =>
      user.isAdmin || userPermissions.includes(tab.requiredPermission)
    );

    setAccessibleTabs(visibleTabs);

    if (visibleTabs.length === 0) {
       navigate('/dashboard');
    } else if (!visibleTabs.some(tab => tab.id === section)) {
       navigate(`/admin/${visibleTabs[0].id}`);
    }
  }, [user, authLoading, navigate, section, allTabs]);

  const handleTabChange = (tabId) => {
    navigate(`/admin/${tabId}`);
  };

  // Use authLoading state from context for initial render check
  if (authLoading) {
    return (
      <Sidebar>
        <div className="flex justify-center items-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </Sidebar>
    );
  }

  // Use context-based access denied check
  if (!user?.isAdmin && (!user?.permissions || user.permissions.length === 0)) {
     return (
       <Sidebar>
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-dark-text-primary sm:text-4xl">Access Denied</h1>
            <p className="mt-4 text-lg text-gray-500 dark:text-dark-text-secondary">You don't have permission to access the admin area.</p>
          </div>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div className="py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-dark-text-primary">Admin Dashboard</h1>

          <div className="py-4">
            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-dark-border">
              <nav className="-mb-px flex space-x-8">
                {accessibleTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`
                      whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                      ${section === tab.id
                        ? 'border-blue-500 text-blue-600 dark:text-dark-link'
                        : 'border-transparent text-gray-500 dark:text-dark-text-secondary hover:text-gray-700 dark:hover:text-dark-text-primary hover:border-gray-300 dark:hover:border-gray-600'}
                    `}
                  >
                    {tab.name}
                  </button>
                ))}
              </nav>
            </div>

            {/* Admin content based on selected tab */}
            <div className="mt-4">
              {/* Only render component if user has permission for this tab */}
              {section === 'stats' && 
                accessibleTabs.some(tab => tab.id === 'stats') && 
                <StatisticsPanel />
              }
              {section === 'users' && 
                accessibleTabs.some(tab => tab.id === 'users') && 
                <UserManager />
              }
              {section === 'models' && 
                accessibleTabs.some(tab => tab.id === 'models') && 
                <ModelStatusProvider>
                  <ModelManager />
                </ModelStatusProvider>
              }
              {section === 'huggingface' && 
                accessibleTabs.some(tab => tab.id === 'huggingface') && 
                <HuggingFaceModelManager />
              }
              {section === 'providers' && 
                accessibleTabs.some(tab => tab.id === 'providers') && 
                <ProvidersAdmin />
              }
              {section === 'hardware' && 
                accessibleTabs.some(tab => tab.id === 'hardware') && 
                <HardwareMonitor />
              }
              {section === 'system' && 
                accessibleTabs.some(tab => tab.id === 'system') && 
                <MaintenancePanel />
              }
              {section === 'integrations' && 
                accessibleTabs.some(tab => tab.id === 'integrations') && 
                <IntegrationsManager />
              }
              {/* Removed direct rendering for filtering tab */}
              {section === 'local-tools' &&
                accessibleTabs.some(tab => tab.id === 'local-tools') &&
                <LocalToolsManager />
              }

              {/* Show message if user doesn't have permission for this tab */}
              {!accessibleTabs.some(tab => tab.id === section) && (
                <div className="py-12 text-center">
                  <h2 className="text-xl font-medium text-gray-900 dark:text-dark-text-primary">Access Denied</h2>
                  <p className="mt-2 text-gray-500 dark:text-dark-text-secondary">
                    You don't have permission to access this module.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Sidebar>
  );
};

export default AdminPage;
