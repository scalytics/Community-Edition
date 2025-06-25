const crypto = require('crypto');

/**
 * Encryption helpers for external API keys.
 * Note: Scalytics API keys use bcrypt hashing, not this encryption.
 */
const encryptionHelpers = {
  /**
   * Encrypts text using AES-256-CBC.
   * Requires ENCRYPTION_SECRET environment variable (at least 16 chars).
   * @param {string} text - The text to encrypt.
   * @param {string} [secret=process.env.ENCRYPTION_SECRET] - The encryption secret.
   * @returns {string} - Encrypted text in format "iv:encrypted_hex" or original text on error/missing secret.
   */
  encrypt: (text, secret = process.env.ENCRYPTION_SECRET) => {
    // Return original text if secret is invalid or missing
    if (!secret || secret.length < 16) {
      console.warn('Encryption skipped: ENCRYPTION_SECRET is missing or too short (min 16 chars).');
      return text;
    }

    try {
      // Ensure key is 32 bytes
      const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
      // Generate a random 16-byte IV
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Prepend IV for decryption
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (err) {
      console.error('Encryption error:', err);
      // Return original text on error
      return text;
    }
  },

  /**
   * Decrypts text encrypted with the encrypt function.
   * Requires ENCRYPTION_SECRET environment variable (at least 16 chars).
   * @param {string} text - Encrypted text in format "iv:encrypted_hex".
   * @param {string} [secret=process.env.ENCRYPTION_SECRET] - The encryption secret.
   * @returns {string} - Decrypted text or original text on error/missing secret/invalid format.
   */
  decrypt: (text, secret = process.env.ENCRYPTION_SECRET) => {
    // Return original text if secret is invalid, missing, or text format is wrong
    if (!secret || secret.length < 16 || !text || typeof text !== 'string' || !text.includes(':')) {
      if (!text || typeof text !== 'string' || !text.includes(':')) {
         // Don't warn if it just looks like unencrypted text
      } else {
         console.warn('Decryption skipped: ENCRYPTION_SECRET is missing/short or input format is invalid.');
      }
      return text;
    }

    try {
      // Ensure key is 32 bytes
      const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
      const parts = text.split(':');
      // Ensure parts are valid hex before creating buffers
      if (parts.length !== 2 || !/^[0-9a-fA-F]+$/.test(parts[0]) || !/^[0-9a-fA-F]+$/.test(parts[1])) {
         console.warn('Decryption skipped: Invalid IV or encrypted data format.');
         return text;
      }
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err) {
      // Log specific decryption errors but still return original text
      console.error('Decryption error:', err.message);
      return text;
    }
  }
};

module.exports = { encryptionHelpers };
