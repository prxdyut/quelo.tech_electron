const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sessionOverlayAPI', {
  // Session operations
  getSessions: () => ipcRenderer.invoke('session-dialog-get-sessions'),
  createSession: (subject, topic, endTime) => 
    ipcRenderer.invoke('session-dialog-create', { subject, topic, endTime }),
  selectSession: (sessionId) => 
    ipcRenderer.invoke('session-dialog-select', { sessionId }),
  closeWindow: () => ipcRenderer.invoke('session-overlay-close'),
  
  // UI callbacks
  onSessionsLoaded: (callback) => {
    ipcRenderer.on('session-overlay-sessions-loaded', (event, sessions) => callback(sessions));
  },
  onSessionCreated: (callback) => {
    ipcRenderer.on('session-overlay-created', (event, session) => callback(session));
  },
  onSessionSelected: (callback) => {
    ipcRenderer.on('session-overlay-selected', (event, session) => callback(session));
  },
  onError: (callback) => {
    ipcRenderer.on('session-overlay-error', (event, error) => callback(error));
  },
});
