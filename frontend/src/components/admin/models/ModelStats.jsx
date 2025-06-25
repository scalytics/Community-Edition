import React from 'react';
import PropTypes from 'prop-types';

const ModelStats = ({ modelStats, onClose }) => {
  modelStats = modelStats || { userUsage: [], dailyUsage: [] };
  
  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 dark:bg-dark-primary opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-dark-primary rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white dark:bg-dark-primary px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary" id="modal-title">
                  Model Usage Statistics
                </h3>
                
                <div className="mt-4">
                  {/* Top users */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Top Users</h4>
                    {modelStats.userUsage && modelStats.userUsage.length > 0 ? (
                      <div className="mt-2 overflow-hidden shadow border border-gray-200 dark:border-dark-border md:rounded-lg">
                        <table className="min-w-full divide-y divide-gray-300 dark:divide-dark-border">
                          <thead className="bg-gray-50 dark:bg-dark-secondary">
                            <tr>
                              <th scope="col" className="py-2 pl-4 pr-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300">User</th>
                              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Chats</th>
                              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Input Tokens</th>
                              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Output Tokens</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-dark-border bg-white dark:bg-dark-primary">
                            {modelStats.userUsage.map((user, index) => (
                              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-dark-secondary">
                                <td className="whitespace-nowrap py-2 pl-4 pr-3 text-xs text-gray-900 dark:text-gray-300">{user.username}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{user.chat_count}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{user.tokens_input}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{user.tokens_output}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No user data available</p>
                    )}
                  </div>
                  
                  {/* Daily usage */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Daily Usage</h4>
                    {modelStats.dailyUsage && modelStats.dailyUsage.length > 0 ? (
                      <div className="mt-2 overflow-hidden shadow border border-gray-200 dark:border-dark-border md:rounded-lg">
                        <table className="min-w-full divide-y divide-gray-300 dark:divide-dark-border">
                          <thead className="bg-gray-50 dark:bg-dark-secondary">
                            <tr>
                              <th scope="col" className="py-2 pl-4 pr-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Date</th>
                              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Chats</th>
                              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Input Tokens</th>
                              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Output Tokens</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-dark-border bg-white dark:bg-dark-primary">
                            {modelStats.dailyUsage.map((day, index) => (
                              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-dark-secondary">
                                <td className="whitespace-nowrap py-2 pl-4 pr-3 text-xs text-gray-900 dark:text-gray-300">{day.date}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{day.chat_count}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{day.tokens_input}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{day.tokens_output}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No daily usage data available</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-dark-border shadow-sm px-4 py-2 bg-white dark:bg-dark-primary text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-blue-400 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

ModelStats.propTypes = {
  modelStats: PropTypes.shape({
    userUsage: PropTypes.arrayOf(PropTypes.shape({
      username: PropTypes.string,
      chat_count: PropTypes.number,
      tokens_input: PropTypes.number,
      tokens_output: PropTypes.number
    })),
    dailyUsage: PropTypes.arrayOf(PropTypes.shape({
      date: PropTypes.string,
      chat_count: PropTypes.number,
      tokens_input: PropTypes.number,
      tokens_output: PropTypes.number
    }))
  }).isRequired,
  onClose: PropTypes.func.isRequired
};

export default ModelStats;
