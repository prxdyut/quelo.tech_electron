const fetch = require('node-fetch');

class SessionsService {
  constructor() {
    this.apiBaseUrl = process.env.API_BASE_URL || 'https://dev.quelo.tech';
    this.bearerToken = null;
  }

  setBearerToken(token) {
    this.bearerToken = token;
  }

  setApiBaseUrl(url) {
    this.apiBaseUrl = url;
  }

  async getToken() {
    if (!this.bearerToken) {
      throw new Error('Not authenticated. Please sign in first.');
    }
    return this.bearerToken;
  }

  /**
   * Fetch sessions from the backend with optional filtering and pagination
   * @param {object} params - Query parameters
   * @param {string} params.sessionId - Optional session ID to fetch a specific session
   * @param {string} params.status - Optional status filter ('active' or 'ended')
   * @param {string} params.subject - Optional subject filter
   * @param {string} params.topic - Optional topic filter
   * @param {number} params.limit - Optional limit for pagination (default: 50)
   * @param {number} params.offset - Optional offset for pagination (default: 0)
   * @returns {Promise<object>} - Sessions response with sessions array, total count, limit, and offset
   */
  async fetchSessions(params = {}) {
    try {
      const token = await this.getToken();

      const queryParams = new URLSearchParams();

      if (params.sessionId) queryParams.append('sessionId', params.sessionId);
      if (params.status) queryParams.append('status', params.status);
      if (params.subject) queryParams.append('subject', params.subject);
      if (params.topic) queryParams.append('topic', params.topic);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset !== undefined) queryParams.append('offset', params.offset.toString());

      const url = `${this.apiBaseUrl}/api/sessions?${queryParams.toString()}`;
      console.log('[SessionsService] Fetching sessions from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[SessionsService] Fetched sessions:', data);

      return {
        success: true,
        sessions: data.sessions || [],
        total: data.total || 0,
        limit: data.limit || 50,
        offset: data.offset || 0,
      };
    } catch (error) {
      console.error('[SessionsService] Error fetching sessions:', error);
      return {
        success: false,
        error: error.message,
        sessions: [],
        total: 0,
        limit: 0,
        offset: 0,
      };
    }
  }

  /**
   * Fetch a single session by ID
   * @param {string} sessionId - Session ID to fetch
   * @returns {Promise<object>} - Session object or null if not found
   */
  async fetchSessionById(sessionId) {
    try {
      const result = await this.fetchSessions({ sessionId, limit: 1 });

      if (result.success && result.sessions.length > 0) {
        return result.sessions[0];
      }

      return null;
    } catch (error) {
      console.error('[SessionsService] Error fetching session by ID:', error);
      throw error;
    }
  }

  /**
   * Fetch active sessions
   * @returns {Promise<array>} - Array of active sessions
   */
  async fetchActiveSessions() {
    try {
      const result = await this.fetchSessions({ status: 'active' });
      return result.success ? result.sessions : [];
    } catch (error) {
      console.error('[SessionsService] Error fetching active sessions:', error);
      throw error;
    }
  }

  /**
   * Fetch ended sessions
   * @returns {Promise<array>} - Array of ended sessions
   */
  async fetchEndedSessions() {
    try {
      const result = await this.fetchSessions({ status: 'ended' });
      return result.success ? result.sessions : [];
    } catch (error) {
      console.error('[SessionsService] Error fetching ended sessions:', error);
      throw error;
    }
  }

  /**
   * Fetch sessions by subject
   * @param {string} subject - Subject name
   * @returns {Promise<array>} - Array of sessions for the subject
   */
  async fetchSessionsBySubject(subject) {
    try {
      const result = await this.fetchSessions({ subject });
      return result.success ? result.sessions : [];
    } catch (error) {
      console.error('[SessionsService] Error fetching sessions by subject:', error);
      throw error;
    }
  }

  /**
   * Fetch sessions by topic
   * @param {string} topic - Topic name
   * @returns {Promise<array>} - Array of sessions for the topic
   */
  async fetchSessionsByTopic(topic) {
    try {
      const result = await this.fetchSessions({ topic });
      return result.success ? result.sessions : [];
    } catch (error) {
      console.error('[SessionsService] Error fetching sessions by topic:', error);
      throw error;
    }
  }
}

module.exports = SessionsService;
