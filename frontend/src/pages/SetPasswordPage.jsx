import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from '../components/common/Logo';
import { tokenService } from '../services/auth';
import { useTheme } from '../contexts/ThemeContext';

const SetPasswordPage = () => {
  useTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [/* token */, setToken] = useState(''); 
  // eslint-disable-next-line no-unused-vars
  const [email, setEmail] = useState(''); 
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [showResendForm, setShowResendForm] = useState(false); 
  
  const navigate = useNavigate();
  const location = useLocation();

  // Extract token and email from URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenParam = params.get('token');
    const emailParam = params.get('email');
    
    if (emailParam) {
      setEmail(emailParam);
    }
    
    if (tokenParam) {
      const processedToken = decodeURIComponent(tokenParam);
      setToken(processedToken);
      
      const verifyToken = async () => {
        try {
          setLoading(true);
          setError(''); 
          
          try {
            const integrationService = (await import('../services/integrationService')).default;
            await integrationService.getAuthConfig();
          } catch (err) {
          }
          
          await tokenService.verifyRegistrationToken(processedToken);

          // Set token valid state
          setTokenValid(true);
          setError(''); 
        } catch (err) {
          setTokenValid(false);
          
          // Extract error message from the error object
          let errorMessage = 'Failed to verify registration token';
          if (err.response && err.response.data) {
            errorMessage = err.response.data.message || errorMessage;
          } else if (err.message) {
            errorMessage = err.message;
          }
          
          setError(errorMessage);
          
          // If we have email but token verification failed, show resend form
          if (emailParam) {
            setShowResendForm(true);
          }
        } finally {
          setLoading(false);
        }
      };
      
      verifyToken();
    } else if (emailParam) {
      setTokenValid(false);
      setError('Your registration link is missing required information. Please contact your administrator to resend the invitation.');
      setShowResendForm(true);
    } else {
      setTokenValid(false);
      setError('No registration information provided');
    }
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate passwords
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const params = new URLSearchParams(location.search);
      const tokenFromUrl = params.get('token');
      
      const cleanToken = tokenFromUrl.trim();
      
      // Call the service to set the password
      const response = await tokenService.setPassword(cleanToken, password);
      
      if (response.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setError(response.message || 'Failed to set password');
      }
    } catch (err) {
      // Extract error message from the error object
      let errorMessage = 'An error occurred while setting your password';
      
      if (err.originalError && err.originalError.response && err.originalError.response.data) {
        errorMessage = err.originalError.response.data.message || errorMessage;
      } else if (err.response && err.response.data) {
        errorMessage = err.response.data.message || errorMessage;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Show different content based on token validation state
  const renderContent = () => {
    if (loading && tokenValid === null) {
      return (
        <div className="text-center py-8">
          <div className="animate-spin h-12 w-12 border-4 border-blue-500 rounded-full border-t-transparent mx-auto"></div>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-4">Verifying your registration link...</p>
        </div>
      );
    }
    
    if (tokenValid === false) {
      return (
        <div className="text-center py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-600 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400 dark:text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-400">Invalid Link</h3>
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            </div>
          </div>
          <p className="mb-4 dark:text-dark-text-primary">Your registration link is invalid or has expired.</p>
          <button
            onClick={() => navigate('/login')}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-blue-500"
          >
            Go to Login
          </button>
        </div>
      );
    }
    
    if (success) {
      return (
        <div className="text-center py-8">
          <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400 dark:border-green-600 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400 dark:text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800 dark:text-green-400">Success!</h3>
                <p className="text-sm text-green-700 dark:text-green-400">Your password has been set successfully.</p>
              </div>
            </div>
          </div>
          <p className="mb-4 dark:text-dark-text-primary">You will be redirected to the login page in a moment...</p>
        </div>
      );
    }
    
    return (
      <div>
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 mb-6 border dark:border-red-800">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400 dark:text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-400">Error</h3>
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
              New Password
            </label>
            <div className="mt-1">
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md shadow-sm placeholder-gray-400 dark:placeholder-dark-text-secondary bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Enter a secure password"
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
              Confirm Password
            </label>
            <div className="mt-1">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md shadow-sm placeholder-gray-400 dark:placeholder-dark-text-secondary bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Confirm your password"
              />
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-dark-text-secondary">
              Password must be at least 6 characters long
            </p>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                loading ? 'opacity-75 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Setting Password...' : 'Set Password'}
            </button>
          </div>
        </form>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-primary py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <Logo size="lg" />
          </div>
          <h1 className="mt-4 text-3xl font-bold" style={{ color: '#DD6B20' }}>Scalytics Connect</h1>
          <h2 className="mt-4 text-2xl font-extrabold text-gray-900 dark:text-dark-text-primary">
            Set Your Password
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-dark-text-secondary">
            Complete your account setup by creating a password
          </p>
        </div>
        
        {renderContent()}
      </div>
    </div>
  );
};

export default SetPasswordPage;
