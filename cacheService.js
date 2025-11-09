const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

/**
 * Cache Service
 * Handles local caching of API responses for offline functionality
 * Stores data in JSON files in the app's user data directory
 */
class CacheService {
  constructor() {
    this.cacheDir = path.join(app.getPath('userData'), 'cache');
    this.initialized = false;
  }

  /**
   * Initialize cache directory
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      this.initialized = true;
      console.log('[CacheService] Initialized cache directory:', this.cacheDir);
    } catch (error) {
      console.error('[CacheService] Failed to initialize cache directory:', error);
      throw error;
    }
  }

  /**
   * Get cache file path for a given key
   */
  getCacheFilePath(key) {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.cacheDir, `${safeKey}.json`);
  }

  /**
   * Set cache data with TTL (time to live)
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} ttl - Time to live in milliseconds (default: 1 hour)
   */
  async set(key, data, ttl = 3600000) {
    await this.initialize();
    
    try {
      const cacheData = {
        key,
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttl
      };

      const filePath = this.getCacheFilePath(key);
      await fs.writeFile(filePath, JSON.stringify(cacheData, null, 2), 'utf-8');
      console.log(`[CacheService] Cached data for key: ${key}`);
      return true;
    } catch (error) {
      console.error(`[CacheService] Failed to cache data for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get cached data
   * @param {string} key - Cache key
   * @param {boolean} ignoreExpiry - Ignore expiration check (useful for offline mode)
   * @returns {any|null} Cached data or null if not found/expired
   */
  async get(key, ignoreExpiry = false) {
    await this.initialize();
    
    try {
      const filePath = this.getCacheFilePath(key);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const cacheData = JSON.parse(fileContent);

      // Check expiration
      if (!ignoreExpiry && Date.now() > cacheData.expiresAt) {
        console.log(`[CacheService] Cache expired for key: ${key}`);
        await this.delete(key);
        return null;
      }

      console.log(`[CacheService] Cache hit for key: ${key}`);
      return cacheData.data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`[CacheService] Cache miss for key: ${key}`);
      } else {
        console.error(`[CacheService] Failed to read cache for key ${key}:`, error);
      }
      return null;
    }
  }

  /**
   * Delete cached data
   * @param {string} key - Cache key
   */
  async delete(key) {
    await this.initialize();
    
    try {
      const filePath = this.getCacheFilePath(key);
      await fs.unlink(filePath);
      console.log(`[CacheService] Deleted cache for key: ${key}`);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`[CacheService] Failed to delete cache for key ${key}:`, error);
      }
      return false;
    }
  }

  /**
   * Clear all cache
   */
  async clearAll() {
    await this.initialize();
    
    try {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.cacheDir, file)))
      );
      console.log('[CacheService] Cleared all cache');
      return true;
    } catch (error) {
      console.error('[CacheService] Failed to clear cache:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    await this.initialize();
    
    try {
      const files = await fs.readdir(this.cacheDir);
      let totalSize = 0;
      let validCount = 0;
      let expiredCount = 0;

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const cacheData = JSON.parse(content);
          if (Date.now() > cacheData.expiresAt) {
            expiredCount++;
          } else {
            validCount++;
          }
        } catch (error) {
          console.error(`[CacheService] Failed to parse cache file ${file}:`, error);
        }
      }

      return {
        totalFiles: files.length,
        totalSize,
        validCount,
        expiredCount
      };
    } catch (error) {
      console.error('[CacheService] Failed to get cache stats:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        validCount: 0,
        expiredCount: 0
      };
    }
  }

  /**
   * Clean expired cache entries
   */
  async cleanExpired() {
    await this.initialize();
    
    try {
      const files = await fs.readdir(this.cacheDir);
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const cacheData = JSON.parse(content);
          
          if (Date.now() > cacheData.expiresAt) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        } catch (error) {
          console.error(`[CacheService] Failed to check/clean cache file ${file}:`, error);
        }
      }

      console.log(`[CacheService] Cleaned ${cleanedCount} expired cache entries`);
      return cleanedCount;
    } catch (error) {
      console.error('[CacheService] Failed to clean expired cache:', error);
      return 0;
    }
  }

  /**
   * Cache API response with automatic key generation
   * @param {string} endpoint - API endpoint
   * @param {object} params - Request parameters
   * @param {any} data - Response data
   * @param {number} ttl - Time to live
   */
  async cacheApiResponse(endpoint, params, data, ttl = 3600000) {
    const key = this.generateApiCacheKey(endpoint, params);
    return await this.set(key, data, ttl);
  }

  /**
   * Get cached API response
   * @param {string} endpoint - API endpoint
   * @param {object} params - Request parameters
   * @param {boolean} ignoreExpiry - Ignore expiration
   */
  async getCachedApiResponse(endpoint, params, ignoreExpiry = false) {
    const key = this.generateApiCacheKey(endpoint, params);
    return await this.get(key, ignoreExpiry);
  }

  /**
   * Generate cache key for API calls
   */
  generateApiCacheKey(endpoint, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {});
    
    const paramsString = JSON.stringify(sortedParams);
    return `api_${endpoint}_${Buffer.from(paramsString).toString('base64').substring(0, 32)}`;
  }
}

module.exports = CacheService;
