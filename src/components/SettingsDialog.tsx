import { X, Save, RefreshCw, Trash2, Settings2, Wifi, HardDrive } from 'lucide-react';
import { useAppStore } from '@/store';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { config } from '@/config';

export function SettingsDialog() {
  const { currentView, setCurrentView, settings, setSettings } = useAppStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [uploadRecordsCount, setUploadRecordsCount] = useState(0);

  const isOpen = currentView === 'settings';

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    const fetchedSettings = await window.electronAPI.getSettings();
    setLocalSettings(fetchedSettings);
    setSettings(fetchedSettings);

    const records = await window.electronAPI.uploadRecords.getAll();
    setUploadRecordsCount(Object.keys(records).length);
  };

  const handleSave = async () => {
    try {
      await window.electronAPI.updateSettings(localSettings);
      setSettings(localSettings);
      toast.success('Settings saved successfully');
      setCurrentView('captures');
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const handleClearRecords = async () => {
    const confirmed = confirm('Clear all upload records? Files will be re-uploaded on next sync.');
    if (!confirmed) return;

    try {
      await window.electronAPI.uploadRecords.clearAll();
      setUploadRecordsCount(0);
      toast.success('Upload records cleared');
    } catch (error) {
      toast.error('Failed to clear records');
    }
  };

  const handleSyncFromServer = async () => {
    try {
      await window.electronAPI.uploadRecords.syncFromServer();
      const records = await window.electronAPI.uploadRecords.getAll();
      setUploadRecordsCount(Object.keys(records).length);
      toast.success('Synced from server');
    } catch (error) {
      toast.error('Failed to sync from server');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div 
        className="w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{
          background: '#0a0a0a',
          border: '1px solid #1f1f1f',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: '#1f1f1f' }}
        >
          <div className="flex items-center gap-3">
            <Settings2 className="w-5 h-5" style={{ color: '#3b82f6' }} />
            <div>
              <h2 className="text-base font-semibold" style={{ color: '#e0e0e0' }}>
                Settings
              </h2>
              <p className="text-xs" style={{ color: '#6b7280' }}>
                Configure your application preferences
              </p>
            </div>
          </div>
          <button
            onClick={() => setCurrentView('captures')}
            className="p-2 rounded-lg transition-colors"
            style={{ color: '#6b7280' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#e0e0e0'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* API Configuration Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="w-4 h-4" style={{ color: '#3b82f6' }} />
              <h3 className="text-sm font-semibold" style={{ color: '#e0e0e0' }}>
                API Configuration
              </h3>
            </div>
            <div className="p-4 rounded-lg" style={{ background: '#0f0f0f', border: '1px solid #1f1f1f' }}>
              <label className="block text-xs font-medium mb-2" style={{ color: '#9ca3af' }}>
                API Base URL
              </label>
              <input
                type="text"
                value={localSettings.apiBaseUrl}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, apiBaseUrl: e.target.value })
                }
                placeholder={config.API.BASE_URL}
                className="w-full px-3 py-2.5 rounded-lg text-sm transition-all outline-none"
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  color: '#e0e0e0',
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#2a2a2a'}
              />
              <p className="text-xs mt-2" style={{ color: '#6b7280' }}>
                Backend API URL for file uploads and sync
              </p>
            </div>
          </div>

          {/* Sync Settings Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="w-4 h-4" style={{ color: '#3b82f6' }} />
              <h3 className="text-sm font-semibold" style={{ color: '#e0e0e0' }}>
                Sync Settings
              </h3>
            </div>
            
            <div className="p-4 rounded-lg space-y-4" style={{ background: '#0f0f0f', border: '1px solid #1f1f1f' }}>
              {/* Auto Sync Toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium" style={{ color: '#e0e0e0' }}>Auto Sync</div>
                  <div className="text-xs" style={{ color: '#6b7280' }}>
                    Automatically sync files when changes are detected
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.autoSync}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, autoSync: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                    style={{
                      background: localSettings.autoSync ? '#3b82f6' : '#2a2a2a',
                    }}
                  ></div>
                </label>
              </div>

              <div style={{ height: '1px', background: '#1f1f1f' }}></div>

              {/* Auto Start Toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium" style={{ color: '#e0e0e0' }}>Auto Start</div>
                  <div className="text-xs" style={{ color: '#6b7280' }}>
                    Start syncing automatically when app launches
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.autoStart}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, autoStart: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                    style={{
                      background: localSettings.autoStart ? '#3b82f6' : '#2a2a2a',
                    }}
                  ></div>
                </label>
              </div>

              <div style={{ height: '1px', background: '#1f1f1f' }}></div>

              {/* Sync Interval */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: '#9ca3af' }}>
                  Sync Interval (seconds)
                </label>
                <input
                  type="number"
                  value={localSettings.syncInterval}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      syncInterval: parseInt(e.target.value) || 0,
                    })
                  }
                  min="0"
                  placeholder="0 (immediate)"
                  className="w-full px-3 py-2.5 rounded-lg text-sm transition-all outline-none"
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid #2a2a2a',
                    color: '#e0e0e0',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#2a2a2a'}
                />
                <p className="text-xs mt-2" style={{ color: '#6b7280' }}>
                  Set to 0 for immediate sync, or specify delay
                </p>
              </div>

              <div style={{ height: '1px', background: '#1f1f1f' }}></div>

              {/* Max File Size */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: '#9ca3af' }}>
                  Max File Size (MB)
                </label>
                <input
                  type="number"
                  value={localSettings.maxFileSize}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      maxFileSize: parseInt(e.target.value) || 100,
                    })
                  }
                  min="1"
                  placeholder="100"
                  className="w-full px-3 py-2.5 rounded-lg text-sm transition-all outline-none"
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid #2a2a2a',
                    color: '#e0e0e0',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#2a2a2a'}
                />
                <p className="text-xs mt-2" style={{ color: '#6b7280' }}>
                  Maximum file size to sync (in megabytes)
                </p>
              </div>

              <div style={{ height: '1px', background: '#1f1f1f' }}></div>

              {/* Ignore Hidden Files */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium" style={{ color: '#e0e0e0' }}>Ignore Hidden Files</div>
                  <div className="text-xs" style={{ color: '#6b7280' }}>
                    Skip files starting with a dot (.)
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localSettings.ignoreHidden}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, ignoreHidden: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                    style={{
                      background: localSettings.ignoreHidden ? '#3b82f6' : '#2a2a2a',
                    }}
                  ></div>
                </label>
              </div>
            </div>
          </div>

          {/* Upload Records Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="w-4 h-4" style={{ color: '#3b82f6' }} />
              <h3 className="text-sm font-semibold" style={{ color: '#e0e0e0' }}>
                Upload Records
              </h3>
            </div>
            
            <div className="p-4 rounded-lg space-y-4" style={{ background: '#0f0f0f', border: '1px solid #1f1f1f' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#9ca3af' }}>Total files tracked:</span>
                <span className="text-sm font-semibold" style={{ color: '#e0e0e0' }}>
                  {uploadRecordsCount}
                </span>
              </div>
              <p className="text-xs" style={{ color: '#6b7280' }}>
                The app tracks uploaded files to avoid re-uploading unchanged files.
              </p>
              
              <button
                onClick={handleSyncFromServer}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
                style={{
                  background: '#3b82f6',
                  color: 'white',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#2563eb'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#3b82f6'}
              >
                <RefreshCw className="w-4 h-4" />
                Sync from Server
              </button>

              <button
                onClick={handleClearRecords}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
                style={{
                  background: '#1a1a1a',
                  color: '#e0e0e0',
                  border: '1px solid #2a2a2a',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#252525'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#1a1a1a'}
              >
                <Trash2 className="w-4 h-4" />
                Clear Upload Records
              </button>
              
              <p className="text-xs" style={{ color: '#6b7280' }}>
                This will force all files to be re-uploaded on next sync
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div 
          className="flex gap-3 p-4 border-t"
          style={{ 
            borderColor: '#1f1f1f',
            background: '#0a0a0a'
          }}
        >
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
            style={{
              background: '#3b82f6',
              color: 'white',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#2563eb'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#3b82f6'}
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
          <button
            onClick={() => setCurrentView('captures')}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: '#1a1a1a',
              color: '#e0e0e0',
              border: '1px solid #2a2a2a',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#252525'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#1a1a1a'}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
