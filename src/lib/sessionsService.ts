import type { Session } from '@/types';

interface FetchSessionsParams {
  sessionId?: string;
  status?: 'active' | 'ended';
  subject?: string;
  topic?: string;
  limit?: number;
  offset?: number;
}

interface SessionsResponse {
  success: boolean;
  sessions: Session[];
  total: number;
  limit: number;
  offset: number;
}

export const sessionsService = {
  async fetchSessions(params: FetchSessionsParams = {}): Promise<SessionsResponse> {
    try {
      const response = await window.electronAPI.sessions.getAll(params);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch sessions');
      }

      return response;
    } catch (error) {
      console.error('[SessionsService] Error fetching sessions:', error);
      throw error;
    }
  },

  async fetchSessionById(sessionId: string): Promise<Session | null> {
    try {
      const response = await this.fetchSessions({ sessionId, limit: 1 });
      return response.sessions.length > 0 ? response.sessions[0] : null;
    } catch (error) {
      console.error('[SessionsService] Error fetching session by ID:', error);
      throw error;
    }
  },

  async fetchActiveSessions(): Promise<Session[]> {
    try {
      const response = await this.fetchSessions({ status: 'active' });
      return response.sessions;
    } catch (error) {
      console.error('[SessionsService] Error fetching active sessions:', error);
      throw error;
    }
  },

  async fetchEndedSessions(): Promise<Session[]> {
    try {
      const response = await this.fetchSessions({ status: 'ended' });
      return response.sessions;
    } catch (error) {
      console.error('[SessionsService] Error fetching ended sessions:', error);
      throw error;
    }
  },

  async fetchSessionsBySubject(subject: string): Promise<Session[]> {
    try {
      const response = await this.fetchSessions({ subject });
      return response.sessions;
    } catch (error) {
      console.error('[SessionsService] Error fetching sessions by subject:', error);
      throw error;
    }
  },

  async fetchSessionsByTopic(topic: string): Promise<Session[]> {
    try {
      const response = await this.fetchSessions({ topic });
      return response.sessions;
    } catch (error) {
      console.error('[SessionsService] Error fetching sessions by topic:', error);
      throw error;
    }
  },
};
