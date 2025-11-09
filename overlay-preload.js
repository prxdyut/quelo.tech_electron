const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  closeOverlay: () => ipcRenderer.invoke('close-overlay'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  openMainWindow: () => ipcRenderer.invoke('open-main-window'),
  openSessionOverlay: () => ipcRenderer.invoke('open-session-overlay'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  toggleSync: () => ipcRenderer.invoke('toggle-sync'),
  restartSync: () => ipcRenderer.invoke('restart-sync'),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  getRecentCaptures: () => ipcRenderer.invoke('get-recent-captures'),
  openCapturesFolder: () => ipcRenderer.invoke('open-captures-folder'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  getCapturePath: (filename) => ipcRenderer.invoke('get-capture-path', filename),
  deleteCapture: (filename) => ipcRenderer.invoke('delete-capture', filename),
  triggerRecording: () => {
    console.log('[Overlay Preload] triggerRecording called');
    return ipcRenderer.invoke('trigger-recording');
  },
  // Direct recording APIs for overlay
  recording: {
    start: (recordingId, title, mimeType) => {
      console.log('[Overlay Preload] recording.start called');
      return ipcRenderer.invoke('recording-start', { recordingId, title, mimeType });
    },
    stop: (recordingId, totalDuration) => {
      console.log('[Overlay Preload] recording.stop called');
      return ipcRenderer.invoke('recording-stop', { recordingId, totalDuration });
    },
    cancel: (recordingId) => {
      console.log('[Overlay Preload] recording.cancel called');
      return ipcRenderer.invoke('recording-cancel', { recordingId });
    },
    saveChunk: (recordingId, chunk, chunkNumber) => {
      console.log('[Overlay Preload] recording.saveChunk called');
      return ipcRenderer.invoke('recording-save-chunk', { recordingId, chunk, chunkNumber });
    }
  },
  // Session Management APIs
  session: {
    getInfo: () => {
      console.log('[Overlay Preload] session.getInfo called');
      return ipcRenderer.invoke('session-get-info');
    },
    reset: (subject, topic, endDateTime, title) => {
      console.log('[Overlay Preload] session.reset called with params:', { subject, topic, endDateTime, title });
      return ipcRenderer.invoke('session-reset', { subject, topic, endDateTime, title });
    }
  }
});

