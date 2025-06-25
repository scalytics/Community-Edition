import React from 'react';
import PropTypes from 'prop-types';

/**
 * Table component to display API providers with actions
 * 
 * @param {Object} props Component props
 * @param {Array} props.providers List of provider objects to display
 * @param {Function} props.onEdit Callback when edit button is clicked (for Local provider)
 * @param {Function} props.onDelete Callback when delete button is clicked (for Local provider)
 * @param {Function} props.onToggleActive Callback when activate/deactivate button is clicked (for external providers)
 * @param {boolean} [props.loading=false] Whether the data is currently loading
 * @returns {JSX.Element} Rendered component
 */
const ProvidersTable = ({
  providers,
  onEdit,
  onDelete,
  onToggleActive,
  isScalyticsApiGloballyEnabled,
  isPrivacyModeEnabled, 
  loading = false
}) => {

  // Group and sort providers
  const { internalProviders, externalProviders } = React.useMemo(() => {
    if (!providers || !Array.isArray(providers)) {
      return { internalProviders: [], externalProviders: [] };
    }

    // Group providers based on the is_external flag
    const internal = providers
      .filter(p => p.is_external === 0 || p.is_external === false)
      .sort((a, b) => a.name.localeCompare(b.name));

    const external = providers
      .filter(p => p.is_external === 1 || p.is_external === true) 
      .sort((a, b) => a.name.localeCompare(b.name));

    return { internalProviders: internal, externalProviders: external };
  }, [providers]);

  if (loading) {
    return (
      <div className="animate-pulse p-6 space-y-4">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  if (!providers || !Array.isArray(providers) || providers.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
        <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-dark-text-primary">No providers configured</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Add a new provider to start using external API models.
        </p>
      </div>
    );
  }

  return (
    // Add a wrapper div with overflow-x-auto to contain horizontal scrolling
    <div className="overflow-x-auto border border-gray-200 dark:border-dark-border rounded-lg"> 
      <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
        <thead className="bg-gray-50 dark:bg-dark-secondary">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              Name
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              API URL
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
          {/* Internal Providers Section */}
          {internalProviders.length > 0 && (
            <>
              <tr>
                <td colSpan="4" className="px-4 py-2 bg-gray-100 dark:bg-dark-secondary text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  Internal APIs
                </td>
              </tr>
              {internalProviders.map((provider) => {
                 const isScalyticsApiProvider = provider.name === 'Scalytics API';
                 const isScalyticsMcpProvider = provider.name === 'Scalytics MCP';
                 const effectiveStatus = isScalyticsApiProvider 
                   ? isScalyticsApiGloballyEnabled 
                   : provider.is_active; 
                 
                 return (
                   <tr key={provider.id} className="hover:bg-gray-50 dark:hover:bg-dark-secondary">
                     {/* Name & Description */}
                     <td className="px-6 py-4 whitespace-nowrap">
                       {/* Use standard text color for all provider names */}
                       <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{provider.name}</div>
                       <div className="text-sm text-gray-500 dark:text-gray-400">{provider.description}</div>
                     </td>
                     {/* API URL */}
                     <td className="px-6 py-4 whitespace-nowrap">
                       <div className="text-sm text-gray-500 dark:text-gray-400">{provider.api_url || 'N/A'}</div>
                     </td>
                     {/* Status */}
                     <td className="px-6 py-4 whitespace-nowrap">
                       <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                         effectiveStatus
                           ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' 
                           : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                       }`}>
                         {effectiveStatus ? 'Active' : 'Inactive'}
                         {isScalyticsApiProvider && <span className="ml-1"></span>}
                       </span>
                     </td>
                     {/* Actions */}
                     <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                        {/* Scalytics API: Managed Globally */}
                        {isScalyticsApiProvider && (
                           <span className="text-xs text-gray-400 italic">Managed Globally</span>
                        )}
                        {/* Scalytics MCP: Activate/Deactivate, Edit */}
                        {isScalyticsMcpProvider && (
                          <>
                            {provider.is_active ? (
                              <button onClick={() => onToggleActive(provider.id, false)} className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-300">Deactivate</button>
                            ) : (
                              <button onClick={() => onToggleActive(provider.id, true)} className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300">Activate</button>
                            )}
                            <button onClick={() => onEdit(provider)} className="text-blue-600 dark:text-dark-link hover:text-blue-900 dark:hover:text-dark-link">Edit</button>
                            {/* No Delete for MCP */}
                          </>
                        )}
                        {/* Other Internal (Manually Added): Activate/Deactivate, Edit, Delete */}
                        {!isScalyticsApiProvider && !isScalyticsMcpProvider && (
                          <>
                            {provider.is_active ? (
                              <button onClick={() => onToggleActive(provider.id, false)} className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-300">Deactivate</button>
                            ) : (
                              <button onClick={() => onToggleActive(provider.id, true)} className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300">Activate</button>
                            )}
                            {/* Edit and Delete will now always be shown for these providers */}
                            <button onClick={() => onEdit(provider)} className="text-blue-600 dark:text-dark-link hover:text-blue-900 dark:hover:text-dark-link">Edit</button>
                            <button onClick={() => onDelete(provider.id)} className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300">Delete</button>
                          </>
                        )}
                     </td>
                   </tr>
                 );
              })}
            </>
          )}

          {/* External Providers Section */}
          {externalProviders.length > 0 && (
             <>
               <tr>
                 <td colSpan="4" className="px-4 py-2 bg-gray-100 dark:bg-dark-secondary text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                   External Providers
                 </td>
               </tr>
               {externalProviders.map((provider) => {
                 const effectiveStatus = provider.is_active; // External providers use their own flag
                 return (
                   <tr key={provider.id} className="hover:bg-gray-50 dark:hover:bg-dark-secondary">
                     {/* Name & Description */}
                     <td className="px-6 py-4 whitespace-nowrap">
                       <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{provider.name}</div>
                       <div className="text-sm text-gray-500 dark:text-gray-400">{provider.description}</div>
                     </td>
                     {/* API URL */}
                     <td className="px-6 py-4 whitespace-nowrap">
                       <div className="text-sm text-gray-500 dark:text-gray-400">{provider.api_url || 'N/A'}</div>
                     </td>
                     {/* Status */}
                     <td className="px-6 py-4 whitespace-nowrap">
                       <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                         effectiveStatus
                           ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' 
                           : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                       }`}>
                         {effectiveStatus ? 'Active' : 'Inactive'}
                       </span>
                     </td>
                     {/* Actions */}
                     <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                        {/* Actions for External Providers */}
                        {provider.is_active ? (
                          <button 
                            onClick={isPrivacyModeEnabled ? undefined : () => onToggleActive(provider.id, false)} 
                            className={`text-yellow-600 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-300 ${isPrivacyModeEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={isPrivacyModeEnabled}
                            title={isPrivacyModeEnabled ? "Cannot deactivate external providers while Privacy Mode is enabled" : "Deactivate Provider"}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={isPrivacyModeEnabled ? undefined : () => onToggleActive(provider.id, true)}
                            className={`text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 ${isPrivacyModeEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={isPrivacyModeEnabled}
                            title={isPrivacyModeEnabled ? "Cannot activate external providers while Privacy Mode is enabled" : "Activate Provider"}
                          >
                            Activate
                          </button>
                        )}
                        {/* Edit button only for manual providers - Ensure boolean evaluation */}
                        {!!provider.is_manual && (
                          <button onClick={() => onEdit(provider)} className="text-blue-600 dark:text-dark-link hover:text-blue-900 dark:hover:text-dark-link">Edit</button>
                        )}
                        {/* Delete button only for manual providers - Ensure boolean evaluation */}
                        {!!provider.is_manual && (
                          <button onClick={() => onDelete(provider.id)} className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300">Delete</button>
                        )}
                        {/* Show message if not manual - Ensure boolean evaluation */}
                        {!provider.is_manual && (
                           <span className="text-xs text-gray-400 italic">Default Provider</span>
                        )}
                     </td>
                   </tr>
                 );
               })}
             </>
          )}
        </tbody>
      </table>
    </div>
  );
};

ProvidersTable.propTypes = {
  providers: PropTypes.array.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onToggleActive: PropTypes.func.isRequired,
  isScalyticsApiGloballyEnabled: PropTypes.bool.isRequired,
  isPrivacyModeEnabled: PropTypes.bool.isRequired, // Added prop type for privacy mode
  loading: PropTypes.bool
};

export default ProvidersTable;
