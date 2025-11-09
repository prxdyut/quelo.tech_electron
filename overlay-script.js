const widget = document.getElementById('widget');
const menuButton = document.getElementById('menuButton');
const tooltip = document.getElementById('tooltip');
const status = document.getElementById('status');
const contextMenu = document.getElementById('contextMenu');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalCancel = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');

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

// Show modal
function showModal(title, body, confirmText = 'Confirm', onConfirm = null) {
  modalTitle.textContent = title;
  modalBody.innerHTML = body;
  modalConfirm.textContent = confirmText;
  modal.classList.add('show');
  
  modalConfirm.onclick = () => {
    if (onConfirm) onConfirm();
    closeModal();
  };
}

// Close modal
function closeModal() {
  modal.classList.remove('show');
}

// Close modal on background click
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    closeModal();
  }
});

modalCancel.addEventListener('click', closeModal);

// Show context menu
function showContextMenu(x, y) {
  const menuWidth = 220;
  const menuHeight = 520; // Updated for new menu items (was 400)
  
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
      await showNewSessionModal();
      break;
      
    case 'settings':
      await showSettingsModal();
      break;
      
    case 'captures':
      await showCapturesCarousel();
      break;
      
    case 'saveNotes':
      showModal(
        'Save Notes',
        'Open the main app to review and save your captures as notes.',
        'Open App',
        async () => {
          await window.overlayAPI.openMainWindow();
        }
      );
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

// Show captures carousel
let currentCarouselIndex = 0;
let carouselCaptures = [];

async function showCapturesCarousel() {
  const capturesResult = await window.overlayAPI.getRecentCaptures();
  
  if (!capturesResult.success || !capturesResult.captures || capturesResult.captures.length === 0) {
    showModal(
      'Recent Captures',
      '<p style="color: #999; text-align: center; padding: 20px;">No screenshots found</p>',
      'Close',
      null
    );
    return;
  }
  
  carouselCaptures = capturesResult.captures;
  currentCarouselIndex = 0;
  
  const carouselHTML = `
    <div class="carousel-container">
      <img id="carouselImage" class="carousel-image" src="" alt="Screenshot">
      <button class="carousel-nav prev" id="carouselPrev">‹</button>
      <button class="carousel-nav next" id="carouselNext">›</button>
      <div class="carousel-info" id="carouselInfo">1 / ${carouselCaptures.length}</div>
      <button class="carousel-delete" id="carouselDelete" title="Delete this screenshot">🗑️</button>
    </div>
    <div class="carousel-filename" id="carouselFilename"></div>
  `;
  
  modalTitle.textContent = 'Recent Captures';
  modalBody.innerHTML = carouselHTML;
  modalConfirm.textContent = 'Open Folder';
  modal.classList.add('show');
  
  // Load first image
  updateCarouselImage();
  
  // Set up navigation
  document.getElementById('carouselPrev').onclick = () => {
    if (currentCarouselIndex > 0) {
      currentCarouselIndex--;
      updateCarouselImage();
    }
  };
  
  document.getElementById('carouselNext').onclick = () => {
    if (currentCarouselIndex < carouselCaptures.length - 1) {
      currentCarouselIndex++;
      updateCarouselImage();
    }
  };
  
  document.getElementById('carouselDelete').onclick = async () => {
    const filename = carouselCaptures[currentCarouselIndex];
    const confirmDelete = confirm(`Delete ${filename}?`);
    
    if (confirmDelete) {
      const result = await window.overlayAPI.deleteCapture(filename);
      if (result.success) {
        carouselCaptures.splice(currentCarouselIndex, 1);
        
        if (carouselCaptures.length === 0) {
          closeModal();
          showStatus('All captures deleted', 2000);
        } else {
          if (currentCarouselIndex >= carouselCaptures.length) {
            currentCarouselIndex = carouselCaptures.length - 1;
          }
          updateCarouselImage();
        }
      } else {
        alert('Failed to delete: ' + (result.error || 'Unknown error'));
      }
    }
  };
  
  modalConfirm.onclick = () => {
    window.overlayAPI.openCapturesFolder();
    closeModal();
  };
}

function updateCarouselImage() {
  const filename = carouselCaptures[currentCarouselIndex];
  const imgElement = document.getElementById('carouselImage');
  const infoElement = document.getElementById('carouselInfo');
  const filenameElement = document.getElementById('carouselFilename');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');
  
  // Get image path from overlay API
  window.overlayAPI.getCapturePath(filename).then(result => {
    if (result.success) {
      imgElement.src = 'file:///' + result.path.replace(/\\/g, '/');
    }
  });
  
  infoElement.textContent = `${currentCarouselIndex + 1} / ${carouselCaptures.length}`;
  filenameElement.textContent = filename;
  
  prevBtn.disabled = currentCarouselIndex === 0;
  nextBtn.disabled = currentCarouselIndex === carouselCaptures.length - 1;
}

// Show Settings Modal with detailed information
async function showSettingsModal() {
  // Get session info
  const sessionInfo = await window.overlayAPI.session.getInfo();
  const syncStatus = await window.overlayAPI.getSyncStatus();
  
  const hasSession = sessionInfo.success && sessionInfo.sessionId;
  const sessionStartTime = hasSession && sessionInfo.sessionStartTime 
    ? new Date(sessionInfo.sessionStartTime) 
    : null;
  const sessionAgeMinutes = hasSession && sessionInfo.sessionAge 
    ? Math.floor(sessionInfo.sessionAge / 60000) 
    : 0;
  const sessionAgeHours = Math.floor(sessionAgeMinutes / 60);
  const sessionAgeRemainingMins = sessionAgeMinutes % 60;
  
  // Format session age
  let sessionAgeText = 'N/A';
  let sessionAgeClass = 'inactive';
  if (hasSession) {
    sessionAgeText = sessionAgeHours > 0 
      ? `${sessionAgeHours}h ${sessionAgeRemainingMins}m` 
      : `${sessionAgeRemainingMins}m`;
    
    // Determine status based on age (warning if > 1 hour)
    sessionAgeClass = sessionAgeMinutes > 60 ? 'warning' : 'active';
  }
  
  const settingsHTML = `
    <div class="settings-grid">
      <!-- Session Section -->
      <div class="settings-section">
        <div class="settings-section-title">
          <i data-lucide="clock" style="width: 18px; height: 18px;"></i>
          Session Information
        </div>
        ${hasSession ? `
          <div class="settings-row">
            <span class="settings-label">Session ID:</span>
            <span class="settings-value" style="font-size: 11px; font-family: monospace;">${sessionInfo.sessionId.slice(0, 20)}...</span>
          </div>
          ${sessionInfo.subject ? `
            <div class="settings-divider"></div>
            <div class="settings-row">
              <span class="settings-label">Subject:</span>
              <span class="settings-value">${sessionInfo.subject}</span>
            </div>
          ` : ''}
          ${sessionInfo.topic ? `
            <div class="settings-divider"></div>
            <div class="settings-row">
              <span class="settings-label">Topic:</span>
              <span class="settings-value">${sessionInfo.topic}</span>
            </div>
          ` : ''}
          ${sessionInfo.title ? `
            <div class="settings-divider"></div>
            <div class="settings-row">
              <span class="settings-label">Title:</span>
              <span class="settings-value">${sessionInfo.title}</span>
            </div>
          ` : ''}
          <div class="settings-divider"></div>
          <div class="settings-row">
            <span class="settings-label">Started:</span>
            <span class="settings-value">${sessionStartTime ? sessionStartTime.toLocaleString() : 'Unknown'}</span>
          </div>
          ${sessionInfo.endDateTime ? `
            <div class="settings-divider"></div>
            <div class="settings-row">
              <span class="settings-label">Ends:</span>
              <span class="settings-value">${new Date(sessionInfo.endDateTime).toLocaleString()}</span>
            </div>
          ` : ''}
          <div class="settings-divider"></div>
          <div class="settings-row">
            <span class="settings-label">Session Age:</span>
            <span class="settings-value">
              <span class="status-badge ${sessionAgeClass}">${sessionAgeText}</span>
            </span>
          </div>
          ${sessionInfo.status ? `
            <div class="settings-divider"></div>
            <div class="settings-row">
              <span class="settings-label">Status:</span>
              <span class="settings-value">
                <span class="status-badge ${sessionInfo.status === 'active' ? 'active' : 'inactive'}">${sessionInfo.status}</span>
              </span>
            </div>
          ` : ''}
          ${sessionInfo.isExpired ? `
            <div class="session-age-display">
              ⚠️ Session has expired - create a new session to continue
            </div>
          ` : ''}
        ` : `
          <div class="settings-row">
            <span class="settings-label" style="color: #991b1b;">No active session</span>
          </div>
        `}
      </div>
      
      <!-- Sync Status Section -->
      <div class="settings-section">
        <div class="settings-section-title">
          <i data-lucide="refresh-cw" style="width: 18px; height: 18px;"></i>
          Sync Status
        </div>
        <div class="settings-row">
          <span class="settings-label">File Syncing:</span>
          <span class="settings-value">
            <span class="status-badge ${isSyncing ? 'active' : 'inactive'}">
              ${isSyncing ? '✓ Active' : '✕ Stopped'}
            </span>
          </span>
        </div>
        ${syncStatus.success && syncStatus.syncedFiles !== undefined ? `
          <div class="settings-divider"></div>
          <div class="settings-row">
            <span class="settings-label">Files Synced:</span>
            <span class="settings-value">${syncStatus.syncedFiles} / ${syncStatus.totalFiles}</span>
          </div>
          ${syncStatus.failedFiles > 0 ? `
            <div class="settings-divider"></div>
            <div class="settings-row">
              <span class="settings-label">Failed:</span>
              <span class="settings-value" style="color: #991b1b;">${syncStatus.failedFiles}</span>
            </div>
          ` : ''}
          ${syncStatus.lastSync ? `
            <div class="settings-divider"></div>
            <div class="settings-row">
              <span class="settings-label">Last Sync:</span>
              <span class="settings-value" style="font-size: 12px;">${new Date(syncStatus.lastSync).toLocaleString()}</span>
            </div>
          ` : ''}
        ` : ''}
      </div>
      
      <!-- App Info Section -->
      <div class="settings-section">
        <div class="settings-section-title">
          <i data-lucide="info" style="width: 18px; height: 18px;"></i>
          Application
        </div>
        <div class="settings-row">
          <span class="settings-label">Auto-start:</span>
          <span class="settings-value">
            <span class="status-badge active">✓ Enabled</span>
          </span>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row">
          <span class="settings-label">Widget:</span>
          <span class="settings-value">
            <span class="status-badge active">✓ Active</span>
          </span>
        </div>
      </div>
    </div>
    
    <p style="color: #6b7280; font-size: 13px; margin-top: 16px; text-align: center;">
      Open the main app for full settings and configuration options.
    </p>
  `;
  
  modalTitle.textContent = 'Settings & Status';
  modalBody.innerHTML = settingsHTML;
  modalConfirm.textContent = 'Open App';
  modal.classList.add('show');
  
  // Re-initialize Lucide icons in the modal
  setTimeout(() => {
    lucide.createIcons();
  }, 50);
  
  modalConfirm.onclick = async () => {
    await window.overlayAPI.openMainWindow();
    closeModal();
  };
  
  modalCancel.onclick = () => {
    closeModal();
  };
}

// Show New Session Modal with time picker
async function showNewSessionModal() {
  // Get current session info
  const sessionInfo = await window.overlayAPI.session.getInfo();
  
  if (!sessionInfo.success) {
    showStatus('❌ Failed to get session info', 2000);
    return;
  }
  
  const now = new Date();
  const currentSessionStart = sessionInfo.sessionStartTime ? new Date(sessionInfo.sessionStartTime) : null;
  const sessionAgeMinutes = sessionInfo.sessionAge ? Math.floor(sessionInfo.sessionAge / 60000) : 0;
  
  // Default end time: current time
  const defaultEndTime = now.toTimeString().slice(0, 5); // HH:MM format
  
  const sessionHTML = `
    <div class="session-time-container">
      <div class="time-picker-group">
        <label class="time-picker-label">Subject (required):</label>
        <input type="text" id="sessionSubject" class="time-input" placeholder="e.g., Client Meeting, Project Work..." maxlength="100" required />
      </div>
      
      <div class="time-picker-group">
        <label class="time-picker-label">Topic (required):</label>
        <input type="text" id="sessionTopic" class="time-input" placeholder="e.g., Design Review, Code Refactor..." maxlength="100" required />
      </div>
      
      <div class="time-picker-group">
        <label class="time-picker-label">Title (optional):</label>
        <input type="text" id="sessionTitle" class="time-input" placeholder="Optional title for this session..." maxlength="100" />
      </div>
      
      <div class="time-picker-group">
        <label class="time-picker-label">Session End Time:</label>
        <input type="time" id="sessionEndTime" class="time-input" value="${defaultEndTime}" />
      </div>
      
      <div class="time-picker-group">
        <label class="time-picker-label">Quick Select (Hours from now):</label>
        <div class="quick-hours">
          <button class="hour-btn" data-hours="1">+1h</button>
          <button class="hour-btn" data-hours="2">+2h</button>
          <button class="hour-btn" data-hours="3">+3h</button>
          <button class="hour-btn" data-hours="4">+4h</button>
          <button class="hour-btn" data-hours="6">+6h</button>
          <button class="hour-btn" data-hours="8">+8h</button>
          <button class="hour-btn" data-hours="12">+12h</button>
          <button class="hour-btn" data-hours="24">+24h</button>
        </div>
      </div>
      
      <div class="session-info">
        <strong>Current Session:</strong>
        ${currentSessionStart ? `Started: ${currentSessionStart.toLocaleString()}<br>Age: ${Math.floor(sessionAgeMinutes / 60)}h ${sessionAgeMinutes % 60}m` : 'No active session'}
      </div>
    </div>
  `;
  
  modalTitle.textContent = 'Start New Session';
  modalBody.innerHTML = sessionHTML;
  modalConfirm.textContent = 'Create Session';
  modal.classList.add('show');
  
  // Add hour button handlers
  const hourBtns = document.querySelectorAll('.hour-btn');
  const timeInput = document.getElementById('sessionEndTime');
  
  hourBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove selected class from all buttons
      hourBtns.forEach(b => b.classList.remove('selected'));
      // Add selected class to clicked button
      btn.classList.add('selected');
      
      // Calculate end time
      const hours = parseInt(btn.getAttribute('data-hours'));
      const endTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
      timeInput.value = endTime.toTimeString().slice(0, 5);
    });
  });
  
  // Custom time input handler - clear selection when typing
  timeInput.addEventListener('input', () => {
    hourBtns.forEach(b => b.classList.remove('selected'));
  });
  
  modalConfirm.onclick = async () => {
    const endTime = timeInput.value;
    const subject = document.getElementById('sessionSubject').value.trim();
    const topic = document.getElementById('sessionTopic').value.trim();
    const title = document.getElementById('sessionTitle').value.trim();
    
    // Validate required fields
    if (!subject) {
      showStatus('❌ Subject is required', 2000);
      return;
    }
    
    if (!topic) {
      showStatus('❌ Topic is required', 2000);
      return;
    }
    
    if (!endTime) {
      showStatus('❌ Please select an end time', 2000);
      return;
    }
    
    // Parse the end time
    const [hours, minutes] = endTime.split(':').map(Number);
    const endDateTime = new Date();
    endDateTime.setHours(hours, minutes, 0, 0);
    
    // If end time is before now, assume it's for tomorrow
    if (endDateTime < now) {
      endDateTime.setDate(endDateTime.getDate() + 1);
    }
    
    // Build confirmation message
    let confirmMessage = `Create new session?\n\nSubject: ${subject}\nTopic: ${topic}`;
    if (title) confirmMessage += `\nTitle: ${title}`;
    confirmMessage += `\nEnd Time: ${endDateTime.toLocaleString()}\nDuration from now: ${Math.round((endDateTime - now) / 60000)} minutes`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    // Show loading status
    showStatus('Creating session...', 0);
    
    // Create session with backend (subject, topic, endDateTime, title)
    const result = await window.overlayAPI.session.reset(
      subject,
      topic,
      endDateTime.toISOString(),
      title || null
    );
    
    if (result.success) {
      closeModal();
      showStatus(`✅ Session created! ID: ${result.newSessionId?.slice(0, 12)}...`, 3000);
    } else {
      showStatus(`❌ Failed: ${result.error || 'Unknown error'}`, 3000);
    }
  };
  
  modalCancel.onclick = () => {
    closeModal();
  };
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
