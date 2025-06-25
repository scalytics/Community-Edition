class APIError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode || 500;
    this.name = 'APIError'; 
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

class UserCancelledError extends Error {
  constructor(message) {
    super(message || 'Operation cancelled by user.');
    this.name = 'UserCancelledError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = { APIError, UserCancelledError };
