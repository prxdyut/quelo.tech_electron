import { X, Save, RefreshCw, Trash2 } from 'lucide-react';
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
      setCurrentView('files');
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="glass rounded-xl shadow-glass max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto border border-border/50 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
          <button
            onClick={() => setCurrentView('files')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* API Configuration */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-3">API Configuration</h3>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                API Base URL
              </label>
              <input
                type="text"
                value={localSettings.apiBaseUrl}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, apiBaseUrl: e.target.value })
                }
                placeholder={config.API.BASE_URL}
                className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Backend API URL for file uploads and sync
              </p>
            </div>
          </section>

          {/* Sync Settings */}
          <section className="border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Sync Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm text-foreground">Auto Sync</label>
                  <p className="text-xs text-muted-foreground">
                    Automatically sync files when changes are detected
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.autoSync}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, autoSync: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm text-foreground">Auto Start</label>
                  <p className="text-xs text-muted-foreground">
                    Start syncing automatically when app launches
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.autoStart}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, autoStart: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">
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
                  className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Set to 0 for immediate sync, or specify delay
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">
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
                  className="w-full px-3 py-2 bg-background/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Maximum file size to sync (in megabytes)
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm text-foreground">Ignore Hidden Files</label>
                  <p className="text-xs text-muted-foreground">
                    Skip files starting with a dot (.)
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.ignoreHidden}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, ignoreHidden: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
              </div>
            </div>
          </section>

          {/* Upload Records */}
          <section className="border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Upload Records</h3>
            <div className="glass-light dark:glass rounded-lg p-3 mb-2 border border-border/30">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-muted-foreground">Total files tracked:</span>
                <span className="text-sm font-semibold text-foreground">
                  {uploadRecordsCount}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                The app tracks uploaded files to avoid re-uploading unchanged files.
              </p>
              <button
                onClick={handleSyncFromServer}
                className="w-full px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all text-xs mb-2 flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-3 h-3" />
                Sync from Server
              </button>
            </div>
            <button
              onClick={handleClearRecords}
              className="w-full px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-all text-sm flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear Upload Records
            </button>
            <p className="text-xs text-muted-foreground mt-1.5">
              This will force all files to be re-uploaded on next sync
            </p>
          </section>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-6 mt-6 border-t border-border">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all text-sm font-medium flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
          <button
            onClick={() => setCurrentView('files')}
            className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-all text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
