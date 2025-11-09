const fetch = require('node-fetch');
const CacheService = require('./cacheService');

/**
 * Standardized API Service
 * Provides a unified interface for making API calls with automatic caching,
 * offline support, and error handling
 */
class ApiService {
  constructor() {
    this.cacheService = new CacheService();
    this.bearerToken = null;
    this.apiBaseUrl = process.env.API_BASE_URL || 'https://dev.quelo.tech';
    this.isOnline = true;
    this.syncQueue = [];
  }

  /**
   * Set authentication token
   */
  setBearerToken(token) {
    this.bearerToken = token;
  }

  /**
   * Set API base URL
   */
  setApiBaseUrl(url) {
    this.apiBaseUrl = url;
  }

  /**
   * Set online status
   */
  setOnlineStatus(isOnline) {
    this.isOnline = isOnline;
    console.log(`[ApiService] Network status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
  }

  /**
   * Get authentication headers
   */
  async getAuthHeaders(additionalHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...additionalHeaders
    };

    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    return headers;
  }

  /**
   * Make a GET request with caching support
   * @param {string} endpoint - API endpoint (relative path)
   * @param {object} options - Request options
   * @param {object} options.params - Query parameters
   * @param {boolean} options.cache - Enable caching (default: true)
   * @param {number} options.cacheTTL - Cache TTL in ms (default: 1 hour)
   * @param {boolean} options.forceRefresh - Skip cache and fetch fresh data
   * @param {object} options.headers - Additional headers
   */
  async get(endpoint, options = {}) {
    const {
      params = {},
      cache = true,
      cacheTTL = 3600000,
      forceRefresh = false,
      headers: additionalHeaders = {}
    } = options;

    const url = this.buildUrl(endpoint, params);
    const cacheKey = `get_${endpoint}_${JSON.stringify(params)}`;

    // Try cache first if enabled and not forcing refresh
    if (cache && !forceRefresh) {
      const cachedData = await this.cacheService.getCachedApiResponse(
        endpoint,
        params,
        !this.isOnline // Ignore expiry if offline
      );

      if (cachedData !== null) {
        console.log(`[ApiService] Returning cached data for ${endpoint}`);
        return {
          success: true,
          data: cachedData,
          fromCache: true
        };
      }
    }

    // If offline and no cache, return error
    if (!this.isOnline) {
      console.warn(`[ApiService] Offline and no cache available for ${endpoint}`);
      return {
        success: false,
        error: 'No internet connection and no cached data available',
        offline: true
      };
    }

    // Make network request
    try {
      const headers = await this.getAuthHeaders(additionalHeaders);
      console.log(`[ApiService] GET ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Cache the response if caching is enabled
      if (cache) {
        await this.cacheService.cacheApiResponse(endpoint, params, data, cacheTTL);
      }

      return {
        success: true,
        data,
        fromCache: false
      };
    } catch (error) {
      console.error(`[ApiService] GET ${endpoint} failed:`, error);

      // Try to return cached data even if expired
      if (cache) {
        const cachedData = await this.cacheService.getCachedApiResponse(endpoint, params, true);
        if (cachedData !== null) {
          console.log(`[ApiService] Returning stale cached data for ${endpoint} due to error`);
          return {
            success: true,
            data: cachedData,
            fromCache: true,
            stale: true
          };
        }
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Make a POST request with queue support for offline
   * @param {string} endpoint - API endpoint (relative path)
   * @param {object} options - Request options
   * @param {any} options.body - Request body
   * @param {boolean} options.queueIfOffline - Queue request if offline (default: true)
   * @param {object} options.headers - Additional headers
   */
  async post(endpoint, options = {}) {
    const {
      body = {},
      queueIfOffline = true,
      headers: additionalHeaders = {}
    } = options;

    const url = this.buildUrl(endpoint);

    // If offline, queue the request
    if (!this.isOnline && queueIfOffline) {
      console.log(`[ApiService] Offline - queueing POST request to ${endpoint}`);
      this.syncQueue.push({
        type: 'POST',
        endpoint,
        body,
        timestamp: Date.now()
      });
      
      return {
        success: true,
        queued: true,
        message: 'Request queued for sync when online'
      };
    }

    // Make network request
    try {
      const headers = await this.getAuthHeaders(additionalHeaders);
      console.log(`[ApiService] POST ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        data
      };
    } catch (error) {
      console.error(`[ApiService] POST ${endpoint} failed:`, error);

      // Queue if offline and queueing is enabled
      if (queueIfOffline) {
        this.syncQueue.push({
          type: 'POST',
          endpoint,
          body,
          timestamp: Date.now(),
          failedAttempt: true
        });
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Make a PUT request
   */
  async put(endpoint, options = {}) {
    const {
      body = {},
      queueIfOffline = true,
      headers: additionalHeaders = {}
    } = options;

    const url = this.buildUrl(endpoint);

    if (!this.isOnline && queueIfOffline) {
      console.log(`[ApiService] Offline - queueing PUT request to ${endpoint}`);
      this.syncQueue.push({
        type: 'PUT',
        endpoint,
        body,
        timestamp: Date.now()
      });
      
      return {
        success: true,
        queued: true,
        message: 'Request queued for sync when online'
      };
    }

    try {
      const headers = await this.getAuthHeaders(additionalHeaders);
      console.log(`[ApiService] PUT ${url}`);

      const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        data
      };
    } catch (error) {
      console.error(`[ApiService] PUT ${endpoint} failed:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Make a DELETE request
   */
  async delete(endpoint, options = {}) {
    const {
      queueIfOffline = true,
      headers: additionalHeaders = {}
    } = options;

    const url = this.buildUrl(endpoint);

    if (!this.isOnline && queueIfOffline) {
      console.log(`[ApiService] Offline - queueing DELETE request to ${endpoint}`);
      this.syncQueue.push({
        type: 'DELETE',
        endpoint,
        timestamp: Date.now()
      });
      
      return {
        success: true,
        queued: true,
        message: 'Request queued for sync when online'
      };
    }

    try {
      const headers = await this.getAuthHeaders(additionalHeaders);
      console.log(`[ApiService] DELETE ${url}`);

      const response = await fetch(url, {
        method: 'DELETE',
        headers
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        data
      };
    } catch (error) {
      console.error(`[ApiService] DELETE ${endpoint} failed:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build full URL with query parameters
   */
  buildUrl(endpoint, params = {}) {
    const url = new URL(endpoint, this.apiBaseUrl);
    
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key]);
      }
    });

    return url.toString();
  }

  /**
   * Get sync queue
   */
  getSyncQueue() {
    return this.syncQueue;
  }

  /**
   * Clear sync queue
   */
  clearSyncQueue() {
    this.syncQueue = [];
    console.log('[ApiService] Sync queue cleared');
  }

  /**
   * Process sync queue
   */
  async processSyncQueue() {
    if (!this.isOnline) {
      console.log('[ApiService] Cannot process sync queue - offline');
      return { success: false, processed: 0 };
    }

    console.log(`[ApiService] Processing ${this.syncQueue.length} queued requests`);
    const queue = [...this.syncQueue];
    this.syncQueue = [];

    let processed = 0;
    let failed = 0;

    for (const request of queue) {
      try {
        console.log(`[ApiService] Processing queued ${request.type} to ${request.endpoint}`);
        
        let result;
        switch (request.type) {
          case 'POST':
            result = await this.post(request.endpoint, { 
              body: request.body, 
              queueIfOffline: false 
            });
            break;
          case 'PUT':
            result = await this.put(request.endpoint, { 
              body: request.body, 
              queueIfOffline: false 
            });
            break;
          case 'DELETE':
            result = await this.delete(request.endpoint, { 
              queueIfOffline: false 
            });
            break;
          default:
            console.warn(`[ApiService] Unknown request type: ${request.type}`);
            continue;
        }

        if (result.success) {
          processed++;
        } else {
          failed++;
          // Re-queue failed requests
          this.syncQueue.push(request);
        }
      } catch (error) {
        console.error(`[ApiService] Failed to process queued request:`, error);
        failed++;
        // Re-queue failed requests
        this.syncQueue.push(request);
      }
    }

    console.log(`[ApiService] Sync complete - Processed: ${processed}, Failed: ${failed}, Remaining: ${this.syncQueue.length}`);
    
    return {
      success: true,
      processed,
      failed,
      remaining: this.syncQueue.length
    };
  }

  /**
   * Clear all cache
   */
  async clearCache() {
    return await this.cacheService.clearAll();
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return await this.cacheService.getStats();
  }

  /**
   * Clean expired cache entries
   */
  async cleanExpiredCache() {
    return await this.cacheService.cleanExpired();
  }
}

module.exports = ApiService;
