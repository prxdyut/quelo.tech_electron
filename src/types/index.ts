export interface FileItem {
  path: string;
  name: string;
  size: number;
  type: string;
  modifiedTime: number;
  status: 'idle' | 'syncing' | 'synced' | 'error';
  error?: string;
  uploadProgress?: number;
  preview?: string;
}

export interface SyncStats {
  totalFiles: number;
  syncedFiles: number;
  failedFiles: number;
  lastSync: number | null;
  isWatching: boolean;
}

export interface Settings {
  autoSync: boolean;
  syncInterval: number;
  ignoreHidden: boolean;
  ignoredExtensions: string[];
  maxFileSize: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  autoStart: boolean;
  apiBaseUrl: string;
  bearerToken: string | null;
}

export interface Capture {
  path: string | null; // null for backend captures
  name: string;
  type: 'screenshot' | 'recording' | 'audio';
  size: number;
  createdAt: number;
  timestamp: Date;
  thumbnail?: string;
  // Backend capture fields
  captureId?: string;
  url?: string;
  source: 'backend' | 'local';
  tags?: string[];
  // Local failed upload fields
  uploadError?: string;
  retryCount?: number;
  lastAttempt?: Date;
  // Recording fields
  duration?: number; // Duration in seconds
  totalChunks?: number;
  status?: string;
}

export interface UploadProgress {
  fileName: string;
  percent: number;
  status: string;
  partInfo?: string;
  bytes?: string;
  preprocessProgress?: number;
  preprocessPageInfo?: string;
  error?: string;
  success?: boolean;
  noteId?: string;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  user?: {
    email?: string;
    name?: string;
    id?: string;
  };
}

declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>;
      getSettings: () => Promise<Settings>;
      updateSettings: (settings: Partial<Settings>) => Promise<void>;
      getWatchedFolder: () => Promise<string>;
      getWatchedFiles: () => Promise<FileItem[]>;
      stopWatching: () => Promise<void>;
      manualSync: () => Promise<void>;
      uploadFile: (filePath: string) => Promise<void>;
      uploadFileDirect: (filePath: string) => Promise<void>;
      setBearerToken: (token: string) => Promise<void>;
      setApiBaseUrl: (url: string) => Promise<void>;
      openExternal: (url: string) => Promise<void>;
      fetchNotePreviews: (noteIds: string[]) => Promise<{ success: boolean; previews: Record<string, string | null>; error?: string }>;
      onSyncStatus: (callback: (data: any) => void) => void;
      onWatchStarted: (callback: (data: any) => void) => void;
      onInitialFiles: (callback: (data: FileItem[]) => void) => void;
      onUploadProgress: (callback: (data: UploadProgress) => void) => void;
      onUploadStatus: (callback: (data: any) => void) => void;
      onTriggerRecording: (callback: () => void) => void;
      auth: {
        login: () => Promise<{ success: boolean; token?: string; error?: string }>;
        logout: () => Promise<{ success: boolean; error?: string }>;
        getToken: () => Promise<{ success: boolean; token?: string; error?: string }>;
        isAuthenticated: () => Promise<{ success: boolean; isAuthenticated: boolean }>;
        validateToken: () => Promise<{ success: boolean; isValid: boolean; user?: any }>;
      };
      session: {
        getInfo: () => Promise<{ success: boolean; sessionId?: string; sessionStartTime?: number; sessionAge?: number; endDateTime?: string; subject?: string; topic?: string; title?: string; status?: string; isExpired?: boolean; error?: string }>;
        reset: (subject: string, topic: string, endDateTime?: string | Date, title?: string) => Promise<{ success: boolean; oldSessionId?: string; oldStartTime?: number; newSessionId?: string; newStartTime?: number; endDateTime?: string; subject?: string; topic?: string; title?: string; status?: string; error?: string }>;
      };
      uploadRecords: {
        getAll: () => Promise<Record<string, any>>;
        get: (relativePath: string) => Promise<any>;
        remove: (relativePath: string) => Promise<void>;
        clearAll: () => Promise<void>;
        syncFromServer: () => Promise<void>;
      };
      overlay: {
        toggle: () => Promise<void>;
        close: () => Promise<void>;
      };
      recording: {
        start: (recordingId: string, title?: string, mimeType?: string) => Promise<{ success: boolean; recordingId?: string; metadata?: any; error?: string }>;
        stop: (recordingId: string, totalDuration?: number) => Promise<{ success: boolean; fileName?: string; filePath?: string; totalChunks?: number; totalSize?: number; error?: string }>;
        cancel: (recordingId: string) => Promise<{ success: boolean; error?: string }>;
        saveChunk: (recordingId: string, chunk: ArrayBuffer, chunkNumber: number) => Promise<{ success: boolean; chunkPath?: string; totalChunks?: number; error?: string }>;
        saveFinal: (audioData: ArrayBuffer, timestamp: number) => Promise<{ success: boolean; filename?: string; error?: string }>;
      };
      captures: {
        getAll: () => Promise<Capture[]>;
        delete: (captureItems: Capture[]) => Promise<{ success: boolean; backend?: number; local?: number; errors?: string[] }>;
        saveAsNotes: (paths: string[]) => Promise<{ success: boolean; saved?: number; error?: string }>;
        getPath: () => Promise<string>;
        retryUpload: (filePath: string) => Promise<{ success: boolean; captureId?: string; url?: string; error?: string }>;
        retryAll: () => Promise<{ success: boolean; uploaded?: number; failed?: number; errors?: string[] }>;
      };
    };
  }
}

export {};
