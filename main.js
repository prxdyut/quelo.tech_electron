const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, desktopCapturer, screen, shell } = require('electron');
const path = require('path');
const chokidar = require('chokidar');
const fs = require('fs');
const crypto = require('crypto');
const uploadService = require('./uploadService');
const authService = require('./authService');
const captureService = require('./captureService');
const AudioRecordingService = require('./audioRecordingService');
const config = require('./config');

let mainWindow;
let overlayWindow = null;
let tray = null;
let watcher = null;
let watchedFolder = null;
let audioRecorder = null;
let audioRecordingService = null;
let recordingChunks = [];
let recordingStream = null;
let syncStats = {
  totalFiles: 0,
  syncedFiles: 0,
  failedFiles: 0,
  lastSync: null,
  isWatching: false
};
let settings = {
  autoSync: true,
  syncInterval: 0,
  ignoreHidden: true,
  ignoredExtensions: [],
  maxFileSize: 100,
  compressionEnabled: false,
  encryptionEnabled: false,
  autoStart: true,  // Changed to true by default
  apiBaseUrl: config.API.BASE_URL,
  bearerToken: null
};

// Session management
let sessionData = {
  sessionId: null,
  sessionStartTime: null,
  endDateTime: null,
  subject: null,
  topic: null,
  title: null,
  status: null
};

// Create session with backend
async function createSessionWithBackend(subject, topic, title = null) {
  try {
    const token = await authService.getToken();
    if (!token) {
      console.error('[Session] No auth token available for session creation');
      throw new Error('Authentication required to create session');
    }

    const API_BASE = settings.apiBaseUrl || config.API.BASE_URL;
    const response = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'create',
        subject,
        topic,
        title
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to create session: ${response.status}`);
    }

    const result = await response.json();
    console.log('[Session] Backend session created:', result);

    return {
      success: true,
      sessionId: result.sessionId,
      startTime: result.startTime,
      status: result.status,
      ...result
    };
  } catch (error) {
    console.error('[Session] Error creating session with backend:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// End session with backend
async function endSessionWithBackend(sessionId, endTime) {
  try {
    const token = await authService.getToken();
    if (!token) {
      console.error('[Session] No auth token available for ending session');
      return { success: false, error: 'Authentication required' };
    }

    const API_BASE = settings.apiBaseUrl || config.API.BASE_URL;
    const response = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'end',
        sessionId,
        endTime: endTime.toISOString()
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to end session: ${response.status}`);
    }

    const result = await response.json();
    console.log('[Session] Backend session ended:', result);

    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error('[Session] Error ending session with backend:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Get or create session ID - checks endDateTime
function getSessionId() {
  const now = Date.now();
  
  // Check if session exists and is valid
  if (sessionData.sessionId && sessionData.sessionStartTime) {
    // Check if we've passed the end time
    if (sessionData.endDateTime) {
      const endTime = new Date(sessionData.endDateTime).getTime();
      if (now >= endTime) {
        console.log('[Session] Session end time reached, needs new session');
        // Don't auto-create, just mark as expired
        sessionData.status = 'expired';
        return null; // Force creation of new session
      }
    }
    
    return sessionData.sessionId;
  }
  
  // No active session
  return null;
}

// Create new session with backend
async function createNewSession(subject, topic, endDateTime, title = null) {
  // End previous session if exists
  if (sessionData.sessionId && sessionData.status === 'active') {
    console.log('[Session] Ending previous session before creating new one');
    await endSessionWithBackend(sessionData.sessionId, new Date());
  }
  
  // Create new session with backend
  const result = await createSessionWithBackend(subject, topic, title);
  
  if (result.success && result.sessionId) {
    sessionData.sessionId = result.sessionId;
    sessionData.sessionStartTime = result.startTime ? new Date(result.startTime).getTime() : Date.now();
    sessionData.endDateTime = endDateTime ? endDateTime.toISOString() : null;
    sessionData.subject = subject;
    sessionData.topic = topic;
    sessionData.title = title;
    sessionData.status = result.status || 'active';
    saveSettings();
    
    console.log(`[Session] New backend session created - ID: ${result.sessionId}`);
    return {
      success: true,
      sessionId: sessionData.sessionId,
      sessionStartTime: sessionData.sessionStartTime,
      endDateTime: sessionData.endDateTime,
      subject: sessionData.subject,
      topic: sessionData.topic,
      title: sessionData.title,
      status: sessionData.status
    };
  } else {
    console.error('[Session] Failed to create backend session:', result.error);
    return {
      success: false,
      error: result.error || 'Failed to create session with backend'
    };
  }
}

// Reset/Create session (for manual creation from UI)
async function resetSession(subject, topic, endDateTime = null, title = null) {
  const oldSessionId = sessionData.sessionId;
  const oldStartTime = sessionData.sessionStartTime;
  
  // Validate required fields
  if (!subject || !topic) {
    return {
      success: false,
      error: 'Subject and topic are required'
    };
  }
  
  // Create new session with backend
  const result = await createNewSession(subject, topic, endDateTime, title);
  
  if (result.success) {
    return {
      success: true,
      oldSessionId,
      oldStartTime,
      newSessionId: sessionData.sessionId,
      newStartTime: sessionData.sessionStartTime,
      endDateTime: sessionData.endDateTime,
      subject: sessionData.subject,
      topic: sessionData.topic,
      title: sessionData.title,
      status: sessionData.status
    };
  } else {
    return result;
  }
}

// Get session info
function getSessionInfo() {
  // Check if session has expired
  const sessionId = getSessionId(); // This checks endDateTime
  
  return {
    sessionId: sessionData.sessionId,
    sessionStartTime: sessionData.sessionStartTime,
    sessionAge: sessionData.sessionStartTime ? Date.now() - sessionData.sessionStartTime : 0,
    endDateTime: sessionData.endDateTime,
    subject: sessionData.subject,
    topic: sessionData.topic,
    title: sessionData.title,
    status: sessionData.status,
    isExpired: sessionId === null && sessionData.sessionId !== null
  };
}

// Upload records to track already synced files
// Structure: { relativePath: { hash: string, uploadedAt: timestamp, s3Key: string, noteId: string } }
let uploadRecords = {};

const fs_path = require('fs').promises;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const uploadRecordsPath = path.join(app.getPath('userData'), 'upload-records.json');
const capturesPath = path.join(app.getPath('userData'), 'captures');
const failedUploadsPath = path.join(app.getPath('userData'), 'failed-uploads.json');

// Track failed uploads
let failedUploads = [];

// Ensure captures directory exists
if (!fs.existsSync(capturesPath)) {
  fs.mkdirSync(capturesPath, { recursive: true });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Handle second instance (for protocol handling)
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window and handle protocol
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Check for auth callback protocol URL
    const url = commandLine.find(arg => arg.startsWith('quelotech://'));
    if (url) {
      console.log('[Auth] Protocol URL received:', url);
      handleDeepLink(url);
    }
  });

  // Handle protocol on macOS
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });
}

// Load saved settings
async function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const savedSettings = JSON.parse(data);
      settings = { ...settings, ...savedSettings.settings };
      watchedFolder = savedSettings.watchedFolder || 'C:\\testing';

      // Load session data if exists
      if (savedSettings.sessionData) {
        sessionData = savedSettings.sessionData;
        console.log(`[Session] Loaded existing session: ${sessionData.sessionId}`);
      }

      // Initialize authService and load token
      const token = await authService.initialize();
      if (token) {
        settings.bearerToken = token;
        uploadService.setBearerToken(token);
        console.log('[Auth] Token loaded and validated on startup');
      }

      // Update upload service with API base URL
      if (settings.apiBaseUrl) {
        process.env.API_BASE_URL = settings.apiBaseUrl;
      }

      return watchedFolder;
    } else {
      // No settings file exists yet, try to initialize auth
      const token = await authService.initialize();
      if (token) {
        settings.bearerToken = token;
        uploadService.setBearerToken(token);
        console.log('[Auth] Token loaded on first run');
      }

      // Use default folder
      return 'C:\\testing';
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return 'C:\\testing'; // Default fallback
}

// Save settings
function saveSettings() {
  try {
    // Don't save bearer token in settings file - it's stored securely in keytar
    const { bearerToken, ...settingsToSave } = settings;

    const data = {
      watchedFolder,
      settings: settingsToSave,
      sessionData: sessionData // Persist session data
    };
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Load upload records
function loadUploadRecords() {
  try {
    if (fs.existsSync(uploadRecordsPath)) {
      const data = fs.readFileSync(uploadRecordsPath, 'utf8');
      uploadRecords = JSON.parse(data);
      console.log(`[Upload Records] Loaded ${Object.keys(uploadRecords).length} records`);
    } else {
      uploadRecords = {};
      console.log('[Upload Records] No existing records found, starting fresh');
    }
  } catch (error) {
    console.error('Error loading upload records:', error);
    uploadRecords = {};
  }
}

// Save upload records
function saveUploadRecords() {
  try {
    fs.writeFileSync(uploadRecordsPath, JSON.stringify(uploadRecords, null, 2));
    console.log(`[Upload Records] Saved ${Object.keys(uploadRecords).length} records`);
  } catch (error) {
    console.error('Error saving upload records:', error);
  }
}

// Load failed uploads
function loadFailedUploads() {
  try {
    if (fs.existsSync(failedUploadsPath)) {
      const data = fs.readFileSync(failedUploadsPath, 'utf8');
      failedUploads = JSON.parse(data);
      console.log(`[Failed Uploads] Loaded ${failedUploads.length} failed uploads`);
    } else {
      failedUploads = [];
      console.log('[Failed Uploads] No failed uploads found');
    }
  } catch (error) {
    console.error('Error loading failed uploads:', error);
    failedUploads = [];
  }
}

// Save failed uploads
function saveFailedUploads() {
  try {
    fs.writeFileSync(failedUploadsPath, JSON.stringify(failedUploads, null, 2));
    console.log(`[Failed Uploads] Saved ${failedUploads.length} failed uploads`);
  } catch (error) {
    console.error('Error saving failed uploads:', error);
  }
}

// Add a failed upload
function addFailedUpload(filePath, fileName, error) {
  const existing = failedUploads.find(f => f.path === filePath);
  if (existing) {
    existing.retryCount++;
    existing.lastError = error;
    existing.lastAttempt = Date.now();
  } else {
    failedUploads.push({
      path: filePath,
      name: fileName,
      error: error,
      retryCount: 1,
      lastAttempt: Date.now(),
      createdAt: Date.now()
    });
  }
  saveFailedUploads();
}

// Remove a failed upload
function removeFailedUpload(filePath) {
  failedUploads = failedUploads.filter(f => f.path !== filePath);
  saveFailedUploads();
}

// Sync upload records from server
async function syncUploadRecordsFromServer() {
  try {
    console.log('[Upload Records] Syncing from server...');
    const data = await uploadService.getLocalSyncedFiles();

    if (data && data.notes && Array.isArray(data.notes)) {
      let syncedCount = 0;
      console.log(`[Upload Records] Retrieved ${data.notes.length} records from server`, data.notes);
      // Update local records with server data
      for (const note of data.notes) {
        const fileName = note.originalFileName;
        console.log(fileName);
        // Check if we have this file in our records
        const existingRecord = uploadRecords[fileName];

        if (!existingRecord) {
          // Add server record to local records
          uploadRecords[fileName] = {
            hash: null, // We don't have the hash from server, will be updated on next check
            uploadedAt: new Date(note.createdAt).getTime(),
            noteId: note.id,
            fileSize: note.fileSize,
            mimeType: note.mimeType,
            fromServer: true
          };
          syncedCount++;
        } else if (!existingRecord.noteId && note.id) {
          // Update existing record with server note ID
          existingRecord.noteId = note.id;
          existingRecord.preview = note.preview;
          existingRecord.fromServer = true;
          syncedCount++;
        }
      }

      if (syncedCount > 0) {
        saveUploadRecords();
        console.log(`[Upload Records] Synced ${syncedCount} files from server`);
      } else {
        console.log('[Upload Records] No new files to sync from server');
      }

      return { success: true, total: data.total, synced: syncedCount };
    }
  } catch (error) {
    console.error('[Upload Records] Failed to sync from server:', error);
    return { success: false, error: error.message };
  }
}

// Check if file has already been uploaded with the same content
function isFileAlreadyUploaded(relativePath, fileHash) {
  const record = uploadRecords[relativePath];
  if (!record) {
    return false;
  }

  // If we have a hash, check if it matches
  if (record.hash && record.hash === fileHash) {
    console.log(`[Upload Records] File already uploaded: ${relativePath} (hash: ${fileHash})`);
    return true;
  }

  // If record is from server but no hash, update the hash and consider it uploaded
  if (record.fromServer && !record.hash) {
    record.hash = fileHash;
    saveUploadRecords();
    console.log(`[Upload Records] Updated hash for server file: ${relativePath}`);
    return true;
  }

  // If hash exists but doesn't match, file was modified
  if (record.hash && record.hash !== fileHash) {
    console.log(`[Upload Records] File modified: ${relativePath} (old hash: ${record.hash}, new hash: ${fileHash})`);
    return false;
  }

  return false;
}

// Record a successful upload
function recordUpload(relativePath, fileHash, uploadResult) {
  uploadRecords[relativePath] = {
    hash: fileHash,
    uploadedAt: Date.now(),
    noteId: uploadResult.result?.id || uploadResult.noteId // Use result.id from preprocessing
  };
  saveUploadRecords();
  console.log(`[Upload Records] Recorded upload: ${relativePath} (noteId: ${uploadRecords[relativePath].noteId})`);
}

// Remove upload record (for deleted files)
function removeUploadRecord(relativePath) {
  if (uploadRecords[relativePath]) {
    delete uploadRecords[relativePath];
    saveUploadRecords();
    console.log(`[Upload Records] Removed record: ${relativePath}`);
  }
}

// Clear all upload records
function clearUploadRecords() {
  uploadRecords = {};
  saveUploadRecords();
  console.log('[Upload Records] All records cleared');
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'logo.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true,
    show: false  // Don't show on creation
  });

  // Load Vite dev server in development, or built files in production
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL(config.DEV.VITE_URL);
    // Open DevTools for debugging in development
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Handle window close - minimize to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function createOverlayWindow() {
  if (overlayWindow) {
    overlayWindow.show();
    overlayWindow.focus();
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: width,
    height: height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'overlay-preload.js')
    }
  });

  // Open DevTools for debugging
  // overlayWindow.webContents.openDevTools({ mode: 'detach' });

  // Set window to be click-through except for buttons
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.loadFile('overlay.html');

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  // Make specific regions clickable
  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.executeJavaScript(`
      document.addEventListener('mouseover', (e) => {
        if (e.target.id === 'screenshotBtn' || e.target.id === 'closeBtn') {
          require('electron').ipcRenderer.send('set-ignore-mouse-events', false);
        }
      });
      
      document.addEventListener('mouseout', (e) => {
        if (e.target.id === 'screenshotBtn' || e.target.id === 'closeBtn') {
          require('electron').ipcRenderer.send('set-ignore-mouse-events', true);
        }
      });
    `);
  });
}

function createTray() {
  const icon = path.join(__dirname, 'logo.ico');

  tray = new Tray(icon);
  updateTrayMenu();
  updateTrayTooltip();

  // Single click on tray icon shows the main window
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
      // Also open overlay when opening the app
      if (!overlayWindow) {
        createOverlayWindow();
      }
    }
  });

  // Double click also shows the window
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
    // Also open overlay when opening the app
    if (!overlayWindow) {
      createOverlayWindow();
    }
  });
}

function updateTrayTooltip() {
  if (!tray) return;

  let tooltip = 'Quelo.tech File Sync\n';

  if (syncStats.isWatching && watchedFolder) {
    tooltip += `📁 Watching: ${path.basename(watchedFolder)}\n`;
    tooltip += `✅ Synced: ${syncStats.syncedFiles}\n`;
    if (syncStats.failedFiles > 0) {
      tooltip += `❌ Failed: ${syncStats.failedFiles}\n`;
    }
    if (syncStats.lastSync) {
      tooltip += `🕐 Last sync: ${new Date(syncStats.lastSync).toLocaleTimeString()}`;
    }
  } else {
    tooltip += '⏸️ Not watching any folder';
  }

  tray.setToolTip(tooltip);
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        mainWindow.show();
      }
    },
    {
      label: 'Hide App',
      click: () => {
        mainWindow.hide();
      }
    },
    {
      type: 'separator'
    },
    {
      label: overlayWindow ? '✓ Screenshot Overlay' : 'Screenshot Overlay',
      type: 'checkbox',
      checked: overlayWindow !== null,
      click: () => {
        if (overlayWindow) {
          overlayWindow.close();
          overlayWindow = null;
        } else {
          createOverlayWindow();
        }
        updateTrayMenu();
      }
    },
    {
      type: 'separator'
    },
    {
      label: watchedFolder ? `📁 ${path.basename(watchedFolder)}` : 'No folder selected',
      enabled: false
    },
    {
      label: syncStats.isWatching ? `Status: Watching (${syncStats.syncedFiles} files synced)` : 'Status: Idle',
      enabled: false
    },
    {
      type: 'separator'
    },
    {
      label: settings.autoStart ? '✓ Start with Windows' : 'Start with Windows',
      type: 'checkbox',
      checked: settings.autoStart,
      click: () => {
        toggleAutoStart();
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function toggleAutoStart() {
  settings.autoStart = !settings.autoStart;

  if (settings.autoStart) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: process.execPath,
      args: ['--hidden']
    });
  } else {
    app.setLoginItemSettings({
      openAtLogin: false
    });
  }

  saveSettings();
  updateTrayMenu();
}

function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function shouldIgnoreFile(filePath) {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Check if hidden file
  if (settings.ignoreHidden && fileName.startsWith('.')) {
    return true;
  }

  // Check ignored extensions
  if (settings.ignoredExtensions.includes(ext)) {
    return true;
  }

  // Check file size
  try {
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    if (sizeMB > settings.maxFileSize) {
      return true;
    }
  } catch (err) {
    return true;
  }

  return false;
}

async function uploadFile(filePath, relativePath) {
  return new Promise((resolve, reject) => {
    uploadService.uploadFile(
      filePath,
      // Progress callback
      (progressData) => {
        mainWindow.webContents.send('upload-progress', {
          file: relativePath,
          ...progressData
        });
      },
      // Status change callback
      (statusData) => {
        mainWindow.webContents.send('upload-status', {
          file: relativePath,
          ...statusData
        });

        if (statusData.status === 'completed') {
          resolve(statusData);
        } else if (statusData.status === 'error') {
          reject(new Error(statusData.error));
        }
      }
    ).then(resolve).catch(reject);
  });
}

async function deleteFile(relativePath) {
  try {
    // Check if we have a record with noteId for this file
    const record = uploadRecords[relativePath];

    if (record && record.noteId) {
      console.log(`[Delete] Deleting file from server: ${relativePath} (noteId: ${record.noteId})`);
      await uploadService.deleteNote(record.noteId);
      console.log(`[Delete] Successfully deleted from server: ${relativePath}`);
      return { success: true, noteId: record.noteId };
    } else {
      console.log(`[Delete] No server record found for: ${relativePath}, skipping server deletion`);
      return { success: true, skipped: true };
    }
  } catch (error) {
    console.error(`[Delete] Failed to delete from server: ${relativePath}`, error);
    throw error;
  }
}

async function syncFile(filePath, eventType) {
  try {
    const relativePath = path.relative(watchedFolder, filePath);

    console.log(`[Sync] Starting sync for ${relativePath} (${eventType})`);

    if (shouldIgnoreFile(filePath)) {
      mainWindow.webContents.send('sync-status', {
        file: relativePath,
        status: 'ignored',
        type: eventType,
        reason: 'File ignored by settings'
      });
      return;
    }

    mainWindow.webContents.send('sync-status', {
      file: relativePath,
      status: 'syncing',
      type: eventType
    });

    if (eventType === 'unlink') {
      // Delete from server first (needs the upload record)
      await deleteFile(relativePath);

      // Then remove from upload records
      removeUploadRecord(relativePath);

      syncStats.syncedFiles++;
      syncStats.lastSync = Date.now();
      updateTrayTooltip();
      updateTrayMenu();

      mainWindow.webContents.send('sync-status', {
        file: relativePath,
        status: 'deleted',
        type: eventType
      });
      return;
    }

    const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

    if (stats && stats.isFile()) {
      const fileHash = await calculateFileHash(filePath);

      // Check if file has already been uploaded with the same content
      if (isFileAlreadyUploaded(relativePath, fileHash)) {
        console.log(`[Sync] Skipping upload - file already synced: ${relativePath}`);

        mainWindow.webContents.send('sync-status', {
          file: relativePath,
          status: 'skipped',
          type: eventType,
          reason: 'File already uploaded with same content',
          hash: fileHash,
          ...uploadRecords[relativePath]
        });

        // Still count as synced (no action needed)
        syncStats.lastSync = Date.now();
        updateTrayTooltip();
        return;
      }

      // Get token from authService
      const currentToken = await authService.getToken();
      console.log(`[Sync] Token available: ${currentToken ? 'Yes' : 'No'}`);

      // Require authentication for uploads
      if (!currentToken) {
        throw new Error('Authentication required. Please sign in to upload files.');
      }

      // Sync token to settings and uploadService
      settings.bearerToken = currentToken;
      uploadService.setBearerToken(currentToken);

      // Upload file using real API
      console.log(`[Sync] Uploading ${relativePath} via API`);
      const result = await uploadFile(filePath, relativePath);

      // Record the successful upload with all metadata
      recordUpload(relativePath, fileHash, result);

      syncStats.syncedFiles++;
      syncStats.lastSync = Date.now();
      updateTrayTooltip();
      updateTrayMenu();

      mainWindow.webContents.send('sync-status', {
        file: relativePath,
        status: 'synced',
        type: eventType,
        size: stats.size,
        hash: fileHash,
        s3Key: result.s3Key || result.key,
        url: result.url,
        noteId: result.noteId,
        jobId: result.jobId
      });
    }
  } catch (error) {
    console.error('Sync error:', error);
    syncStats.failedFiles++;
    updateTrayTooltip();
    updateTrayMenu();

    mainWindow.webContents.send('sync-status', {
      file: path.relative(watchedFolder, filePath),
      status: 'error',
      type: eventType,
      error: error.message
    });
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Perform initial sync check: compare local files with upload records
async function performInitialSyncCheck(folderPath) {
  try {
    console.log('[Initial Sync] Checking for actions needed...');

    // Get all files in the watched folder
    const getAllFiles = (dir, fileList = []) => {
      const files = fs.readdirSync(dir);

      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          if (!settings.ignoreHidden || !file.startsWith('.')) {
            getAllFiles(filePath, fileList);
          }
        } else {
          if (!shouldIgnoreFile(filePath)) {
            fileList.push(filePath);
          }
        }
      });

      return fileList;
    };

    const localFiles = getAllFiles(folderPath);
    const localFileRelativePaths = localFiles.map(f => path.relative(folderPath, f));

    console.log(`[Initial Sync] Found ${localFiles.length} local files`);

    // Check for files that need uploading (exist locally but not in records or hash changed)
    let needsUpload = 0;
    for (const filePath of localFiles) {
      const relativePath = path.relative(folderPath, filePath);
      const fileHash = await calculateFileHash(filePath);

      if (!isFileAlreadyUploaded(relativePath, fileHash)) {
        needsUpload++;
      }
    }

    // Check for files that need deleting (in records but not in local files)
    let needsDelete = 0;
    const recordPaths = Object.keys(uploadRecords);

    for (const recordPath of recordPaths) {
      if (!localFileRelativePaths.includes(recordPath)) {
        console.log(`[Initial Sync] File deleted locally, will delete from server: ${recordPath}`);

        // Delete from server
        try {
          await deleteFile(recordPath);
          removeUploadRecord(recordPath);
          needsDelete++;
        } catch (error) {
          console.error(`[Initial Sync] Failed to delete: ${recordPath}`, error);
        }
      }
    }

    console.log(`[Initial Sync] Complete - ${needsUpload} files need upload, ${needsDelete} files deleted from server`);

    return { needsUpload, needsDelete };
  } catch (error) {
    console.error('[Initial Sync] Error during initial sync check:', error);
    return { needsUpload: 0, needsDelete: 0, error: error.message };
  }
}

function startWatching(folderPath) {
  if (watcher) {
    console.log('[Watch] Closing existing watcher...');
    watcher.close();
  }

  // Validate folder exists
  if (!folderPath) {
    console.error('[Watch] No folder path provided');
    return;
  }

  if (!fs.existsSync(folderPath)) {
    console.error(`[Watch] Folder does not exist: ${folderPath}`);
    console.log(`[Watch] Creating folder: ${folderPath}`);
    try {
      fs.mkdirSync(folderPath, { recursive: true });
    } catch (err) {
      console.error(`[Watch] Failed to create folder: ${err.message}`);
      return;
    }
  }

  // Verify it's a directory
  try {
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      console.error(`[Watch] Path is not a directory: ${folderPath}`);
      return;
    }
  } catch (err) {
    console.error(`[Watch] Failed to access folder: ${err.message}`);
    return;
  }

  console.log(`[Watch] Starting to watch folder: ${folderPath}`);
  watchedFolder = folderPath;
  syncStats.isWatching = true;
  syncStats.syncedFiles = 0;
  syncStats.failedFiles = 0;
  syncStats.totalFiles = 0;

  const watchOptions = {
    persistent: true,
    ignoreInitial: true, // Don't trigger 'add' for existing files - handle them in 'ready' event
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  };

  if (settings.ignoreHidden) {
    watchOptions.ignored = /(^|[\/\\])\../;
  }

  console.log('[Watch] Watcher options:', watchOptions);

  watcher = chokidar.watch(folderPath, watchOptions);

  watcher
    .on('add', filePath => {
      // All 'add' events after initial scan are new files
      console.log(`[Watch] File added: ${path.relative(folderPath, filePath)}`);
      if (settings.autoSync) {
        syncFile(filePath, 'add').catch(err => {
          console.error(`[Watch] Error syncing added file: ${filePath}`, err);
        });
      }
    })
    .on('change', filePath => {
      console.log(`[Watch] File changed: ${path.relative(folderPath, filePath)}`);
      if (settings.autoSync) {
        syncFile(filePath, 'change').catch(err => {
          console.error(`[Watch] Error syncing changed file: ${filePath}`, err);
        });
      }
    })
    .on('unlink', filePath => {
      console.log(`[Watch] File deleted: ${path.relative(folderPath, filePath)}`);
      if (settings.autoSync) {
        syncFile(filePath, 'unlink').catch(err => {
          console.error(`[Watch] Error syncing deleted file: ${filePath}`, err);
        });
      }
    })
    .on('error', error => {
      console.error('[Watch] Watcher error:', error);
      mainWindow.webContents.send('watch-error', error.message);
    })
    .on('ready', async () => {
      console.log('[Watch] Initial scan complete, performing full initial sync...');

      try {
        // Now that watcher is ready, sync all files that need uploading
        const getAllFiles = (dirPath, arrayOfFiles = []) => {
          try {
            const files = fs.readdirSync(dirPath);

            files.forEach(file => {
              const fullPath = path.join(dirPath, file);
              try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                  // Skip hidden directories if setting is enabled
                  if (!settings.ignoreHidden || !file.startsWith('.')) {
                    arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
                  }
                } else {
                  arrayOfFiles.push(fullPath);
                }
              } catch (err) {
                console.warn(`[Initial Sync] Error accessing ${fullPath}:`, err.message);
              }
            });
          } catch (err) {
            console.warn(`[Initial Sync] Error reading directory ${dirPath}:`, err.message);
          }

          return arrayOfFiles;
        };

        const localFiles = getAllFiles(folderPath);
        console.log(`[Initial Sync] Found ${localFiles.length} local files to check`);

        // Upload any files that need syncing
        for (const filePath of localFiles) {
          try {
            if (shouldIgnoreFile(filePath)) {
              console.log(`[Initial Sync] Ignoring: ${path.relative(folderPath, filePath)}`);
              continue;
            }

            const relativePath = path.relative(folderPath, filePath);
            const fileHash = await calculateFileHash(filePath);

            if (!isFileAlreadyUploaded(relativePath, fileHash)) {
              console.log(`[Initial Sync] Needs upload: ${relativePath}`);
              if (settings.autoSync) {
                await syncFile(filePath, 'add');
              }
            } else {
              console.log(`[Initial Sync] Already synced: ${relativePath}`);
            }
          } catch (err) {
            console.error(`[Initial Sync] Error processing file ${filePath}:`, err.message);
          }
        }

        // Check for deletions (files in records but not local)
        const localFileRelativePaths = localFiles.map(f => path.relative(folderPath, f));
        const recordPaths = Object.keys(uploadRecords);

        for (const recordPath of recordPaths) {
          if (!localFileRelativePaths.includes(recordPath)) {
            console.log(`[Initial Sync] File deleted locally, deleting from server: ${recordPath}`);
            try {
              if (settings.autoSync) {
                await deleteFile(recordPath);
                removeUploadRecord(recordPath);
              }
            } catch (error) {
              console.error(`[Initial Sync] Failed to delete: ${recordPath}`, error);
            }
          }
        }

        console.log('[Initial Sync] Complete - watching for changes');
      } catch (error) {
        console.error('[Initial Sync] Fatal error during initial sync:', error);
      }
    });

  updateTrayTooltip();
  updateTrayMenu();

  // Send watch-started event with folder path
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('watch-started', folderPath);

    // Also send initial files list to UI
    setTimeout(() => {
      try {
        const getAllFilesForUI = (dirPath, baseDir, arrayOfFiles = []) => {
          try {
            const files = fs.readdirSync(dirPath);

            files.forEach(file => {
              const fullPath = path.join(dirPath, file);
              try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                  if (!settings.ignoreHidden || !file.startsWith('.')) {
                    arrayOfFiles = getAllFilesForUI(fullPath, baseDir, arrayOfFiles);
                  }
                } else {
                  const relativePath = path.relative(baseDir, fullPath);
                  const uploadRecord = uploadRecords[relativePath];

                  arrayOfFiles.push({
                    path: fullPath,
                    relativePath: relativePath,
                    name: path.basename(fullPath),
                    size: stat.size,
                    modified: stat.mtime.getTime(),
                    status: uploadRecord ? 'synced' : 'pending',
                    uploaded: !!uploadRecord,
                    noteId: uploadRecord?.noteId
                  });
                }
              } catch (err) {
                console.warn(`[Watch Started] Error accessing ${fullPath}:`, err.message);
              }
            });
          } catch (err) {
            console.warn(`[Watch Started] Error reading directory ${dirPath}:`, err.message);
          }

          return arrayOfFiles;
        };

        const initialFiles = getAllFilesForUI(folderPath, folderPath);
        console.log(`[Watch Started] Sending ${initialFiles.length} initial files to UI`);

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('initial-files', initialFiles);
        }
      } catch (error) {
        console.error('[Watch Started] Error getting initial files:', error);
      }
    }, 500); // Small delay to ensure UI is ready
  }
}

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    startWatching(folderPath);
    saveSettings(); // Save the selected folder
    return folderPath;
  }
  return null;
});

ipcMain.handle('get-settings', () => {
  return settings;
});

ipcMain.handle('update-settings', (event, newSettings) => {
  settings = { ...settings, ...newSettings };

  // Update upload service with new settings
  if (newSettings.bearerToken !== undefined) {
    uploadService.setBearerToken(newSettings.bearerToken);
  }
  if (newSettings.apiBaseUrl !== undefined) {
    process.env.API_BASE_URL = newSettings.apiBaseUrl;
  }

  saveSettings(); // Save settings when updated

  // Restart watching if folder is being watched
  if (watchedFolder && watcher) {
    startWatching(watchedFolder);
  }

  return settings;
});

// Upload Records IPC Handlers
ipcMain.handle('get-upload-records', () => {
  return uploadRecords;
});

ipcMain.handle('clear-upload-records', () => {
  clearUploadRecords();
  return { success: true, message: 'All upload records cleared' };
});

ipcMain.handle('get-upload-record', (event, relativePath) => {
  return uploadRecords[relativePath] || null;
});

ipcMain.handle('remove-upload-record', (event, relativePath) => {
  removeUploadRecord(relativePath);
  return { success: true, message: `Record removed: ${relativePath}` };
});

ipcMain.handle('sync-upload-records-from-server', async () => {
  try {
    const result = await syncUploadRecordsFromServer();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-watched-folder', () => {
  return watchedFolder;
});

ipcMain.handle('get-watched-files', () => {
  console.log('[IPC] get-watched-files called');
  console.log('[IPC] watchedFolder:', watchedFolder);
  console.log('[IPC] uploadRecords count:', Object.keys(uploadRecords).length);

  if (!watchedFolder || !fs.existsSync(watchedFolder)) {
    console.log('[IPC] No watched folder or folder does not exist');
    return [];
  }

  try {
    const getAllFiles = (dirPath, baseDir, arrayOfFiles = []) => {
      try {
        const files = fs.readdirSync(dirPath);

        files.forEach(file => {
          const fullPath = path.join(dirPath, file);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              // Skip hidden directories if setting is enabled
              if (!settings.ignoreHidden || !file.startsWith('.')) {
                arrayOfFiles = getAllFiles(fullPath, baseDir, arrayOfFiles);
              }
            } else {
              const relativePath = path.relative(baseDir, fullPath);
              const uploadRecord = uploadRecords[relativePath];

              arrayOfFiles.push({
                path: fullPath,
                relativePath: relativePath,
                name: path.basename(fullPath),
                size: stat.size,
                modified: stat.mtime.getTime(),
                status: uploadRecord ? 'synced' : 'pending',
                uploaded: !!uploadRecord,
                noteId: uploadRecord?.noteId,
                preview: uploadRecord?.preview
              });
            }
          } catch (err) {
            console.warn(`[Get Files] Error accessing ${fullPath}:`, err.message);
          }
        });
      } catch (err) {
        console.warn(`[Get Files] Error reading directory ${dirPath}:`, err.message);
      }

      return arrayOfFiles;
    };

    const files = getAllFiles(watchedFolder, watchedFolder);
    console.log(`[Get Files] Returning ${files.length} files from watched folder: ${watchedFolder}`);
    if (files.length > 0) {
      console.log('[Get Files] Sample file:', files[0]);
    }
    return files;
  } catch (error) {
    console.error('[Get Files] Error getting watched files:', error);
    return [];
  }
});

ipcMain.handle('get-sync-stats', () => {
  return syncStats;
});

ipcMain.handle('stop-watching', () => {
  if (watcher) {
    watcher.close();
    watcher = null;
    watchedFolder = null;
    syncStats.isWatching = false;
    updateTrayTooltip();
    updateTrayMenu();
    saveSettings(); // Save when folder watching is stopped
    return true;
  }
  return false;
});

ipcMain.handle('manual-sync', async () => {
  if (!watchedFolder) {
    return { error: 'No folder is being watched' };
  }

  try {
    console.log('[Manual Sync] Starting manual sync...');
    const result = await performInitialSyncCheck(watchedFolder);
    console.log('[Manual Sync] Completed');
    return { success: true, ...result };
  } catch (error) {
    console.error('[Manual Sync] Error:', error);
    return { error: error.message };
  }
});

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

// Manual file upload handler
ipcMain.handle('upload-file', async (event, filePath) => {
  if (!watchedFolder) {
    return { error: 'No folder is being watched' };
  }

  try {
    const fileName = path.basename(filePath);
    const destPath = path.join(watchedFolder, fileName);

    // Copy file to watched folder
    await fs_path.copyFile(filePath, destPath);

    // Trigger sync
    await syncFile(destPath, 'add');

    return { success: true, path: destPath };
  } catch (error) {
    return { error: error.message };
  }
});

// Direct file upload (without copying to watched folder)
ipcMain.handle('upload-file-direct', async (event, filePath) => {
  try {
    const relativePath = path.basename(filePath);

    // Use real API upload
    const result = await realAPIUpload(filePath, relativePath);

    return {
      success: true,
      noteId: result.noteId,
      key: result.key,
      file: relativePath
    };
  } catch (error) {
    return { error: error.message };
  }
});

// Set bearer token (from authService or manual)
ipcMain.handle('set-bearer-token', async (event, token) => {
  try {
    await authService.storeToken(token);
    settings.bearerToken = token;
    uploadService.setBearerToken(token);
    captureService.setBearerToken(token);
    if (audioRecordingService) {
      audioRecordingService.setBearerToken(token);
    }

    console.log('[Auth] Bearer token set');
    return { success: true };
  } catch (error) {
    console.error('[Auth] Failed to set bearer token:', error);
    return { success: false, error: error.message };
  }
});

// Authentication IPC Handlers
ipcMain.handle('auth-login', async () => {
  try {
    const token = await authService.login(mainWindow);
    
    settings.bearerToken = token;
    uploadService.setBearerToken(token);
    captureService.setBearerToken(token);
    if (audioRecordingService) {
      audioRecordingService.setBearerToken(token);
    }

    console.log('[Auth] Login successful');
    return { success: true, token };
  } catch (error) {
    console.error('[Auth] Login failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth-logout', async () => {
  try {
    await authService.logout();
    settings.bearerToken = null;
    uploadService.setBearerToken(null);
    captureService.setBearerToken(null);
    if (audioRecordingService) {
      audioRecordingService.setBearerToken(null);
    }

    console.log('[Auth] Logout successful');
    return { success: true };
  } catch (error) {
    console.error('[Auth] Logout failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth-get-token', async () => {
  try {
    const token = await authService.getToken();
    return { success: true, token };
  } catch (error) {
    console.error('[Auth] Failed to get token:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth-is-authenticated', async () => {
  try {
    const isAuthenticated = await authService.isAuthenticated();
    return { success: true, isAuthenticated };
  } catch (error) {
    console.error('[Auth] Failed to check authentication:', error);
    return { success: false, isAuthenticated: false };
  }
});

ipcMain.handle('auth-validate-token', async () => {
  try {
    const result = await authService.validateToken();
    if (!result.isValid) {
      settings.bearerToken = null;
      uploadService.setBearerToken(null);
    }
    return { success: true, isValid: result.isValid, user: result.user };
  } catch (error) {
    console.error('[Auth] Token validation failed:', error);
    return { success: false, isValid: false, user: null };
  }
});

// Set API base URL
ipcMain.handle('set-api-base-url', (event, url) => {
  settings.apiBaseUrl = url;
  process.env.API_BASE_URL = url;
  saveSettings();
  return { success: true };
});

// Open external URL
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
  return { success: true };
});

// Session Management IPC Handlers
ipcMain.handle('session-get-info', async () => {
  try {
    const info = getSessionInfo();
    return { success: true, ...info };
  } catch (error) {
    console.error('Failed to get session info:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('session-reset', async (event, { subject, topic, endDateTime, title } = {}) => {
  try {
    // Validate required fields
    if (!subject || !topic) {
      return { 
        success: false, 
        error: 'Subject and topic are required' 
      };
    }
    
    // Parse endDateTime if provided as string
    let endDateTimeObj = null;
    if (endDateTime) {
      endDateTimeObj = new Date(endDateTime);
      if (isNaN(endDateTimeObj.getTime())) {
        return { 
          success: false, 
          error: 'Invalid end date/time provided' 
        };
      }
    }
    
    const result = await resetSession(subject, topic, endDateTimeObj, title);
    return result;
  } catch (error) {
    console.error('Failed to reset session:', error);
    return { success: false, error: error.message };
  }
});

// Fetch note previews from API
ipcMain.handle('fetch-note-previews', async (event, noteIds) => {
  try {
    if (!noteIds || noteIds.length === 0) {
      return { success: true, previews: {} };
    }

    const token = await authService.getToken();
    if (!token) {
      console.error('[Note Previews] No authentication token available');
      return { success: false, error: 'Not authenticated', previews: {} };
    }

    const apiUrl = `${settings.apiBaseUrl}/api/notes/previews`;
    console.log(`[Note Previews] Fetching previews for ${noteIds.length} notes from ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`[Note Previews] API returned status ${response.status}`);
      return { success: false, error: `API error: ${response.status}`, previews: {} };
    }

    const previews = await response.json();
    console.log(`[Note Previews] Received previews:`, Object.keys(previews).length);

    // Convert relative paths to absolute URLs
    const fullUrlPreviews = {};
    for (const [noteId, previewPath] of Object.entries(previews)) {

      fullUrlPreviews[noteId] = `${config.CDN.S3_BASE_URL}/${config.CDN.STORAGE_BUCKET}/${previewPath}`;

    }

    return { success: true, previews: fullUrlPreviews };
  } catch (error) {
    console.error('[Note Previews] Error fetching note previews:', error);
    return { success: false, error: error.message, previews: {} };
  }
});

// Screenshot functionality
ipcMain.handle('take-screenshot', async () => {
  try {
    // Temporarily hide overlay for clean screenshot
    const wasVisible = overlayWindow && overlayWindow.isVisible();
    if (overlayWindow) {
      overlayWindow.hide();
    }

    // Small delay to ensure overlay is hidden
    await new Promise(resolve => setTimeout(resolve, 50));

    // Capture screenshot
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: screen.getPrimaryDisplay().size
    });

    if (sources.length === 0) {
      if (overlayWindow && wasVisible) overlayWindow.show();
      return { success: false, error: 'No screen sources available' };
    }

    // Get the primary screen
    const primarySource = sources[0];
    const screenshot = primarySource.thumbnail;

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const filename = `screenshot_${timestamp}.png`;
    const filepath = path.join(capturesPath, filename); // Save to captures folder temporarily

    // Save screenshot locally first
    fs.writeFileSync(filepath, screenshot.toPNG());
    console.log(`[Screenshot] Saved temporarily: ${filename}`);

    // Restore overlay
    if (overlayWindow && wasVisible) {
      overlayWindow.show();
    }

    // Immediately try to upload to backend
    try {
      const uploadResult = await captureService.uploadCapture(filepath);

      if (uploadResult.success) {
        console.log(`[Screenshot] Successfully uploaded: ${uploadResult.captureId}`);
        // Delete local file after successful upload
        try {
          await fs_path.unlink(filepath);
          console.log(`[Screenshot] Deleted local file after upload: ${filename}`);
        } catch (unlinkError) {
          console.error(`[Screenshot] Error deleting local file:`, unlinkError);
        }

        return {
          success: true,
          filename: filename,
          captureId: uploadResult.captureId,
          url: uploadResult.url,
          uploaded: true
        };
      } else {
        // Upload failed, keep local file and track it
        console.error(`[Screenshot] Upload failed: ${uploadResult.error}`);
        addFailedUpload(filepath, filename, uploadResult.error);

        return {
          success: true,
          filename: filename,
          filepath: filepath,
          uploaded: false,
          uploadError: uploadResult.error
        };
      }
    } catch (uploadError) {
      console.error('[Screenshot] Upload error:', uploadError);
      addFailedUpload(filepath, filename, uploadError.message);

      return {
        success: true,
        filename: filename,
        filepath: filepath,
        uploaded: false,
        uploadError: uploadError.message
      };
    }
  } catch (error) {
    console.error('[Screenshot] Error:', error);

    // Make sure overlay is restored
    if (overlayWindow) {
      overlayWindow.show();
    }

    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('close-overlay', () => {
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
    updateTrayMenu();
  }
  return { success: true };
});

ipcMain.handle('toggle-overlay', () => {
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  } else {
    createOverlayWindow();
  }
  updateTrayMenu();
  return { success: true, visible: overlayWindow !== null };
});

ipcMain.handle('open-main-window', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('toggle-sync', () => {
  settings.autoSync = !settings.autoSync;
  saveSettings();

  return {
    success: true,
    isSyncing: settings.autoSync
  };
});

ipcMain.handle('restart-sync', async () => {
  try {
    if (watchedFolder) {
      // Stop and restart watching
      if (watcher) {
        watcher.close();
      }
      startWatching(watchedFolder);
      return { success: true };
    }
    return { success: false, error: 'No folder being watched' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-sync-status', () => {
  return {
    success: true,
    isSyncing: settings.autoSync,
    stats: syncStats
  };
});

ipcMain.handle('get-recent-captures', () => {
  try {
    if (!watchedFolder) {
      return { success: false, captures: [] };
    }

    const files = fs.readdirSync(watchedFolder)
      .filter(f => f.startsWith('screenshot_') && f.endsWith('.png'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(watchedFolder, f)).mtime
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 10)
      .map(f => f.name);

    return { success: true, captures: files };
  } catch (error) {
    return { success: false, captures: [], error: error.message };
  }
});

ipcMain.handle('open-captures-folder', () => {
  try {
    if (watchedFolder) {
      shell.openPath(watchedFolder);
      return { success: true };
    }
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-capture-path', (event, filename) => {
  try {
    if (watchedFolder) {
      const filepath = path.join(watchedFolder, filename);
      if (fs.existsSync(filepath)) {
        return { success: true, path: filepath };
      }
      return { success: false, error: 'File not found' };
    }
    return { success: false, error: 'No watched folder' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-capture', async (event, filename) => {
  try {
    if (!watchedFolder) {
      return { success: false, error: 'No watched folder' };
    }

    const filepath = path.join(watchedFolder, filename);

    if (!fs.existsSync(filepath)) {
      return { success: false, error: 'File not found' };
    }

    // Delete the file
    fs.unlinkSync(filepath);

    // Also remove from upload records and server
    const relativePath = path.relative(watchedFolder, filepath);
    await deleteFile(relativePath).catch(err => {
      console.warn('Failed to delete from server:', err);
    });
    removeUploadRecord(relativePath);

    console.log(`[Delete] Capture deleted: ${filename}`);

    return { success: true };
  } catch (error) {
    console.error('[Delete] Error deleting capture:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('quit-app', () => {
  app.isQuitting = true;
  app.quit();
  return { success: true };
});

// Trigger recording from overlay
ipcMain.handle('trigger-recording', () => {
  console.log('[IPC] trigger-recording called from overlay');
  if (mainWindow) {
    console.log('[IPC] Sending trigger-recording-from-overlay to main window');
    mainWindow.webContents.send('trigger-recording-from-overlay');
  } else {
    console.log('[IPC] No main window available');
  }
  return { success: true };
});

// Handle mouse events for overlay
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  if (overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

// Handle deep link for auth callback
async function handleDeepLink(url) {
  console.log('[Auth] Received deep link:', url);
  
  if (url.startsWith('quelotech://auth-callback')) {
    const success = await authService.handleAuthCallback(url);
    
    if (success && mainWindow) {
      // Notify the renderer that auth succeeded
      mainWindow.webContents.send('auth-status-changed', { authenticated: true });
    }
  }
}

app.whenReady().then(async () => {
  // Register custom protocol for OAuth callback
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('quelotech', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('quelotech');
  }

  // Load saved settings first
  const savedFolder = await loadSettings();

  // Load upload records
  loadUploadRecords();

  // Load failed uploads
  loadFailedUploads();

  // Connect session getter to upload service
  uploadService.setSessionIdGetter(getSessionId);

  // Configure capture service
  if (settings.apiBaseUrl) {
    captureService.setApiBaseUrl(settings.apiBaseUrl);
  }
  
  // Connect session getter to capture service
  captureService.setSessionIdGetter(getSessionId);

  // Initialize audio recording service
  console.log('[INIT] Initializing AudioRecordingService with path:', capturesPath);
  audioRecordingService = new AudioRecordingService(capturesPath, settings.apiBaseUrl);
  console.log('[INIT] AudioRecordingService initialized:', !!audioRecordingService);
  
  // Connect session getter to audio recording service
  audioRecordingService.setSessionIdGetter(getSessionId);
  
  // Clean up any stale recordings from previous sessions
  await audioRecordingService.cleanupStaleRecordings();
  console.log('[INIT] Stale recordings cleanup completed');

  // Always enable auto-start on first run or if setting is enabled
  if (settings.autoStart) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: process.execPath,
      args: ['--hidden']
    });
    console.log('[App Start] Auto-start enabled - will launch on Windows startup');
  }

  // Check if app was launched with --hidden flag or system startup
  const startHidden = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;

  createWindow();

  // Temporarily show window for debugging
  // Always start hidden - user can open via tray
  // mainWindow.hide();
  mainWindow.show(); // DEBUG: Show window to see console
  console.log('[App Start] Running in visible mode (DEBUG)');

  createTray();

  // Ensure default folder exists
  const defaultFolder = 'C:\\testing';
  if (!fs.existsSync(defaultFolder)) {
    console.log(`[App Start] Creating default folder: ${defaultFolder}`);
    fs.mkdirSync(defaultFolder, { recursive: true });
  }

  // Sync upload records from server if authenticated - BEFORE starting watcher
  if (settings.bearerToken) {
    console.log('[App Start] User is authenticated, syncing upload records from server...');
    await syncUploadRecordsFromServer().catch(err => {
      console.warn('[App Start] Failed to sync upload records from server:', err.message);
    });
  }

  // Auto-start watching if folder was previously selected or use default
  const folderToWatch = (savedFolder && fs.existsSync(savedFolder)) ? savedFolder : defaultFolder;

  if (folderToWatch) {
    console.log(`[App Start] Starting to watch: ${folderToWatch}`);
    startWatching(folderToWatch);
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('folder-selected', folderToWatch);
    });
  }

  // Auto-open overlay on startup
  setTimeout(() => {
    createOverlayWindow();
    console.log('[App Start] Screenshot overlay opened automatically');
  }, 1000);
});

app.on('window-all-closed', () => {
  if (watcher) watcher.close();
  // On macOS, keep the app running in the tray even when windows are closed
  if (process.platform !== 'darwin') {
    // On Windows/Linux, the app stays in the tray
    // Only quit if user explicitly quits from tray menu
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Handle custom protocol on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('myapp://')) {
    console.log('Protocol URL received:', url);
  }
});

// Audio Recording IPC Handlers
ipcMain.handle('recording-start', async (event, { recordingId, title, mimeType }) => {
  console.log('[IPC] recording-start called:', { recordingId, title, mimeType });
  try {
    if (!audioRecordingService) {
      console.error('[IPC] Audio recording service not initialized!');
      throw new Error('Audio recording service not initialized');
    }
    
    const metadata = await audioRecordingService.startRecording(recordingId, { title, mimeType });
    console.log('[IPC] recording-start success');
    return { 
      success: true, 
      recordingId: metadata.recordingId,
      metadata 
    };
  } catch (error) {
    console.error('[IPC] Error starting recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('recording-stop', async (event, { recordingId, totalDuration }) => {
  console.log('[IPC] recording-stop called:', { recordingId, totalDuration });
  try {
    if (!audioRecordingService) {
      console.error('[IPC] Audio recording service not initialized!');
      throw new Error('Audio recording service not initialized');
    }
    
    const result = await audioRecordingService.stopRecording(recordingId, totalDuration);
    console.log('[IPC] recording-stop result:', result);
    return result;
  } catch (error) {
    console.error('[IPC] Error stopping recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('recording-cancel', async (event, { recordingId }) => {
  try {
    if (!audioRecordingService) {
      throw new Error('Audio recording service not initialized');
    }
    
    const result = await audioRecordingService.cancelRecording(recordingId);
    return result;
  } catch (error) {
    console.error('Error cancelling recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('recording-save-chunk', async (event, { recordingId, chunk, chunkNumber }) => {
  console.log('[IPC] recording-save-chunk called:', { recordingId, chunkNumber, size: chunk?.length || 0 });
  try {
    if (!audioRecordingService) {
      console.error('[IPC] Audio recording service not initialized!');
      throw new Error('Audio recording service not initialized');
    }
    
    const result = await audioRecordingService.saveChunk(recordingId, Buffer.from(chunk), chunkNumber);
    return result;
  } catch (error) {
    console.error('[IPC] Error saving recording chunk:', error);
    return { success: false, error: error.message };
  }
});

// Legacy handler for backward compatibility
ipcMain.handle('recording-save-final', async (event, { audioData, timestamp }) => {
  try {
    const filename = `recording_${new Date(timestamp).toISOString().replace(/[:.]/g, '-')}.webm`;
    const filepath = path.join(capturesPath, filename);
    await fs_path.writeFile(filepath, Buffer.from(audioData));

    console.log(`[Recording] Saved: ${filename}`);
    return { success: true, filename, filepath };
  } catch (error) {
    console.error('Error saving final recording:', error);
    return { success: false, error: error.message };
  }
});

// Captures IPC Handlers
ipcMain.handle('captures-get-all', async () => {
  try {
    // Fetch captures (screenshots) from backend
    const backendResult = await captureService.getAllCaptures({
      limit: 100,
      sortBy: 'createdAt',
      order: 'desc'
    });

    let backendCaptures = [];
    if (backendResult.success && backendResult.captures) {
      backendCaptures = backendResult.captures.map(capture => ({
        captureId: capture._id || capture.captureId,
        name: capture.fileName,
        path: null, // No local path for backend captures
        type: capture.fileType?.startsWith('audio') ? 'audio' : 'screenshot',
        size: capture.fileSize,
        timestamp: new Date(capture.createdAt),
        url: capture.url,
        source: 'backend',
        tags: capture.tags || []
      }));
    }

    // Fetch recordings from backend
    const recordingsResult = await audioRecordingService.fetchRecordingsFromBackend();

    let backendRecordings = [];
    if (recordingsResult.success && recordingsResult.recordings) {
      backendRecordings = recordingsResult.recordings.map(recording => ({
        captureId: recording.recordingId,
        name: recording.title || `Recording ${new Date(recording.createdAt).toLocaleString()}`,
        path: null, // No local path for backend recordings
        type: 'audio',
        size: recording.finalFileSize || 0,
        timestamp: new Date(recording.createdAt || recording.sessionStarted),
        url: recording.downloadUrl,
        source: 'backend',
        duration: recording.totalDuration,
        totalChunks: recording.totalChunks,
        status: recording.status
      }));
    }

    // Get local failed uploads
    const localCaptures = [];
    for (const failed of failedUploads) {
      try {
        if (fs.existsSync(failed.path)) {
          const stats = await fs_path.stat(failed.path);
          const ext = path.extname(failed.name).toLowerCase();
          const type = ['.webm', '.mp3', '.wav', '.m4a'].includes(ext) ? 'audio' : 'screenshot';

          localCaptures.push({
            name: failed.name,
            path: failed.path,
            type: type,
            size: stats.size,
            timestamp: new Date(failed.createdAt || stats.mtime),
            source: 'local',
            uploadError: failed.error,
            retryCount: failed.retryCount,
            lastAttempt: new Date(failed.lastAttempt)
          });
        } else {
          // File no longer exists, remove from failed uploads
          removeFailedUpload(failed.path);
        }
      } catch (error) {
        console.error(`Error processing failed upload ${failed.path}:`, error);
      }
    }

    // Combine backend captures, backend recordings, and local captures, sorted by timestamp
    const allCaptures = [...backendCaptures, ...backendRecordings, ...localCaptures];
    allCaptures.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`[Captures] Returning ${backendCaptures.length} backend captures + ${backendRecordings.length} backend recordings + ${localCaptures.length} local captures`);

    return allCaptures;
  } catch (error) {
    console.error('Error getting captures:', error);
    // Return only local captures if backend fails
    const localCaptures = [];
    for (const failed of failedUploads) {
      try {
        if (fs.existsSync(failed.path)) {
          const stats = await fs_path.stat(failed.path);
          const ext = path.extname(failed.name).toLowerCase();
          const type = ['.webm', '.mp3', '.wav', '.m4a'].includes(ext) ? 'audio' : 'screenshot';

          localCaptures.push({
            name: failed.name,
            path: failed.path,
            type: type,
            size: stats.size,
            timestamp: new Date(failed.createdAt || stats.mtime),
            source: 'local',
            uploadError: failed.error,
            retryCount: failed.retryCount
          });
        }
      } catch (err) {
        console.error(`Error processing failed upload:`, err);
      }
    }
    return localCaptures;
  }
});

ipcMain.handle('captures-delete', async (event, captureItems) => {
  try {
    const results = { backend: 0, local: 0, errors: [] };

    for (const item of captureItems) {
      try {
        if (item.source === 'backend' && item.captureId) {
          // Delete from backend
          const deleteResult = await captureService.deleteCapture(item.captureId);
          if (deleteResult.success) {
            results.backend++;
          } else {
            results.errors.push(`Backend: ${item.name} - ${deleteResult.error}`);
          }
        } else if (item.source === 'local' && item.path) {
          // Delete local file
          if (item.path.startsWith(capturesPath) && fs.existsSync(item.path)) {
            await fs_path.unlink(item.path);
            removeFailedUpload(item.path);
            results.local++;
          }
        }
      } catch (error) {
        console.error(`Error deleting capture ${item.name}:`, error);
        results.errors.push(`${item.name} - ${error.message}`);
      }
    }

    console.log(`[Captures] Deleted ${results.backend} backend + ${results.local} local captures`);

    return {
      success: results.errors.length === 0,
      backend: results.backend,
      local: results.local,
      errors: results.errors
    };
  } catch (error) {
    console.error('Error deleting captures:', error);
    return { success: false, error: error.message };
  }
});

// Retry upload for failed captures
ipcMain.handle('captures-retry-upload', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      removeFailedUpload(filePath);
      return { success: false, error: 'File no longer exists' };
    }

    console.log(`[Captures] Retrying upload: ${filePath}`);

    const uploadResult = await captureService.uploadCapture(filePath);

    if (uploadResult.success) {
      console.log(`[Captures] Retry successful: ${uploadResult.captureId}`);
      // Delete local file after successful upload
      try {
        await fs_path.unlink(filePath);
        removeFailedUpload(filePath);
        console.log(`[Captures] Deleted local file after retry: ${filePath}`);
      } catch (unlinkError) {
        console.error(`[Captures] Error deleting file after retry:`, unlinkError);
      }

      return {
        success: true,
        captureId: uploadResult.captureId,
        url: uploadResult.url
      };
    } else {
      // Update failed upload record
      const fileName = path.basename(filePath);
      addFailedUpload(filePath, fileName, uploadResult.error);

      return {
        success: false,
        error: uploadResult.error
      };
    }
  } catch (error) {
    console.error('[Captures] Retry error:', error);
    const fileName = path.basename(filePath);
    addFailedUpload(filePath, fileName, error.message);

    return {
      success: false,
      error: error.message
    };
  }
});

// Retry all failed uploads
ipcMain.handle('captures-retry-all', async () => {
  try {
    const results = { success: 0, failed: 0, errors: [] };
    const failedCopy = [...failedUploads]; // Copy array since we'll modify it

    for (const failed of failedCopy) {
      try {
        if (!fs.existsSync(failed.path)) {
          removeFailedUpload(failed.path);
          continue;
        }

        const uploadResult = await captureService.uploadCapture(failed.path);

        if (uploadResult.success) {
          await fs_path.unlink(failed.path);
          removeFailedUpload(failed.path);
          results.success++;
        } else {
          addFailedUpload(failed.path, failed.name, uploadResult.error);
          results.failed++;
          results.errors.push(`${failed.name}: ${uploadResult.error}`);
        }
      } catch (error) {
        console.error(`Error retrying ${failed.name}:`, error);
        addFailedUpload(failed.path, failed.name, error.message);
        results.failed++;
        results.errors.push(`${failed.name}: ${error.message}`);
      }
    }

    console.log(`[Captures] Retry all: ${results.success} succeeded, ${results.failed} failed`);

    return {
      success: true,
      uploaded: results.success,
      failed: results.failed,
      errors: results.errors
    };
  } catch (error) {
    console.error('[Captures] Retry all error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('captures-save-as-notes', async (event, capturePaths) => {
  try {
    if (!watchedFolder) {
      return { success: false, error: 'No watched folder configured' };
    }

    const API_BASE = settings.apiBaseUrl || config.API.BASE_URL;

    // Separate screenshots and audio files
    const screenshots = [];
    const audioFiles = [];

    for (const capturePath of capturePaths) {
      const fileName = path.basename(capturePath);
      const ext = path.extname(fileName).toLowerCase();
      const isAudio = ['.webm', '.mp3', '.wav', '.m4a'].includes(ext);

      if (isAudio) {
        audioFiles.push(capturePath);
      } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
        screenshots.push(capturePath);
      }
    }

    let saved = 0;

    // Handle audio files - copy directly to watch folder
    for (const audioPath of audioFiles) {
      const fileName = path.basename(audioPath);
      const destPath = path.join(watchedFolder, fileName);
      await fs_path.copyFile(audioPath, destPath);
      console.log(`[Captures] Audio file saved to watch folder: ${fileName}`);
      saved++;
    }

    // Handle screenshots - convert multiple images to single PDF using API
    if (screenshots.length > 0) {
      try {
        // Get auth token
        const token = await authService.getToken();
        if (!token) {
          console.error('[Captures] No authentication token available');
          return { success: false, error: 'Authentication required. Please login first.' };
        }

        // Create FormData for multipart upload
        const FormData = require('form-data');
        const formData = new FormData();

        // Add all screenshot files to form data
        for (const screenshotPath of screenshots) {
          const fileName = path.basename(screenshotPath);
          const fileBuffer = await fs_path.readFile(screenshotPath);
          formData.append('images', fileBuffer, {
            filename: fileName,
            contentType: `image/${path.extname(fileName).substring(1)}`
          });
        }

        // Add metadata
        formData.append('combineIntoPdf', 'true');
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        formData.append('outputFileName', `captures_${timestamp}.pdf`);

        console.log(`[Captures] Converting ${screenshots.length} screenshot(s) to PDF via API...`);

        const fetch = require('node-fetch');
        const response = await fetch(`${API_BASE}/api/captures/convert-to-pdf`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            ...formData.getHeaders()
          },
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success || !result.pdfUrl) {
          throw new Error(result.error || 'Failed to convert images to PDF');
        }

        // Download the PDF from the URL and save to watch folder
        const pdfResponse = await fetch(result.pdfUrl);
        if (!pdfResponse.ok) {
          throw new Error('Failed to download converted PDF');
        }

        const pdfBuffer = await pdfResponse.buffer();
        const pdfName = result.fileName || `captures_${timestamp}.pdf`;
        const destPath = path.join(watchedFolder, pdfName);

        await fs_path.writeFile(destPath, pdfBuffer);
        console.log(`[Captures] ${screenshots.length} screenshot(s) converted to single PDF: ${pdfName} (${result.size || pdfBuffer.length} bytes)`);
        saved++;
      } catch (pdfError) {
        console.error(`[Captures] Error converting screenshots to PDF:`, pdfError);
        return { success: false, error: `PDF conversion failed: ${pdfError.message}` };
      }
    }

    return { success: true, saved };
  } catch (error) {
    console.error('Error saving captures as notes:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('captures-get-path', () => {
  return capturesPath;
});