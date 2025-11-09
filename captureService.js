const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');

class CaptureService {
  constructor() {
    this.apiBaseUrl = process.env.API_BASE_URL || 'https://dev.quelo.tech';
    this.bearerToken = null;
    this.sessionIdGetter = null; // Function to get current session ID
  }

  setBearerToken(token) {
    this.bearerToken = token;
  }

  setApiBaseUrl(url) {
    this.apiBaseUrl = url;
  }

  /**
   * Set the session ID getter function
   */
  setSessionIdGetter(getterFn) {
    this.sessionIdGetter = getterFn;
  }

  /**
   * Get current session ID
   */
  getSessionId() {
    if (this.sessionIdGetter && typeof this.sessionIdGetter === 'function') {
      return this.sessionIdGetter();
    }
    return null;
  }

  async getToken() {
    if (!this.bearerToken) {
      throw new Error('Not authenticated. Please sign in with Clerk first.');
    }
    return this.bearerToken;
  }

  /**
   * Upload a capture (screenshot or audio) to the backend
   * @param {string} filePath - Full path to the capture file
   * @param {object} metadata - Optional metadata (tags, etc.)
   * @returns {Promise<object>} - Upload result with captureId, url, etc.
   */
  async uploadCapture(filePath, metadata = {}) {
    try {
      const token = await this.getToken();
      
      // Session ID is required
      const sessionId = this.getSessionId();
      if (!sessionId) {
        console.error('[CaptureService] sessionId is required but not available');
        throw new Error('Session ID is required for capture upload');
      }
      
      const fileName = path.basename(filePath);
      const fileBuffer = await fs.readFile(filePath);
      const ext = path.extname(fileName).toLowerCase();
      
      // Determine content type
      const contentTypeMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webm': 'audio/webm',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/m4a'
      };
      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      const formData = new FormData();
      formData.append('image', fileBuffer, {
        filename: fileName,
        contentType: contentType
      });

      // Add session ID (required)
      formData.append('sessionId', sessionId);
      console.log(`[CaptureService] Including sessionId in capture upload: ${sessionId}`);

      // Add optional metadata
      if (metadata.tags && Array.isArray(metadata.tags)) {
        formData.append('tags', JSON.stringify(metadata.tags));
      }
      if (metadata.description) {
        formData.append('description', metadata.description);
      }

      console.log(`[CaptureService] Uploading capture: ${fileName}`);
      
      const response = await fetch(`${this.apiBaseUrl}/api/captures/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`[CaptureService] Upload successful: ${result.captureId}`);
      
      return {
        success: true,
        captureId: result.captureId,
        fileName: result.fileName,
        storagePath: result.storagePath,
        fileSize: result.fileSize,
        url: result.url
      };
    } catch (error) {
      console.error('[CaptureService] Upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all captures from the backend
   * @param {object} options - Pagination and filtering options
   * @returns {Promise<object>} - List of captures and total count
   */
  async getAllCaptures(options = {}) {
    try {
      const token = await this.getToken();
      
      const queryParams = new URLSearchParams();
      if (options.limit) queryParams.append('limit', options.limit);
      if (options.offset) queryParams.append('offset', options.offset);
      if (options.tags) queryParams.append('tags', options.tags);
      if (options.sortBy) queryParams.append('sortBy', options.sortBy);
      if (options.order) queryParams.append('order', options.order);

      const url = `${this.apiBaseUrl}/api/captures/upload?${queryParams.toString()}`;
      console.log(`[CaptureService] Fetching captures from: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Fetch failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`[CaptureService] Fetched ${result.captures?.length || 0} captures`);
      
      return {
        success: true,
        captures: result.captures || [],
        total: result.total || 0
      };
    } catch (error) {
      console.error('[CaptureService] Fetch error:', error);
      return {
        success: false,
        error: error.message,
        captures: [],
        total: 0
      };
    }
  }

  /**
   * Delete a capture from the backend
   * @param {string} captureId - The capture ID to delete
   * @returns {Promise<object>} - Delete result
   */
  async deleteCapture(captureId) {
    try {
      const token = await this.getToken();
      
      console.log(`[CaptureService] Deleting capture: ${captureId}`);
      
      const response = await fetch(`${this.apiBaseUrl}/api/captures/${captureId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Delete failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`[CaptureService] Delete successful: ${captureId}`);
      
      return {
        success: true,
        message: result.message || 'Capture deleted successfully'
      };
    } catch (error) {
      console.error('[CaptureService] Delete error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new CaptureService();
