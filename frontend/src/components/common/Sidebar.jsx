import React, { useState } from 'react';
 import PropTypes from 'prop-types';
 import { Link, useLocation } from 'react-router-dom';
 import { classNames } from '../../utils/classNames';
 import { useAuth } from '../../contexts/AuthContext'; 
 
const HomeIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const ChatIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
  </svg>
);

const AdminIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const SettingsIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const DocumentationIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const AIAgentsIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17c.612-1.576 1.707-3 3-3h8c1.293 0 2.388 1.424 3 3M11 5.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 3a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-9 2a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6-4.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
   </svg>
 );
 
 const Sidebar = ({ children }) => { 
   const [sidebarOpen, setSidebarOpen] = useState(false);
   const location = useLocation();
   const { user } = useAuth(); 

  const showAdminLink = user?.isAdmin || (user?.permissions && user.permissions.length > 0);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const mainNavigation = [
     { name: 'Dashboard', href: '/dashboard', icon: HomeIcon, current: location.pathname === '/dashboard' },
     { name: 'Chats', href: '/chat', icon: ChatIcon, current: location.pathname.startsWith('/chat') },
     { name: 'AI Agents', href: '/ai-agents', icon: AIAgentsIcon, current: location.pathname.startsWith('/ai-agents') },
   ];

   const adminNavigation = [
    ...(showAdminLink ? [{ name: 'Admin', href: '/admin', icon: AdminIcon, current: location.pathname.startsWith('/admin') }] : []),
    { name: 'Settings', href: '/settings', icon: SettingsIcon, current: location.pathname.startsWith('/settings') },
    { name: 'Documentation', href: '/documentation', icon: DocumentationIcon, current: location.pathname.startsWith('/documentation') }
  ];

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100 dark:bg-dark-primary pt-14 -mt-1"> 
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 flex md:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75 dark:bg-dark-primary dark:bg-opacity-80"></div>
        </div>
      )}

      <div
        className={`fixed inset-0 flex z-40 md:hidden transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } transition-transform duration-300 ease-in-out pt-14 -mt-1`} 
      >
        <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white dark:bg-dark-primary">
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            {sidebarOpen && (
              <button
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sr-only">Close sidebar</span>
                <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
            <nav className="mt-5 px-2 space-y-1">
              {mainNavigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={classNames(
                      item.current
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary'
                        : 'text-gray-600 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-dark-text-primary',
                      'group flex items-center px-2 py-2 text-sm font-medium rounded-md'
                    )}
                  >
                    <item.icon
                      className={classNames(
                        item.current ? 'text-gray-500 dark:text-dark-text-primary' : 'text-gray-400 dark:text-dark-text-secondary group-hover:text-gray-500 dark:group-hover:text-dark-text-primary',
                        'mr-3 flex-shrink-0 h-6 w-6'
                      )}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
              ))}

              {adminNavigation.length > 0 && (
                <div className="h-[50px]"></div>
              )}

              {adminNavigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={classNames(
                    item.current
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary'
                      : 'text-gray-600 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-dark-text-primary',
                    'group flex items-center px-2 py-2 text-sm font-medium rounded-md'
                  )}
                >
                  <item.icon
                    className={classNames(
                      item.current ? 'text-gray-500 dark:text-dark-text-primary' : 'text-gray-400 dark:text-dark-text-secondary group-hover:text-gray-500 dark:group-hover:text-dark-text-primary',
                      'mr-3 flex-shrink-0 h-6 w-6'
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64 border-r border-gray-200 dark:border-dark-border bg-white dark:bg-dark-primary">
          <div className="h-0 flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
            <nav className="mt-5 flex-1 px-2 bg-white dark:bg-dark-primary space-y-1">
               {mainNavigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`
                      group flex items-center px-2 py-2 text-sm font-medium rounded-md
                      ${item.current
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary'
                        : 'text-gray-600 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-dark-text-primary'}
                    `}
                  >
                    <item.icon
                      className={`
                        mr-3 h-6 w-6
                        ${item.current ? 'text-blue-600 dark:text-dark-link' : 'text-gray-400 dark:text-dark-text-secondary group-hover:text-gray-500 dark:group-hover:text-dark-text-primary'}
                      `}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
              ))}

              {adminNavigation.length > 0 && (
                <div className="h-[50px]"></div>
              )}

              {adminNavigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                    className={`
                      group flex items-center px-2 py-2 text-sm font-medium rounded-md
                      ${item.current
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary'
                        : 'text-gray-600 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-dark-text-primary'}
                  `}
                  >
                    <item.icon
                      className={`
                        mr-3 h-6 w-6
                        ${item.current ? 'text-blue-600 dark:text-dark-link' : 'text-gray-400 dark:text-dark-text-secondary group-hover:text-gray-500 dark:group-hover:text-dark-text-primary'}
                      `}
                      aria-hidden="true"
                    />
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <div className="flex flex-col w-0 flex-1"> 
        <div className="md:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 z-30">
          <button
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            onClick={toggleSidebar}
          >
            <span className="sr-only">Open sidebar</span>
            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
};

Sidebar.propTypes = {
  children: PropTypes.node.isRequired 
};

export default Sidebar;
