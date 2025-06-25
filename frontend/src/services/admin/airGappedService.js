import apiService from '../apiService';

/**
 * Service for Air-Gapped mode related operations
 */
const airGappedService = {
  /**
   * Check if Air-Gapped mode is enabled
   * @returns {Promise<boolean>} Whether Air-Gapped mode is enabled
   */
  isAirGappedEnabled: async () => {
    try {
      const response = await apiService.get('/admin/settings/air_gapped');
      
      // Parse the response to get the air-gapped status
      let airGappedMode = false;
      if (response?.data?.data?.airGapped !== undefined) {
        airGappedMode = Boolean(response.data.data.airGapped);
      } else if (response?.data?.airGapped !== undefined) {
        airGappedMode = Boolean(response.data.airGapped);
      } else if (response?.airGapped !== undefined) {
        airGappedMode = Boolean(response.airGapped);
      }
      
      return airGappedMode;
    } catch (error) {
      // Return false by default if there's an error
      return false;
    }
  }
};

export default airGappedService;
