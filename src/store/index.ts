import { create } from 'zustand';
import type { FileItem, Settings, SyncStats, AuthStatus, Capture, UploadProgress } from '@/types';
import { config } from '@/config';

interface AppState {
  // Files
  files: FileItem[];
  filteredFiles: FileItem[];
  searchQuery: string;
  dateRange: { from: Date | null; to: Date | null };
  
  // Stats
  stats: SyncStats;
  
  // Settings
  settings: Settings;
  
  // Auth
  authStatus: AuthStatus;
  isAuthLoading: boolean;
  
  // Captures
  captures: Capture[];
  selectedCaptures: Set<string>;
  
  // UI State
  currentView: 'files' | 'captures' | 'settings';
  captureTab: 'screenshots' | 'recordings';
  isRecording: boolean;
  recordingState: 'idle' | 'recording' | 'paused';
  uploadProgress: UploadProgress | null;
  
  // Actions
  setFiles: (files: FileItem[]) => void;
  setSearchQuery: (query: string) => void;
  setDateRange: (range: { from: Date | null; to: Date | null }) => void;
  applyFilters: () => void;
  setStats: (stats: SyncStats) => void;
  setSettings: (settings: Settings) => void;
  setAuthStatus: (status: AuthStatus) => void;
  setAuthLoading: (loading: boolean) => void;
  setCaptures: (captures: Capture[]) => void;
  toggleCaptureSelection: (path: string) => void;
  clearCaptureSelection: () => void;
  selectAllCaptures: (type?: 'screenshot' | 'recording') => void;
  setCurrentView: (view: 'files' | 'captures' | 'settings') => void;
  setCaptureTab: (tab: 'screenshots' | 'recordings') => void;
  setRecordingState: (state: 'idle' | 'recording' | 'paused') => void;
  setUploadProgress: (progress: UploadProgress | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  files: [],
  filteredFiles: [],
  searchQuery: '',
  dateRange: { from: null, to: null },
  
  stats: {
    totalFiles: 0,
    syncedFiles: 0,
    failedFiles: 0,
    lastSync: null,
    isWatching: false,
  },
  
  settings: {
    autoSync: true,
    syncInterval: 0,
    ignoreHidden: true,
    ignoredExtensions: [],
    maxFileSize: 100,
    compressionEnabled: false,
    encryptionEnabled: false,
    autoStart: true,
    apiBaseUrl: config.API.BASE_URL,
    bearerToken: null,
  },
  
  authStatus: {
    isAuthenticated: false,
  },
  
  isAuthLoading: false,
  
  captures: [],
  selectedCaptures: new Set(),
  
  currentView: 'files',
  captureTab: 'screenshots',
  isRecording: false,
  recordingState: 'idle',
  uploadProgress: null,
  
  setFiles: (files) => {
    set({ files });
    get().applyFilters();
  },
  
  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().applyFilters();
  },
  
  setDateRange: (range) => {
    set({ dateRange: range });
    get().applyFilters();
  },
  
  applyFilters: () => {
    const { files, searchQuery, dateRange } = get();
    console.log('Files', files);
    let filtered = [...files];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(file =>
        file.name.toLowerCase().includes(query)
      );
    }
    
    // Date range filter
    if (dateRange.from || dateRange.to) {
      filtered = filtered.filter(file => {
        const fileDate = new Date(file.modifiedTime);
        if (dateRange.from && fileDate < dateRange.from) return false;
        if (dateRange.to && fileDate > dateRange.to) return false;
        return true;
      });
    }

    console.log('Filtered files:', filtered);
    
    set({ filteredFiles: filtered });
  },
  
  setStats: (stats) => set({ stats }),
  setSettings: (settings) => set({ settings }),
  setAuthStatus: (authStatus) => set({ authStatus }),
  setAuthLoading: (isAuthLoading) => set({ isAuthLoading }),
  setCaptures: (captures) => set({ captures }),
  
  toggleCaptureSelection: (path) => {
    const selected = new Set(get().selectedCaptures);
    if (selected.has(path)) {
      selected.delete(path);
    } else {
      selected.add(path);
    }
    set({ selectedCaptures: selected });
  },
  
  clearCaptureSelection: () => set({ selectedCaptures: new Set() }),
  
  selectAllCaptures: (type) => {
    const { captures } = get();
    const filtered = type ? captures.filter(c => c.type === type) : captures;
    set({ selectedCaptures: new Set(filtered.map(c => c.path).filter((p): p is string => p !== null)) });
  },
  
  setCurrentView: (view) => set({ currentView: view }),
  setCaptureTab: (tab) => set({ captureTab: tab }),
  setRecordingState: (state) => set({ recordingState: state, isRecording: state !== 'idle' }),
  setUploadProgress: (progress) => set({ uploadProgress: progress }),
}));
