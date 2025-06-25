import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Transition } from '@headlessui/react';
import routes from './routes';
import Navbar from './components/common/Navbar';
import ConnectionStatus from './components/common/ConnectionStatus';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext'; 
import { DownloadStatusProvider } from './contexts/DownloadStatusContext'; 
import { ToastContainer } from 'react-toastify'; 
import 'react-toastify/dist/ReactToastify.css'; 
import eventBusService from './services/eventBusService';
import './services/websocketManager';

const AppContent = () => {
  const location = useLocation();

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  return (
    <div className="min-h-screen bg-gray-100">
      {!isAuthPage && <Navbar />}

      <Transition
        show={true}
        appear={true}
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-150"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <main className="pt-16 -mt-16"> {/* Completely eliminate gap, content starts right below navbar */}
          <Routes>
            {routes.map((route, index) => (
              <Route key={index} path={route.path} element={route.element} />
            ))}
          </Routes>
        </main>
      </Transition>
    </div>
  );
};

const App = () => {
  React.useEffect(() => {
    eventBusService.initialize();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider> {/* Wrap DownloadStatusProvider and Router */}
        <DownloadStatusProvider>
          <Router>
            <AppContent />
            <ConnectionStatus />
          {/* Add ToastContainer here for global toast notifications */}
          <ToastContainer
            position="bottom-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="colored" 
          />
          </Router>
        </DownloadStatusProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
