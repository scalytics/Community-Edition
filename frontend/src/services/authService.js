/**
 * @deprecated This file is deprecated. Please import from 'services/auth' instead.
 * 
 * This is a compatibility wrapper to maintain backward compatibility
 * while transitioning to the modular auth service architecture.
 */

import authService from './auth';

// Only show warning in development mode
if (process.env.NODE_ENV !== 'production') {
  console.warn(
    'Warning: Importing directly from "services/authService" is deprecated. ' +
    'Please update your imports to use "services/auth" instead.'
  );
}

// Re-export the default export from the new auth service
export default authService;
