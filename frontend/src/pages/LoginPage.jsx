import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from '../components/common/Logo';
import { loginService } from '../services/auth';
import { useAuth } from '../contexts/AuthContext'; 
import SessionExpiredAlert from '../components/auth/SessionExpiredAlert';
import AuthErrorAlert from '../components/auth/AuthErrorAlert';
import PasswordLoginForm from '../components/auth/PasswordLoginForm';

/**
 * Login page component handling both OAuth and password login
 */
const LoginPage = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login: contextLogin } = useAuth(); 
  
  // Handle input changes in the login form
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const { username, password } = formData;
      
      if (!username || !password) {
        setError('Please enter both username and password');
        setLoading(false);
        return;
      }
      
      const response = await loginService.login(formData);
      
      if (response.success && response.user && response.token) {
        // Call context login to update global state
        contextLogin(response.user, response.token); 
        
        // Redirect to dashboard or previous page
        const redirectTo = location.state?.from?.pathname || '/dashboard';
        navigate(redirectTo); 
      } else {
        // Use error message from response, or provide a default
        setError(response.message || 'Login failed. Please check your credentials.');
      }
    } catch (error) {
      setError(error.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-primary py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Logo and title */}
        <div className="text-center">
          <div className="flex justify-center">
            <Logo size="lg" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-dark-text-primary">
            Scalytics Connect
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-dark-text-secondary">
          Your private AI platform to securely run and manage your most powerful models — with full data privacy.
          </p>
        </div>
        
        {/* Authentication state alerts */}
        <SessionExpiredAlert />
        
        {/* Authentication error alert */}
        <AuthErrorAlert message={error} />
        
        {/* Password login form - always available for admin access */}
        <PasswordLoginForm 
          formData={formData}
          handleChange={handleChange}
          handleSubmit={handleSubmit}
          loading={loading}
        />
      </div>
    </div>
  );
};

export default LoginPage;
