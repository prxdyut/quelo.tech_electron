let sessions = [];
let isLoading = true;
let isCreating = false;
let showCreateForm = false;
let wizardStep = 0; // 0: subject, 1: topic, 2: endTime
let formData = {
    subject: '',
    topic: '',
    endTime: ''
};

let modalContent;
let modalFooter;
let createSessionBtn;
let backdrop;

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Session Overlay] DOM Content Loaded');
    
    modalContent = document.getElementById('modalContent');
    modalFooter = document.getElementById('modalFooter');
    createSessionBtn = document.getElementById('createSessionBtn');
    backdrop = document.querySelector('.modal-backdrop');

    console.log('[Session Overlay] Elements found:', {
        modalContent: !!modalContent,
        modalFooter: !!modalFooter,
        createSessionBtn: !!createSessionBtn,
        backdrop: !!backdrop
    });

    // Prevent backdrop from closing
    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Listen for external events
    if (window.sessionOverlayAPI) {
        window.sessionOverlayAPI.onError((error) => {
            showError(error);
        });
    } else {
        console.error('[Session Overlay] sessionOverlayAPI not found - preload script may have failed to load');
    }

    // Go straight to wizard
    console.log('[Session Overlay] Starting wizard...');
    showCreateForm = true;
    wizardStep = 0;
    renderWizard();
});

// Load sessions on startup
async function loadSessions() {
    console.log('[Session Overlay] loadSessions called');
    console.log('[Session Overlay] window.sessionOverlayAPI exists:', !!window.sessionOverlayAPI);
    console.log('[Session Overlay] window.sessionOverlayAPI.getSessions exists:', !!window.sessionOverlayAPI?.getSessions);
    
    isLoading = true;
    renderContent();

    try {
        if (!window.sessionOverlayAPI) {
            throw new Error('sessionOverlayAPI not available - preload script may not have loaded');
        }
        
        console.log('[Session Overlay] Requesting sessions...');
        const response = await window.sessionOverlayAPI.getSessions();
        console.log('[Session Overlay] Response received:', response);
        console.log('[Session Overlay] Response success:', response.success);
        console.log('[Session Overlay] Sessions array:', response.sessions);
        console.log('[Session Overlay] Sessions count:', response.sessions?.length);
        
        if (response.success) {
            sessions = response.sessions || [];
            console.log('[Session Overlay] Loaded sessions:', sessions.length);
        } else {
            console.error('[Session Overlay] Failed to load:', response.error);
            showError(response.error || 'Failed to load sessions');
        }
    } catch (error) {
        console.error('[Session Overlay] Exception:', error);
        showError(`Error loading sessions: ${error.message}`);
    } finally {
        isLoading = false;
        console.log('[Session Overlay] Rendering with isLoading=false, sessions.length=', sessions.length);
        renderContent();
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    modalContent.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    modalContent.insertBefore(successDiv, modalContent.firstChild);
    
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

function renderContent() {
    console.log('[Session Overlay] renderContent called - isLoading:', isLoading, 'sessions:', sessions.length, 'showCreateForm:', showCreateForm);
    modalContent.innerHTML = '';

    if (isLoading) {
        console.log('[Session Overlay] Rendering loading state');
        modalContent.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p class="loading-text">Loading sessions...</p>
            </div>
        `;
    } else if (showCreateForm) {
        console.log('[Session Overlay] Rendering wizard');
        renderWizard();
    } else if (sessions.length > 0) {
        console.log('[Session Overlay] Rendering sessions list');
        renderSessionsList();
    } else {
        console.log('[Session Overlay] Rendering empty state');
        renderEmptyState();
    }

    updateFooter();
    
    // Re-initialize Lucide icons after content update
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function renderWizard() {
    const steps = ['Subject', 'Topic', 'End Time'];
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const minDateTime = new Date().toISOString().slice(0, 16);
    const defaultEndTime = now.toISOString().slice(0, 16);

    let stepContent = '';
    let inputValue = '';
    let placeholder = '';
    let inputType = 'text';
    let stepTitle = '';
    let stepDesc = '';
    let suggestions = [];

    if (wizardStep === 0) {
        stepTitle = 'What subject are you going to teach?';
        stepDesc = 'Enter the subject or course name';
        placeholder = 'e.g., Physics 101, Mathematics, Chemistry';
        inputValue = formData.subject;
        inputType = 'text';
        suggestions = ['Physics', 'Mathematics', 'Chemistry', 'Biology', 'Computer Science', 'History', 'English'];
    } else if (wizardStep === 1) {
        stepTitle = 'Which topic will you cover?';
        stepDesc = 'Be specific about the topic (optional)';
        placeholder = 'e.g., Thermodynamics, Calculus, Photosynthesis';
        inputValue = formData.topic;
        inputType = 'text';
        suggestions = ['Thermodynamics', 'Calculus', 'Algebra', 'Organic Chemistry', 'Data Structures', 'World War II'];
    } else if (wizardStep === 2) {
        stepTitle = 'How long will you teach?';
        stepDesc = 'Select when this session will end';
        inputValue = formData.endTime || defaultEndTime;
        inputType = 'datetime-local';
        
        // Time suggestions (1 hour, 2 hours, 3 hours from now)
        const oneHour = new Date(Date.now() + 60 * 60 * 1000);
        const twoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const threeHours = new Date(Date.now() + 3 * 60 * 60 * 1000);
        suggestions = [
            { label: 'In 1 hour', value: oneHour.toISOString().slice(0, 16) },
            { label: 'In 2 hours', value: twoHours.toISOString().slice(0, 16) },
            { label: 'In 3 hours', value: threeHours.toISOString().slice(0, 16) }
        ];
    }

    modalContent.innerHTML = `
        <div class="wizard-step">
            <div class="wizard-progress">
                ${steps.map((_, i) => `
                    <div class="wizard-progress-dot ${i === wizardStep ? 'active' : ''} ${i < wizardStep ? 'completed' : ''}"></div>
                `).join('')}
            </div>
            
            <h3>${stepTitle}</h3>
            <p>${stepDesc}</p>
            
            <div class="form-group">
                <input
                    type="${inputType}"
                    id="wizardInput"
                    class="form-input"
                    placeholder="${placeholder}"
                    value="${inputValue}"
                    ${inputType === 'datetime-local' ? `min="${minDateTime}"` : ''}
                    ${isCreating ? 'disabled' : ''}
                    style="text-align: center; font-size: 16px;"
                />
            </div>
            
            ${suggestions.length > 0 ? `
                <div class="suggestions">
                    ${suggestions.map(s => {
                        const label = typeof s === 'string' ? s : s.label;
                        const value = typeof s === 'string' ? s : s.value;
                        return `<button class="suggestion-chip" data-value="${value}">${label}</button>`;
                    }).join('')}
                </div>
            ` : ''}
        </div>
    `;

    const wizardInput = document.getElementById('wizardInput');
    
    // Focus input
    setTimeout(() => wizardInput?.focus(), 100);

    // Update form data as user types
    wizardInput?.addEventListener('input', (e) => {
        if (wizardStep === 0) formData.subject = e.target.value;
        else if (wizardStep === 1) formData.topic = e.target.value;
        else if (wizardStep === 2) formData.endTime = e.target.value;
    });

    // Handle Enter key
    wizardInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !isCreating) {
            handleWizardNext();
        }
    });

    // Handle suggestion chip clicks
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const value = chip.dataset.value;
            wizardInput.value = value;
            
            if (wizardStep === 0) formData.subject = value;
            else if (wizardStep === 1) formData.topic = value;
            else if (wizardStep === 2) formData.endTime = value;
            
            // Auto-advance after short delay
            setTimeout(() => {
                if (!isCreating) handleWizardNext();
            }, 300);
        });
    });

    updateFooter();
}

function renderSessionsList() {
    const activeSessions = sessions.filter(s => s.status === 'active');
    console.log('[Session Overlay] renderSessionsList - total sessions:', sessions.length, 'active:', activeSessions.length);
    
    const sessionsHtml = activeSessions
        .map(session => `
            <button class="item-card" data-session-id="${session.sessionId}">
                <h3 class="item-title">${session.subject}</h3>
                ${session.topic ? `<p class="item-subtitle">Topic: ${session.topic}</p>` : ''}
                <p class="item-subtitle">Started: ${new Date(session.startTime).toLocaleString()}</p>
            </button>
        `)
        .join('');

    console.log('[Session Overlay] Generated HTML length:', sessionsHtml.length);

    if (!sessionsHtml) {
        console.log('[Session Overlay] No sessions HTML, showing empty state');
        renderEmptyState();
        return;
    }

    modalContent.innerHTML = `<div class="item-list">${sessionsHtml}</div>`;
    console.log('[Session Overlay] Sessions list rendered');

    // Add click handlers
    document.querySelectorAll('.item-card').forEach(item => {
        item.addEventListener('click', async () => {
            const sessionId = item.dataset.sessionId;
            const result = await window.sessionOverlayAPI.selectSession(sessionId);
            if (result.success) {
                showSuccess('Session selected!');
                setTimeout(() => loadSessions(), 500);
            } else {
                showError(result.error || 'Failed to select session');
            }
        });
    });

    updateFooter();
}

function renderEmptyState() {
    modalContent.innerHTML = `
        <div class="empty-state">
            <i data-lucide="book-open" style="width: 48px; height: 48px; margin: 0 auto 12px; display: block; color: rgba(255, 255, 255, 0.1);"></i>
            <p class="empty-state-title">No active sessions</p>
            <p class="empty-state-subtitle">Create a new session to get started</p>
        </div>
    `;
    updateFooter();
}

function updateFooter() {
    const activeSessions = sessions.filter(s => s.status === 'active');
    
    if (showCreateForm) {
        const isLastStep = wizardStep === 2;
        const canSkipTopic = wizardStep === 1;
        
        modalFooter.innerHTML = `
            ${wizardStep > 0 ? `
                <button class="button button-secondary" id="backBtn" ${isCreating ? 'disabled' : ''}>
                    ← Back
                </button>
            ` : ''}
            ${canSkipTopic ? `
                <button class="button button-secondary" id="skipBtn" ${isCreating ? 'disabled' : ''}>
                    Skip
                </button>
            ` : ''}
            <button class="button button-primary button-full button-icon" id="nextBtn" ${isCreating ? 'disabled' : ''}>
                <span>${isCreating ? '⏳' : (isLastStep ? '✓' : '→')}</span>
                <span>${isCreating ? 'Creating...' : (isLastStep ? 'Create Session' : 'Next')}</span>
            </button>
            ${wizardStep === 0 ? `
                <button class="button button-secondary" id="cancelBtn" ${isCreating ? 'disabled' : ''}>
                    Cancel
                </button>
            ` : ''}
        `;

        document.getElementById('nextBtn')?.addEventListener('click', handleWizardNext);
        document.getElementById('backBtn')?.addEventListener('click', handleWizardBack);
        document.getElementById('skipBtn')?.addEventListener('click', handleWizardSkip);
        document.getElementById('cancelBtn')?.addEventListener('click', async () => {
            if (window.sessionOverlayAPI) {
                await window.sessionOverlayAPI.closeWindow();
            }
        });
    } else {
        modalFooter.innerHTML = `
            <button class="button button-primary button-full button-icon" id="createSessionBtn" ${isLoading ? 'disabled' : ''}>
                <span>+</span>
                <span>Create New Session</span>
            </button>
        `;

        document.getElementById('createSessionBtn').addEventListener('click', () => {
            showCreateForm = true;
            wizardStep = 0;
            renderWizard();
        });
    }
}

function handleWizardNext() {
    // Validate current step
    if (wizardStep === 0 && !formData.subject.trim()) {
        showError('Please enter a subject');
        return;
    }
    
    if (wizardStep === 2 && !formData.endTime) {
        showError('Please select an end time');
        return;
    }
    
    if (wizardStep === 2) {
        const endDateTime = new Date(formData.endTime);
        if (endDateTime <= new Date()) {
            showError('End time must be in the future');
            return;
        }
    }

    // Last step - create session
    if (wizardStep === 2) {
        handleCreateSession();
    } else {
        // Move to next step
        wizardStep++;
        renderWizard();
    }
}

function handleWizardBack() {
    if (wizardStep > 0) {
        wizardStep--;
        renderWizard();
    }
}

function handleWizardSkip() {
    if (wizardStep === 1) {
        formData.topic = '';
        wizardStep++;
        renderWizard();
    }
}

async function handleCreateSession() {
    // Validate (final check)
    if (!formData.subject.trim()) {
        showError('Subject is required');
        return;
    }

    if (!formData.endTime) {
        showError('End time is required');
        return;
    }

    const endDateTime = new Date(formData.endTime);
    if (endDateTime <= new Date()) {
        showError('End time must be in the future');
        return;
    }

    isCreating = true;
    renderWizard();

    try {
        const result = await window.sessionOverlayAPI.createSession(
            formData.subject,
            formData.topic,
            formData.endTime
        );

        if (result.success) {
            showSuccess('Session created successfully!');
            // Close the window after a short delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (window.sessionOverlayAPI) {
                await window.sessionOverlayAPI.closeWindow();
            }
        } else {
            showError(result.error || 'Failed to create session');
            isCreating = false;
            renderWizard();
        }
    } catch (error) {
        showError(`Error: ${error.message}`);
        isCreating = false;
        renderWizard();
    }
}
