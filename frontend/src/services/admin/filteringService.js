import apiService from '../apiService'; 

const FILTERING_ENDPOINTS = {
  GROUPS: '/admin/filters/groups',
  GROUP: (groupId) => `/admin/filters/groups/${groupId}`,
  RULES: (groupId) => `/admin/filters/groups/${groupId}/rules`,
  RULE: (ruleId) => `/admin/filters/rules/${ruleId}`, 
  ACTIVE_LANGUAGES: '/admin/settings/active-filter-languages' 
};

const filteringService = {
  // --- Filter Groups ---
  getFilterGroups: async () => {
    return await apiService.get(FILTERING_ENDPOINTS.GROUPS); 
  },

  createFilterGroup: async (groupData) => {
    return await apiService.post(FILTERING_ENDPOINTS.GROUPS, groupData);
  },

  updateFilterGroup: async (groupId, groupData) => {
    return await apiService.put(FILTERING_ENDPOINTS.GROUP(groupId), groupData);
  },

  deleteFilterGroup: async (groupId) => {
    return await apiService.delete(FILTERING_ENDPOINTS.GROUP(groupId));
  },

  // --- Filter Rules ---
  getFilterRules: async (groupId) => {
    return await apiService.get(FILTERING_ENDPOINTS.RULES(groupId));
  },

  createFilterRule: async (groupId, ruleData) => {
    return await apiService.post(FILTERING_ENDPOINTS.RULES(groupId), ruleData);
  },

  updateFilterRule: async (ruleId, ruleData) => {
    return await apiService.put(FILTERING_ENDPOINTS.RULE(ruleId), ruleData);
  },

  deleteFilterRule: async (ruleId) => {
    return await apiService.delete(FILTERING_ENDPOINTS.RULE(ruleId));
  },

  // --- Active Languages ---
  getActiveLanguages: async () => {
     try {
       const response = await apiService.get('/admin/settings/active-filter-languages');
       if (response.success && Array.isArray(response.data)) {
         return response.data;
       }
       console.warn('getActiveLanguages received unexpected response format:', response);
       return ['en']; 
     } catch (error) {
       console.error("Error fetching active filter languages:", error);
       return ['en']; 
     }
   },

   updateActiveLanguages: async (languages) => {
     const response = await apiService.put('/admin/settings/active-filter-languages', { languages });
     return response; 
   }

};

export default filteringService;
