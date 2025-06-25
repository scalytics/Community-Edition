import apiService from './apiService'; 

let filterCache = {
  groups: {},
  rules: [],
  userPermissions: new Set(),
  lastUpdatedFilters: 0,
  lastUpdatedPermissions: 0,
  cacheDuration: 5 * 60 * 1000, 
};

/**
 * Loads or reloads filter groups, active regex rules, and user permissions from API endpoints.
 */
async function loadFiltersAndPermissions(userId) {
  const now = Date.now();

  // Load rules and groups
  if (now - filterCache.lastUpdatedFilters >= filterCache.cacheDuration || filterCache.rules.length === 0) {
    try {
      const response = await apiService.get('/filters/rules-and-groups'); 
      const { groups, rules } = response; 

      const newGroupsCache = {};
      groups.forEach(group => {
        newGroupsCache[group.id] = group;
      });

      filterCache.groups = newGroupsCache;
      filterCache.rules = rules.filter(rule => rule.is_active === 1); 
      filterCache.lastUpdatedFilters = now;
    } catch (error) {
      console.error('[FrontendFilterService] Error loading filters from API:', error);
    }
  }

  // Load user permissions if userId is provided
  if (userId && (now - filterCache.lastUpdatedPermissions >= filterCache.cacheDuration || filterCache.userPermissions.size === 0)) {
    try {
      const permissionsResponse = await apiService.get('/users/me/filter-permissions'); 
      filterCache.userPermissions = new Set(permissionsResponse.permissions || []); 
      filterCache.lastUpdatedPermissions = now;
    } catch (error) {
      console.error(`[FrontendFilterService] Error fetching permissions for user ${userId} from API:`, error);
      filterCache.userPermissions = new Set(); 
    }
  } else if (!userId) {
    filterCache.userPermissions = new Set(); 
    filterCache.lastUpdatedPermissions = now;
  }
}

/**
 * Applies configured filters to a text string based on user group exemptions.
 * Frontend version: only handles regex rules. NER/Presidio rules are skipped with a warning.
 * @param {string} text - The text content to filter.
 * @param {number|string|null} userId - The ID of the user (or null for unauthenticated).
 * @returns {Promise<string>} The filtered text.
 */
export async function applyFilters(text, userId) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  await loadFiltersAndPermissions(userId);

  if (filterCache.rules.length === 0) {
    return text;
  }

  let filteredText = text;

  for (const rule of filterCache.rules) {
    const filterGroup = filterCache.groups[rule.filter_group_id];

    if (!filterGroup || !filterGroup.is_enabled) { 
      continue;
    }

    const exemptionPermission = filterGroup.exemption_permission_key;
    const isExempt = exemptionPermission && filterCache.userPermissions.has(exemptionPermission);

    if (!isExempt) {
      const replacementValue = rule.replacement !== null && rule.replacement !== undefined ? rule.replacement : '[REDACTED]';

      try {
        if (rule.rule_type === 'regex') {
          try {
            const regex = new RegExp(rule.pattern, 'g'); 
            filteredText = filteredText.replace(regex, replacementValue);
          } catch (regexError) {
            console.error(`[FrontendFilterService] Error creating/applying regex for rule ID ${rule.id} (Pattern: ${rule.pattern}):`, regexError);
          }
        } else if (rule.rule_type.startsWith('ner_') || rule.rule_type.startsWith('presidio_')) {
          // NER and Presidio rules are not processed on the frontend in this version.
          // console.warn(`[FrontendFilterService] Rule type "${rule.rule_type}" (ID: ${rule.id}) not processed on frontend.`);
        } else {
          console.warn(`[FrontendFilterService] Unknown rule type "${rule.rule_type}" for rule ID ${rule.id}. Skipping.`);
        }
      } catch (e) {
        console.error(`[FrontendFilterService] Error applying rule ID ${rule.id} (Type: ${rule.rule_type}, Pattern: ${rule.pattern}):`, e);
      }
    }
  }
  return filteredText;
}

// Function to allow pre-loading or refreshing filters if needed, e.g., on app load or user login
export async function refreshFilters(userId) {
  filterCache.lastUpdatedFilters = 0; // Force reload of filters
  if (userId) {
    filterCache.lastUpdatedPermissions = 0; // Force reload of user permissions
  }
  await loadFiltersAndPermissions(userId);
}
