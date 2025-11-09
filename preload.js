const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  getWatchedFolder: () => ipcRenderer.invoke('get-watched-folder'),
  getWatchedFiles: () => ipcRenderer.invoke('get-watched-files'),
  stopWatching: () => ipcRenderer.invoke('stop-watching'),
  manualSync: () => ipcRenderer.invoke('manual-sync'),
  uploadFile: (filePath) => ipcRenderer.invoke('upload-file', filePath),
  uploadFileDirect: (filePath) => ipcRenderer.invoke('upload-file-direct', filePath),
  setBearerToken: (token) => ipcRenderer.invoke('set-bearer-token', token),
  setApiBaseUrl: (url) => ipcRenderer.invoke('set-api-base-url', url),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  fetchNotePreviews: (noteIds) => ipcRenderer.invoke('fetch-note-previews', noteIds),
  onSyncStatus: (callback) => ipcRenderer.on('sync-status', (event, data) => callback(data)),
  onWatchStarted: (callback) => ipcRenderer.on('watch-started', (event, data) => callback(data)),
  onInitialFiles: (callback) => ipcRenderer.on('initial-files', (event, data) => callback(data)),
  onUploadProgress: (callback) => ipcRenderer.on('upload-progress', (event, data) => callback(data)),
  onUploadStatus: (callback) => ipcRenderer.on('upload-status', (event, data) => callback(data)),
  onTriggerRecording: (callback) => ipcRenderer.on('trigger-recording-from-overlay', () => callback()),
  
  // Authentication APIs
  auth: {
    login: () => ipcRenderer.invoke('auth-login'),
    logout: () => ipcRenderer.invoke('auth-logout'),
    getToken: () => ipcRenderer.invoke('auth-get-token'),
    isAuthenticated: () => ipcRenderer.invoke('auth-is-authenticated'),
    validateToken: () => ipcRenderer.invoke('auth-validate-token')
  },
  
  // Session Management APIs
  session: {
    getInfo: () => ipcRenderer.invoke('session-get-info'),
    reset: (subject, topic, endDateTime, title) => ipcRenderer.invoke('session-reset', { subject, topic, endDateTime, title })
  },
  
  // Upload Records APIs
  uploadRecords: {
    getAll: () => ipcRenderer.invoke('get-upload-records'),
    get: (relativePath) => ipcRenderer.invoke('get-upload-record', relativePath),
    remove: (relativePath) => ipcRenderer.invoke('remove-upload-record', relativePath),
    clearAll: () => ipcRenderer.invoke('clear-upload-records'),
    syncFromServer: () => ipcRenderer.invoke('sync-upload-records-from-server')
  },
  
  // Overlay APIs
  overlay: {
    toggle: () => ipcRenderer.invoke('toggle-overlay'),
    close: () => ipcRenderer.invoke('close-overlay')
  },
  
  // Recording APIs
  recording: {
    start: (recordingId, title, mimeType) => ipcRenderer.invoke('recording-start', { recordingId, title, mimeType }),
    stop: (recordingId, totalDuration) => ipcRenderer.invoke('recording-stop', { recordingId, totalDuration }),
    cancel: (recordingId) => ipcRenderer.invoke('recording-cancel', { recordingId }),
    saveChunk: (recordingId, chunk, chunkNumber) => ipcRenderer.invoke('recording-save-chunk', { recordingId, chunk, chunkNumber }),
    saveFinal: (audioData, timestamp) => ipcRenderer.invoke('recording-save-final', { audioData, timestamp }) // Legacy support
  },
  
  // Captures APIs
  captures: {
    getAll: () => ipcRenderer.invoke('captures-get-all'),
    delete: (captureItems) => ipcRenderer.invoke('captures-delete', captureItems),
    saveAsNotes: (paths) => ipcRenderer.invoke('captures-save-as-notes', paths),
    getPath: () => ipcRenderer.invoke('captures-get-path'),
    retryUpload: (filePath) => ipcRenderer.invoke('captures-retry-upload', filePath),
    retryAll: () => ipcRenderer.invoke('captures-retry-all')
  }
});