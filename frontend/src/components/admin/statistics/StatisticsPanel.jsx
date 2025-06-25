import React, { useState, useEffect } from 'react';
import adminService from '../../../services/adminService';
import apiService from '../../../services/apiService';
import { toast } from 'react-hot-toast'; 

const StatisticsPanel = () => {
  const [stats, setStats] = useState(null);
  const [usageStats, setUsageStats] = useState([]);
  const [logs, setLogs] = useState([]);
  const [period, setPeriod] = useState('daily');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState({
    stats: true,
    usage: true,
    logs: true
  });
  const [error, setError] = useState('');

  // Fetch system statistics
  useEffect(() => {
    const fetchStatistics = async () => {
      try {
        setLoading(prev => ({ ...prev, stats: true }));
        const response = await apiService.get('/admin/stats');
        let statsData = response?.data?.data || response?.data || response || {};
        if (!statsData || Object.keys(statsData).length === 0) {
          setError('No statistics data available. The server returned an empty response.');
        } else {
          setStats(statsData);
        }
        setLoading(prev => ({ ...prev, stats: false }));
      } catch (err) {
        console.error('Error fetching statistics:', err);
        setError('Failed to load system statistics: ' + (err.message || 'Unknown error'));
        setLoading(prev => ({ ...prev, stats: false }));
      }
    };
    fetchStatistics();
  }, []);

  // Fetch usage statistics based on selected period
  useEffect(() => {
    const fetchUsageStats = async () => {
      try {
        setLoading(prev => ({ ...prev, usage: true }));
        const response = await apiService.get('/admin/usage', {
          params: { period, limit: 100 } 
        });
        let usageData = (response?.data?.data && Array.isArray(response.data.data)) ? response.data.data :
                        (response?.data && Array.isArray(response.data)) ? response.data :
                        (Array.isArray(response)) ? response : [];
        setUsageStats(usageData);
        setLoading(prev => ({ ...prev, usage: false }));
      } catch (err) {
        console.error('Error fetching usage stats:', err);
        setError('Failed to load usage statistics: ' + (err.message || 'Unknown error'));
        setLoading(prev => ({ ...prev, usage: false }));
      }
    };
     fetchUsageStats();
     setCurrentPage(1);
   }, [period]);

   // Fetch system logs
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(prev => ({ ...prev, logs: true }));
        const response = await apiService.get('/admin/logs', {
          params: { limit: 10, offset: 0 }
        });
        let logsArray = [];
        const responseData = response?.data || response;
        if (Array.isArray(responseData)) {
          logsArray = responseData;
        } else if (responseData?.data && Array.isArray(responseData.data)) {
          logsArray = responseData.data;
        } else if (responseData?.logs && Array.isArray(responseData.logs)) {
          logsArray = responseData.logs;
        } else if (responseData?.items && Array.isArray(responseData.items)) {
          logsArray = responseData.items;
        } else if (responseData?.results && Array.isArray(responseData.results)) {
          logsArray = responseData.results;
        }
        setLogs(logsArray);
        setLoading(prev => ({ ...prev, logs: false }));
      } catch (err) {
        console.error('Error fetching logs:', err);
        setError('Failed to load system logs');
        setLoading(prev => ({ ...prev, logs: false }));
      }
    };
    fetchLogs();
   }, []);

   // --- Date Formatting Helpers ---
  const getWeekNumber = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return [d.getUTCFullYear() % 100, weekNo];
  };

  const formatTimePeriod = (timePeriodString, selectedPeriod) => {
    try {
      const date = new Date(timePeriodString);
      if (isNaN(date.getTime())) return timePeriodString;
      switch (selectedPeriod) {
        case 'daily': return date.toLocaleDateString('en-CA');
        case 'weekly': const [yearW, weekNo] = getWeekNumber(date); return `Week ${weekNo}/${yearW}`;
        case 'monthly': return date.toLocaleDateString('en-US', { month: 'long', year: '2-digit' });
        default: return timePeriodString;
      }
    } catch (e) { console.error("Error formatting time period:", e); return timePeriodString; }
  };

   const formatLogTimestamp = (dateString) => {
     const date = new Date(dateString);
     return date.toLocaleString();
   };
  // --- End Date Formatting Helpers ---

  // --- Download Handler ---
  // --- Download Handler ---
  // --- Download Handler ---
  const handleDownloadLogs = async () => {
    try {
      // Removed console.log("Attempting log download...")
      // Request without specifying responseType, let Axios handle default (likely text/json)
      // Or explicitly set responseType: 'text' if needed, but default often works for text/csv
      const response = await apiService.get('/admin/logs/download', {
         // responseType: 'text' // Explicitly request text if default fails
      });

      // Removed console.log("Received response...")

      // Axios might return the string directly, or nested under .data
      const csvText = typeof response === 'string' ? response : (typeof response.data === 'string' ? response.data : null);

      if (typeof csvText !== 'string' || !csvText.startsWith('id,user_id,username')) {
          console.error("Received data is not a valid CSV string!", csvText);
          toast.error("Received unexpected data format from server.");
          setError("Received unexpected data format from server.");
          return;
      }

      // Removed console.log("Received valid CSV text...")

      // --- Create Blob from Text ---
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' }); // Specify charset
      const link = document.createElement('a');
      const url = window.URL.createObjectURL(blob);
      link.href = url;
      link.setAttribute('download', 'scalytics_connect_activity_log.csv');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Log download started.'); // Use success for consistency
      // --- End Original Download Logic ---

    } catch (err) {
      console.error('Error downloading logs:', err); // Keep error logging
      // Attempt to parse error response if it's JSON in a blob
      let errorMessage = 'Failed to download logs.';
      if (err.response && err.response.data instanceof Blob && err.response.data.type === 'application/json') {
        try {
          const errorJson = JSON.parse(await err.response.data.text());
          errorMessage = errorJson.message || errorMessage;
        } catch (parseError) {
          // Ignore if parsing fails
        }
      } else if (err.response && err.response.data && err.response.data.message) {
         errorMessage = err.response.data.message;
      } else if (err.message) {
         errorMessage = err.message;
      }
      toast.error(errorMessage);
      setError(errorMessage); // Also set panel error if needed
    }
  };
  // --- End Download Handler ---


  // --- Pagination Logic ---
  const itemsPerPage = 6;
  const totalPages = Math.ceil(usageStats.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  // Slice the full usageStats array for the current page display
  const currentUsageStats = usageStats.slice(startIndex, endIndex);

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };
  // --- End Pagination Logic ---

  return (
    <div className="space-y-6">
      {/* Error message */}
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400 dark:text-red-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Error</h3>
              <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats overview - RESTORED */}
      <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">System Overview</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Key metrics for Scalytics Connect platform.
          </p>
        </div>
        {loading.stats ? (
          <div className="animate-pulse p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/2 mb-2"></div>
                  <div className="h-6 bg-gray-300 dark:bg-gray-500 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-5 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <dt className="text-sm font-medium text-blue-500 dark:text-dark-link">Total Users</dt>
                <dd className="mt-1 text-3xl font-semibold text-blue-700 dark:text-dark-link">
                  {adminService.formatNumber(stats?.users || 0)}
                </dd>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
                <dt className="text-sm font-medium text-green-500 dark:text-green-300">Total Models</dt>
                <dd className="mt-1 text-3xl font-semibold text-green-700 dark:text-green-200">
                  {adminService.formatNumber(stats?.models?.total || 0)}
                </dd>
                <p className="text-xs text-green-600 dark:text-green-300 mt-1">
                  {adminService.formatNumber(stats?.models?.active || 0)} active
                </p>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                <dt className="text-sm font-medium text-purple-500 dark:text-purple-300">Total Chats</dt>
                <dd className="mt-1 text-3xl font-semibold text-purple-700 dark:text-purple-200">
                  {adminService.formatNumber(stats?.chats || 0)}
                </dd>
              </div>
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                <dt className="text-sm font-medium text-yellow-500 dark:text-yellow-300">Total Messages</dt>
                <dd className="mt-1 text-3xl font-semibold text-yellow-700 dark:text-yellow-200">
                  {adminService.formatNumber(stats?.messages || 0)}
                </dd>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-300">Input Tokens</dt>
                <dd className="mt-1 text-2xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  {adminService.formatNumber(stats?.usage?.totalTokensInput || 0)}
                </dd>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-300">Output Tokens</dt>
                <dd className="mt-1 text-2xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  {adminService.formatNumber(stats?.usage?.totalTokensOutput || 0)}
                </dd>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Usage over time */}
      <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Usage Over Time</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">Platform usage statistics by time period.</p>
          </div>
          <div>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
              {/* Hourly option removed as per requirement */}
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>
        {loading.usage ? (
          <div className="animate-pulse p-4"> <div className="h-64 bg-gray-100 dark:bg-gray-700 rounded"></div> </div>
        ) : (
          <div className="px-4 py-5 sm:p-6">
            {usageStats.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">No usage data available for the selected period.</div>
            ) : (
              <>
                <div className="overflow-x-auto border border-gray-200 dark:border-dark-border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                    <thead className="bg-gray-50 dark:bg-dark-secondary">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Period</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Unique Users</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Chats</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Input Tokens</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Output Tokens</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total Tokens</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Avg Tokens/User</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
                      {/* Map over current page's data */}
                      {currentUsageStats.map((stat, index) => (
                        <tr key={`${period}-${startIndex + index}`} className="hover:bg-gray-50 dark:hover:bg-dark-secondary">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                            {formatTimePeriod(stat.time_period, period)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{stat.unique_users}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{stat.chat_count}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{adminService.formatNumber(stat.tokens_input)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{adminService.formatNumber(stat.tokens_output)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{adminService.formatNumber((stat.tokens_input || 0) + (stat.tokens_output || 0))}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {stat.unique_users > 0 ? adminService.formatNumber(Math.round(((stat.tokens_input || 0) + (stat.tokens_output || 0)) / stat.unique_users)) : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      onClick={handlePrevPage}
                      disabled={currentPage === 1}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-700 dark:text-gray-400">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Recent system logs - RESTORED */}
      <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Recent Activity</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              Latest important system logs and user activities.
            </p>
          </div>
          {/* Changed <a> to <button> with onClick handler */}
          <button
            onClick={handleDownloadLogs}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Download Full Log
          </button>
        </div>
        {loading.logs ? (
          <div className="animate-pulse p-4 space-y-3">
             {[...Array(5)].map((_, i) => (
              <div key={i} className="flex space-x-4">
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-600 rounded-full"></div>
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-5 sm:p-6">
            {logs.length === 0 ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                No recent logs available.
              </div>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-dark-border">
                {logs && Array.isArray(logs) && logs.map((log) => (
                  <li key={log.id} className="py-4">
                    <div className="flex space-x-3">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-blue-600 dark:bg-blue-700 flex items-center justify-center text-white">
                          {log.username.charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium dark:text-dark-text-primary">{log.username}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{formatLogTimestamp(log.created_at)}</p>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {log.action} {log.details ? `- ${log.details}` : ''}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatisticsPanel;
