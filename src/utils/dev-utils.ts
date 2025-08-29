// Development utilities for debugging and cache management
// These utilities are primarily for use in the browser console during development

import { clearActivityCache } from '../components/ProjectActivity';

// Clear all cached activity data
export const clearCache = () => {
  clearActivityCache();
  console.log('✅ Activity cache cleared');
};

// Get cache statistics
export const getCacheStats = () => {
  // This would need to be exported from ProjectActivity
  console.log('Cache stats not yet implemented');
  return {
    message: 'To implement: export cache size from ProjectActivity component'
  };
};

// Force refresh all visible activity indicators
export const refreshAllActivities = () => {
  clearCache();
  // Force re-render by updating the key or triggering a state change
  window.location.reload();
};

// Check GitHub API rate limit
export const checkGitHubRateLimit = async () => {
  try {
    const token = import.meta.env.VITE_GITHUB_TOKEN;
    const headers: HeadersInit = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch('https://api.github.com/rate_limit', { headers });
    const data = await response.json();

    const core = data.rate;
    const remaining = core.remaining;
    const limit = core.limit;
    const resetTime = new Date(core.reset * 1000);

    console.log(`GitHub API Rate Limit:
  Remaining: ${remaining}/${limit}
  Resets at: ${resetTime.toLocaleTimeString()}
  ${token ? '✅ Using authenticated requests' : '⚠️ Using unauthenticated requests (60/hour limit)'}`);

    return {
      remaining,
      limit,
      resetTime,
      authenticated: !!token
    };
  } catch (error) {
    console.error('Failed to check GitHub rate limit:', error);
    return null;
  }
};

// Make utilities available globally in development
if (import.meta.env.DEV) {
  (window as any).devUtils = {
    clearCache,
    getCacheStats,
    refreshAllActivities,
    checkGitHubRateLimit,
  };

  console.log(`🔧 Development utilities loaded. Available commands:
  - devUtils.clearCache() - Clear activity cache
  - devUtils.checkGitHubRateLimit() - Check GitHub API rate limit
  - devUtils.refreshAllActivities() - Clear cache and reload page
  `);
}

export default {
  clearCache,
  getCacheStats,
  refreshAllActivities,
  checkGitHubRateLimit,
};
