const { db } = require('./db');

/**
 * Integration model for managing authentication and other integration keys
 */
class Integration {
  /**
   * Create a new integration
   * @param {Object} data - Integration data
   * @returns {Object} Created integration
   */
  static async create(data) {
    try {
      const { name, provider, client_id, client_secret, additional_config, enabled } = data;
      
      const result = await db.runAsync(
        `INSERT INTO integrations (
          name, 
          provider, 
          client_id, 
          client_secret, 
          additional_config, 
          enabled
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          name,
          provider,
          client_id,
          client_secret,
          additional_config ? JSON.stringify(additional_config) : null,
          enabled ? 1 : 0
        ]
      );

      // Get the ID
      let integrationId = result.lastID;
      if (integrationId === undefined) {
        const insertedIntegration = await db.getAsync(
          'SELECT id FROM integrations WHERE name = ? AND provider = ?',
          [name, provider]
        );
        integrationId = insertedIntegration ? insertedIntegration.id : null;
      }

      return {
        id: integrationId,
        name,
        provider,
        client_id,
        client_secret,
        additional_config: additional_config || null,
        enabled: Boolean(enabled)
      };
    } catch (error) {
      console.error('Error creating integration:', error);
      throw error;
    }
  }

  /**
   * Find integration by ID
   * @param {number} id - Integration ID
   * @returns {Object|null} Integration or null if not found
   */
  static async findById(id) {
    try {
      const integration = await db.getAsync('SELECT * FROM integrations WHERE id = ?', [id]);
      
      if (!integration) return null;
      
      return {
        ...integration,
        additional_config: integration.additional_config ? 
          JSON.parse(integration.additional_config) : null,
        enabled: Boolean(integration.enabled)
      };
    } catch (error) {
      console.error('Error finding integration by ID:', error);
      throw error;
    }
  }

  /**
   * Find integration by provider
   * @param {string} provider - Provider name
   * @returns {Object|null} Integration or null if not found
   */
  static async findByProvider(provider) {
    try {
      const integration = await db.getAsync(
        'SELECT * FROM integrations WHERE provider = ? AND enabled = 1',
        [provider]
      );
      
      if (!integration) return null;
      
      return {
        ...integration,
        additional_config: integration.additional_config ? 
          JSON.parse(integration.additional_config) : null,
        enabled: Boolean(integration.enabled)
      };
    } catch (error) {
      console.error('Error finding integration by provider:', error);
      throw error;
    }
  }

  /**
   * Get all integrations
   * @returns {Array} List of integrations
   */
  static async findAll() {
    try {
      const integrations = await db.allAsync('SELECT * FROM integrations ORDER BY name');
      
      // Parse additional_config JSON and convert enabled to boolean
      return integrations.map(integration => ({
        ...integration,
        additional_config: integration.additional_config ? 
          JSON.parse(integration.additional_config) : null,
        enabled: Boolean(integration.enabled)
      }));
    } catch (error) {
      console.error('Error finding all integrations:', error);
      throw error;
    }
  }

  /**
   * Update an integration
   * @param {number} id - Integration ID
   * @param {Object} data - Updated integration data
   * @returns {Object} Updated integration
   */
  static async update(id, data) {
    try {
      const existingIntegration = await this.findById(id);
      
      if (!existingIntegration) {
        throw new Error('Integration not found');
      }
      
      const { name, provider, client_id, client_secret, additional_config, enabled } = data;
      
      await db.runAsync(
        `UPDATE integrations SET
          name = ?,
          provider = ?,
          client_id = ?,
          client_secret = ?,
          additional_config = ?,
          enabled = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          name || existingIntegration.name,
          provider || existingIntegration.provider,
          client_id || existingIntegration.client_id,
          client_secret || existingIntegration.client_secret,
          additional_config ? JSON.stringify(additional_config) : existingIntegration.additional_config,
          enabled !== undefined ? (enabled ? 1 : 0) : existingIntegration.enabled,
          id
        ]
      );
      
      return await this.findById(id);
    } catch (error) {
      console.error('Error updating integration:', error);
      throw error;
    }
  }

  /**
   * Delete an integration
   * @param {number} id - Integration ID
   * @returns {boolean} Success
   */
  static async delete(id) {
    try {
      const result = await db.runAsync('DELETE FROM integrations WHERE id = ?', [id]);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting integration:', error);
      throw error;
    }
  }

  /**
   * Get configuration for authentication services
   * @returns {Object} Authentication config for all enabled integrations
   */
  static async getAuthConfig() {
    try {
      const integrations = await db.allAsync(
        'SELECT * FROM integrations WHERE enabled = 1'
      );
      
      const config = {};
      
      integrations.forEach(integration => {
        config[integration.provider] = {
          clientId: integration.client_id,
          clientSecret: integration.client_secret,
          ...integration.additional_config ? JSON.parse(integration.additional_config) : {}
        };
      });
      
      return config;
    } catch (error) {
      console.error('Error getting auth configuration:', error);
      throw error;
    }
  }
}

module.exports = Integration;
