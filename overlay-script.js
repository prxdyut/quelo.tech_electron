const widget = document.getElementById('widget');
const menuButton = document.getElementById('menuButton');
const tooltip = document.getElementById('tooltip');
const status = document.getElementById('status');
const contextMenu = document.getElementById('contextMenu');

let longPressTimer = null;
const LONG_PRESS_DURATION = 500; // milliseconds
let isSyncing = true;
let clickCount = 0;
let clickTimer = null;
const DOUBLE_CLICK_DELAY = 300; // milliseconds
let isRecordingFromOverlay = false;

// Recording state
let mediaRecorder = null;
let audioStream = null;
let recordingId = null;
let chunkNumber = 0;
let recordingStartTime = 0;

// Generate unique recording ID
function generateRecordingId() {
  return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Show status message
function showStatus(message, duration = 2000) {
  status.textContent = message;
  status.classList.add('show');
  setTimeout(() => {
    status.classList.remove('show');
  }, duration);
}

// Show context menu
function showContextMenu(x, y) {
  const menuWidth = 220;
  const menuRect = contextMenu.getBoundingClientRect();
  const menuHeight = menuRect.height || 280; // Approximate height for 6 menu items
  
  // Position menu to the left of the widget
  let left = x - menuWidth - 20;
  let top = y - menuHeight / 2;
  
  // Keep menu on screen
  if (left < 10) left = x + 20;
  if (top < 10) top = 10;
  if (top + menuHeight > window.innerHeight - 10) {
    top = window.innerHeight - menuHeight - 10;
  }
  
  contextMenu.style.left = `${left}px`;
  contextMenu.style.top = `${top}px`;
  contextMenu.classList.add('show');
}

// Hide context menu
function hideContextMenu() {
  contextMenu.classList.remove('show');
}

// Take screenshot
async function captureScreen() {
  try {
    widget.classList.add('capturing');
    showStatus('📸 Capturing screen...', 1000);
    
    const result = await window.overlayAPI.takeScreenshot();
    
    if (result.success) {
      showStatus(`✅ Screenshot saved: ${result.filename}`, 3000);
    } else {
      showStatus(`❌ Error: ${result.error}`, 3000);
    }
    
    setTimeout(() => {
      widget.classList.remove('capturing');
    }, 400);
  } catch (error) {
    console.error('Screenshot error:', error);
    showStatus(`❌ Error: ${error.message}`, 3000);
    widget.classList.remove('capturing');
  }
}

// Handle menu actions
async function handleMenuAction(action) {
  console.log('[Overlay] handleMenuAction called with action:', action);
  hideContextMenu();
  
  switch (action) {
    case 'capture':
      await captureScreen();
      break;
      
    case 'startRecording':
      console.log('[Overlay] startRecording clicked, current state:', isRecordingFromOverlay);
      if (!isRecordingFromOverlay) {
        await startRecording();
      } else {
        await stopRecording();
      }
      break;
      
    case 'openApp':
      const openResult = await window.overlayAPI.openMainWindow();
      if (openResult.success) {
        showStatus('✅ App opened', 1500);
      }
      break;
      
    case 'openQuelo':
      await window.overlayAPI.openExternal('https://quelo.tech');
      showStatus('🌐 Opening Quelo.Tech...', 1500);
      break;
      
    case 'syncStatus':
      const syncResult = await window.overlayAPI.toggleSync();
      if (syncResult.success) {
        isSyncing = syncResult.isSyncing;
        document.getElementById('syncToggleText').textContent = 
          isSyncing ? 'Stop Syncing' : 'Start Syncing';
        showStatus(isSyncing ? '✅ Syncing started' : '⏸️ Syncing stopped', 2000);
      }
      break;
      
    case 'newSession':
      await window.overlayAPI.openSessionOverlay();
      hideContextMenu();
      showStatus('📚 Opening session selector...', 2000);
      break;
      
    case 'settings':
      // Open main window for settings
      await window.overlayAPI.openMainWindow();
      break;
      
    case 'close':
      showModal(
        'Close Overlay',
        'Are you sure you want to close the screenshot overlay?',
        'Close',
        async () => {
          await window.overlayAPI.closeOverlay();
        }
      );
      break;
      
    case 'quit':
      showModal(
        'Quit Application',
        'Are you sure you want to quit the application? All syncing will stop.',
        'Quit',
        async () => {
          await window.overlayAPI.quitApp();
        }
      );
      break;
  }
}

// Widget hover - show tooltip
widget.addEventListener('mouseenter', () => {
  window.overlayAPI.setIgnoreMouseEvents(false);
  tooltip.classList.add('show');
});

widget.addEventListener('mouseleave', () => {
  window.overlayAPI.setIgnoreMouseEvents(true);
  tooltip.classList.remove('show');
});

// Widget click - capture screen (single click) or show menu (double click)
widget.addEventListener('click', (e) => {
  // Ignore clicks on menu button
  if (e.target === menuButton) {
    return;
  }
  
  // Don't process click if it was a long press
  if (!longPressTimer) {
    clickCount++;
    
    if (clickCount === 1) {
      clickTimer = setTimeout(() => {
        // Single click - capture screen
        captureScreen();
        clickCount = 0;
      }, DOUBLE_CLICK_DELAY);
    } else if (clickCount === 2) {
      // Double click - show menu
      clearTimeout(clickTimer);
      clickCount = 0;
      const rect = widget.getBoundingClientRect();
      showContextMenu(rect.left, rect.top + rect.height / 2);
    }
  }
});

// Menu button click - show context menu
menuButton.addEventListener('click', (e) => {
  e.stopPropagation();
  const rect = widget.getBoundingClientRect();
  showContextMenu(rect.left, rect.top + rect.height / 2);
});

// Widget long press - show context menu
widget.addEventListener('mousedown', (e) => {
  // Ignore long press on menu button
  if (e.target === menuButton) {
    return;
  }
  
  widget.classList.add('long-pressing');
  longPressTimer = setTimeout(() => {
    const rect = widget.getBoundingClientRect();
    showContextMenu(rect.left, rect.top + rect.height / 2);
    longPressTimer = null;
    widget.classList.remove('long-pressing');
    // Cancel any pending click
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      clickCount = 0;
    }
  }, LONG_PRESS_DURATION);
});

widget.addEventListener('mouseup', () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  widget.classList.remove('long-pressing');
});

widget.addEventListener('mouseleave', () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  widget.classList.remove('long-pressing');
});

// Context menu items
contextMenu.addEventListener('mouseenter', () => {
  window.overlayAPI.setIgnoreMouseEvents(false);
});

contextMenu.addEventListener('mouseleave', () => {
  window.overlayAPI.setIgnoreMouseEvents(true);
  // Close menu when mouse leaves
  setTimeout(() => {
    if (!contextMenu.matches(':hover')) {
      hideContextMenu();
    }
  }, 100);
});

// Menu button mouse events
menuButton.addEventListener('mouseenter', () => {
  window.overlayAPI.setIgnoreMouseEvents(false);
});

menuButton.addEventListener('mouseleave', () => {
  window.overlayAPI.setIgnoreMouseEvents(true);
});

document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', () => {
    const action = item.getAttribute('data-action');
    handleMenuAction(action);
  });
});

// Close context menu when clicking outside
document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target) && e.target !== widget) {
    hideContextMenu();
  }
});

// Modal interactions
modal.addEventListener('mouseenter', () => {
  window.overlayAPI.setIgnoreMouseEvents(false);
});

modal.addEventListener('mouseleave', () => {
  window.overlayAPI.setIgnoreMouseEvents(true);
});

// Initialize sync status
(async () => {
  const syncStatus = await window.overlayAPI.getSyncStatus();
  if (syncStatus.success) {
    isSyncing = syncStatus.isSyncing;
    document.getElementById('syncToggleText').textContent = 
      isSyncing ? 'Stop Syncing' : 'Start Syncing';
  }
})();

// Recording functions
async function startRecording() {
  try {
    console.log('[Overlay] 🎙️ Starting recording...');
    
    // Generate recording ID
    recordingId = generateRecordingId();
    chunkNumber = 0;
    recordingStartTime = Date.now();
    
    console.log('[Overlay] Recording ID:', recordingId);
    
    // Initialize recording session in backend
    const initResult = await window.overlayAPI.recording.start(
      recordingId,
      `Recording ${new Date().toLocaleString()}`,
      'audio/webm;codecs=opus'
    );
    
    console.log('[Overlay] Backend init result:', initResult);
    
    if (!initResult.success) {
      throw new Error(initResult.error || 'Failed to initialize recording');
    }
    
    // Get audio stream
    console.log('[Overlay] Requesting microphone access...');
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
    });
    
    console.log('[Overlay] Got audio stream');
    
    // Create MediaRecorder
    const mimeType = 'audio/webm;codecs=opus';
    mediaRecorder = new MediaRecorder(audioStream, {
      mimeType,
      audioBitsPerSecond: 128000,
    });
    
    console.log('[Overlay] MediaRecorder created, state:', mediaRecorder.state);
    
    // Handle errors
    mediaRecorder.onerror = (event) => {
      console.error('[Overlay] MediaRecorder error:', event);
      console.error('[Overlay] Error details:', event.error);
    };
    
    // Handle start
    mediaRecorder.onstart = () => {
      console.log('[Overlay] MediaRecorder onstart fired');
    };
    
    // Handle pause
    mediaRecorder.onpause = () => {
      console.log('[Overlay] MediaRecorder onpause fired');
    };
    
    // Handle resume
    mediaRecorder.onresume = () => {
      console.log('[Overlay] MediaRecorder onresume fired');
    };
    
    // Handle data available
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        console.log('[Overlay] Chunk available, size:', event.data.size);
        const arrayBuffer = await event.data.arrayBuffer();
        const currentChunk = chunkNumber;
        
        const saveResult = await window.overlayAPI.recording.saveChunk(
          recordingId,
          arrayBuffer,
          currentChunk
        );
        
        console.log('[Overlay] Chunk save result:', saveResult);
        
        if (saveResult.success) {
          chunkNumber++;
          console.log(`[Overlay] ✅ Chunk ${currentChunk} saved successfully`);
        } else {
          console.error(`[Overlay] ❌ Failed to save chunk ${currentChunk}:`, saveResult.error);
          showStatus(`⚠️ Chunk ${currentChunk} failed to save`, 2000);
          // Continue recording despite chunk failure
        }
      }
    };
    
    // Handle stop
    mediaRecorder.onstop = async () => {
      console.log('[Overlay] MediaRecorder stopped, recordingId:', recordingId);
      const totalDuration = (Date.now() - recordingStartTime) / 1000;
      const currentRecordingId = recordingId; // Capture before nulling
      
      const stopResult = await window.overlayAPI.recording.stop(currentRecordingId, totalDuration);
      console.log('[Overlay] Stop result:', stopResult);
      
      if (stopResult.success) {
        showStatus(`✅ Saved: ${stopResult.fileName}`, 3000);
      } else {
        showStatus(`❌ Error: ${stopResult.error}`, 3000);
      }
      
      // Cleanup
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }
      mediaRecorder = null;
      recordingId = null;
    };
    
    // Start recording with 5-second chunks
    mediaRecorder.start(5000);
    console.log('[Overlay] MediaRecorder started, state:', mediaRecorder.state);
    
    // Check if it's actually recording
    setTimeout(() => {
      console.log('[Overlay] MediaRecorder state after 100ms:', mediaRecorder?.state);
    }, 100);
    
    // Update UI
    isRecordingFromOverlay = true;
    try {
      document.getElementById('recordingMenuText').textContent = 'Stop Recording';
      const iconElement = document.querySelector('[data-action="startRecording"] .icon i');
      if (iconElement) {
        iconElement.setAttribute('data-lucide', 'square');
        lucide.createIcons();
      }
    } catch (uiError) {
      console.warn('[Overlay] UI update failed:', uiError);
    }
    showStatus('🎙️ Recording started...', 2000);
    
    console.log('[Overlay] ✅ Recording started successfully');
  } catch (error) {
    console.error('[Overlay] ❌ Recording start error:', error);
    console.error('[Overlay] Error name:', error.name);
    console.error('[Overlay] Error message:', error.message);
    console.error('[Overlay] Error stack:', error.stack);
    showStatus(`❌ Error: ${error.message}`, 3000);
    
    // Cleanup on error
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      audioStream = null;
    }
    if (recordingId) {
      console.log('[Overlay] Cancelling recording:', recordingId);
      await window.overlayAPI.recording.cancel(recordingId);
      recordingId = null;
    }
    isRecordingFromOverlay = false;
  }
}

async function stopRecording() {
  try {
    console.log('[Overlay] 🛑 stopRecording called');
    console.log('[Overlay] mediaRecorder:', mediaRecorder);
    console.log('[Overlay] mediaRecorder state:', mediaRecorder?.state);
    console.log('[Overlay] recordingId:', recordingId);
    
    if (!mediaRecorder) {
      console.log('[Overlay] No mediaRecorder, aborting stop');
      return;
    }
    
    if (mediaRecorder.state === 'inactive') {
      console.log('[Overlay] MediaRecorder already inactive, aborting stop');
      return;
    }
    
    console.log('[Overlay] Actually stopping MediaRecorder...');
    mediaRecorder.stop();
    
    // Update UI
    isRecordingFromOverlay = false;
    try {
      document.getElementById('recordingMenuText').textContent = 'Start Recording';
      const iconElement = document.querySelector('[data-action="startRecording"] .icon i');
      if (iconElement) {
        iconElement.setAttribute('data-lucide', 'mic');
        lucide.createIcons();
      }
    } catch (uiError) {
      console.warn('[Overlay] UI update failed:', uiError);
    }
    showStatus('⏹️ Stopping...', 2000);
    
    console.log('[Overlay] ✅ Recording stop initiated');
  } catch (error) {
    console.error('[Overlay] ❌ Recording stop error:', error);
    showStatus(`❌ Error: ${error.message}`, 3000);
  }
}
