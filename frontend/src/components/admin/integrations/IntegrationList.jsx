import React from 'react';
import { useTheme } from '../../../contexts/ThemeContext';

const IntegrationList = ({ integrations, onEdit, onDelete, onToggle }) => {
  useTheme();
  if (!integrations || integrations.length === 0) {
    return <div className="py-4"></div>;
  }

  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-dark-border rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
        <thead className="bg-gray-50 dark:bg-dark-secondary">
          <tr>
            <th 
              scope="col" 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
            >
              Name
            </th>
            <th 
              scope="col" 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
            >
              Status
            </th>
            <th 
              scope="col" 
              className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
          {integrations.map((integration) => (
            <tr key={integration.id} className="hover:bg-gray-50 dark:hover:bg-dark-secondary">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  {/* Icon based on provider */}
                  <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-dark-secondary">
                    {integration.provider === 'google' && (
                      <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.545 12.151L12.545 12.151L12.545 12.151Q11.222 12.151 10.257 11.534Q9.293 10.917 8.887 9.812L8.887 9.812L8.887 9.812Q8.85 9.711 8.85 9.535Q8.85 9.36 8.899 9.198L8.899 9.198L8.899 9.198Q9.688 9.198 10.581 9.413Q11.475 9.628 12.343 10.069L12.343 10.069L12.343 10.069Q12.407 10.108 12.471 10.335Q12.534 10.562 12.534 10.666L12.534 10.666L12.534 10.666Q12.534 11.136 12.179 11.644Q11.823 12.151 11.12 12.151L11.12 12.151L11.12 12.151Q11.823 12.151 12.184 12.151Q12.545 12.151 12.545 12.151Z" />
                        <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" />
                      </svg>
                    )}
                    {integration.provider === 'github' && (
                      <svg className="h-6 w-6 text-gray-800 dark:text-dark-text-primary" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.157-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.268 2.75 1.026A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.026 2.747-1.026.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.841-2.337 4.687-4.565 4.935.359.309.678.92.678 1.855 0 1.338-.012 2.417-.012 2.745 0 .268.18.58.688.482A10.019 10.019 0 0022 12c0-5.523-4.477-10-10-10z" />
                      </svg>
                    )}
                    {integration.provider === 'microsoft' && (
                      <svg className="h-5 w-5 text-blue-500" viewBox="0 0 23 23" fill="currentColor">
                        <path fill="#f25022" d="M1 1h10v10H1z"/>
                        <path fill="#00a4ef" d="M1 12h10v10H1z"/>
                        <path fill="#7fba00" d="M12 1h10v10H12z"/>
                        <path fill="#ffb900" d="M12 12h10v10H12z"/>
                      </svg>
                    )}
                    {integration.provider === 'azure_ad' && (
                      <svg className="h-5 w-5 text-blue-700" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 2l12 11-12 9V2z" fill="#0072C6" />
                      </svg>
                    )}
                    {integration.provider === 'okta' && (
                      <svg className="h-5 w-5 text-blue-700" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.389 0 0 5.35 0 12s5.389 12 12 12 12-5.35 12-12S18.611 0 12 0zm0 18c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z" />
                      </svg>
                    )}
                    {/* Generic icon for other providers */}
                    {!['google', 'github', 'microsoft', 'okta'].includes(integration.provider) && (
                      <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                      {integration.name}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {integration.provider}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span 
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${integration.enabled 
                      ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' 
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}
                >
                  {integration.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button 
                    onClick={() => onEdit(integration)}
                    className="text-blue-600 hover:text-blue-900 dark:text-dark-link dark:hover:text-dark-link mr-3"
                  >
                    Edit
                  </button>
                <button
                  onClick={() => onToggle(integration.id)}
                  className={`${
                    integration.enabled 
                      ? 'text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300' 
                      : 'text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300'
                  } mr-3`}
                >
                  {integration.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => onDelete(integration.id)}
                  className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default IntegrationList;
