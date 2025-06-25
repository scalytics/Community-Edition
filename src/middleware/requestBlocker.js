// src/middleware/requestBlocker.js
const path = require('path');

// Expanded list of patterns to block
const suspiciousPatterns = [
  // --- PHP Specific ---
  /phpunit/i,
  /eval-stdin\.php/i,
  /php:\/\//i,             // Covers php://input, php://filter, etc.
  /allow_url_include/i,
  /auto_prepend_file/i,
  /\.php([?\/]|$)/i,       // Block direct PHP file access attempts (ends with .php or .php? or .php/)
  /cgi-bin/i,

  // --- Common CMS/Admin Paths (often scanned) ---
  /wp-admin/i,
  /wp-login\.php/i,
  /xmlrpc\.php/i,
  /administrator/i,       // Joomla, etc.

  // --- Directory Traversal ---
  /\.\.\//,                // Basic traversal ../
  /(%2e%2e|%252e%252e)\//i, // URL encoded .. (/ or %2f)

  // --- Shell/Command Injection Attempts (basic) ---
  /shell\?/i,
  /exec\?/i,
  /cmd\.exe/i,
  /bash/i,
  /powershell/i,

  // --- Log4j / JNDI ---
  /jndi:/i,                // Covers jndi:ldap, jndi:rmi, etc.
  /\$\{.*\}/,              // Basic template injection check (might need refinement)

  // --- Sensitive File Access Attempts ---
  /\.env/i,
  /\.git/i,                // Accessing .git directory/files
  /etc\/passwd/i,
  /proc\/self\/environ/i,
  /web\.config/i,

  // --- Basic SQL Injection fragments (use cautiously) ---
  // These might be too broad and catch legitimate requests depending on your API.
  // Consider enabling them only if you see specific SQLi attempts in logs.
  // /UNION.+SELECT/i,
  // /SLEEP\(.*\)/i,
  // /BENCHMARK\(.*\)/i,
  /information_schema/i,

  // Add more patterns based on observed logs
];

function blockSuspiciousRequests(req, res, next) {
  // Combine path and decoded query string for a comprehensive check
  let fullUrlToCheck = req.path;
  if (req.originalUrl.includes('?')) {
      try {
          const queryStringPart = req.originalUrl.substring(req.originalUrl.indexOf('?'));
          // Decode carefully, replacing '+' with space first if needed (common in query strings)
          fullUrlToCheck += decodeURIComponent(queryStringPart.replace(/\+/g, ' '));
      } catch (e) {
          // Handle potential URI malformed errors during decoding
          console.warn(`[Request Blocker] Could not decode URI component for check: ${req.originalUrl}. Error: ${e.message}`);
          // Block potentially malformed URIs as they can be used for evasion
          return res.status(400).send('Bad Request: Malformed URI');
      }
  }

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(fullUrlToCheck)) {
      // Log the blocked attempt for monitoring
      console.warn(`[Request Blocker] Blocked suspicious request matching pattern ${pattern}: ${req.method} ${req.originalUrl} from ${req.ip}`);
      // Send a generic 404 Not Found
      return res.status(404).send('Not Found');
    }
  }

  // No suspicious patterns detected, proceed
  next();
}

module.exports = {
  blockSuspiciousRequests
};
