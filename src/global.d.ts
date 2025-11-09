import type { Session } from './types';

declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<any>;
      getSettings: () => Promise<any>;
      updateSettings: (settings: any) => Promise<any>;
      getWatchedFolder: () => Promise<any>;
      getWatchedFiles: () => Promise<any>;
      stopWatching: () => Promise<any>;
      manualSync: () => Promise<any>;
      uploadFile: (filePath: string) => Promise<any>;
      uploadFileDirect: (filePath: string) => Promise<any>;
      setBearerToken: (token: string) => Promise<any>;
      setApiBaseUrl: (url: string) => Promise<any>;
      openExternal: (url: string) => Promise<any>;
      openFile: (filePath: string) => Promise<any>;
      fetchNotePreviews: (noteIds: string[]) => Promise<any>;
      onSyncStatus: (callback: (data: any) => void) => void;
      onWatchStarted: (callback: (data: any) => void) => void;
      onInitialFiles: (callback: (data: any) => void) => void;
      onUploadProgress: (callback: (data: any) => void) => void;
      onUploadStatus: (callback: (data: any) => void) => void;
      onTriggerRecording: (callback: () => void) => void;

      auth: {
        login: () => Promise<any>;
        logout: () => Promise<any>;
        getToken: () => Promise<any>;
        isAuthenticated: () => Promise<any>;
        validateToken: () => Promise<any>;
      };

      session: {
        getInfo: () => Promise<any>;
        reset: (subject: string, topic: string, endDateTime?: string, title?: string) => Promise<any>;
        setCurrent: (sessionId: string | null) => Promise<any>;
        onSessionSelected: (callback: (session: Session) => void) => void;
      };

      uploadRecords: {
        getAll: () => Promise<any>;
        get: (relativePath: string) => Promise<any>;
        remove: (relativePath: string) => Promise<any>;
        clearAll: () => Promise<any>;
        syncFromServer: () => Promise<any>;
      };

      overlay: {
        toggle: () => Promise<any>;
        close: () => Promise<any>;
      };

      recording: {
        start: (recordingId: string, title: string, mimeType: string) => Promise<any>;
        stop: (recordingId: string, totalDuration: number) => Promise<any>;
        cancel: (recordingId: string) => Promise<any>;
        saveChunk: (recordingId: string, chunk: any, chunkNumber: number) => Promise<any>;
        saveFinal: (audioData: any, timestamp: number) => Promise<any>;
      };

      captures: {
        getAll: () => Promise<any>;
        delete: (captureItems: any[]) => Promise<any>;
        saveAsNotes: (paths: string[]) => Promise<any>;
        getPath: () => Promise<any>;
        retryUpload: (filePath: string) => Promise<any>;
        retryAll: () => Promise<any>;
        onCapturesChanged: (callback: () => void) => void;
      };

      sessions: {
        getAll: (params?: any) => Promise<any>;
      };

      sessionOverlay: {
        show: () => Promise<any>;
        close: () => Promise<any>;
      };

      network: {
        getStatus: () => Promise<any>;
        onStatusChanged: (callback: (data: any) => void) => void;
      };

      sync: {
        getQueueStats: () => Promise<any>;
        processQueue: () => Promise<any>;
        clearQueue: () => Promise<any>;
        onCompleted: (callback: (data: any) => void) => void;
      };

      cache: {
        getStats: () => Promise<any>;
        clear: () => Promise<any>;
        cleanExpired: () => Promise<any>;
      };
    };
  }
}

export {};
