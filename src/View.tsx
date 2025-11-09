import { Image as ImageIcon, Mic, RefreshCw, AlertCircle, Cloud, HardDrive, Loader2, BookOpen } from 'lucide-react';
import { useAppStore } from '@/store';
import { CaptureCard } from '@/components/CaptureCard';
import { SessionCard } from '@/components/SessionCard';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { sessionsService } from '@/lib/sessionsService';

export function View() {
  const {
    captures,
    setCaptures,
    captureTab,
    setCaptureTab,
    isLoadingCaptures,
    setLoadingCaptures,
    setAuthStatus,
    sessions,
    setSessions,
    isLoadingSessions,
    setLoadingSessions,
  } = useAppStore();

  const [retryingAll, setRetryingAll] = useState(false);

  useEffect(() => {
    loadCaptures();

    // Listen for capture changes
    const handleCapturesChanged = () => {
      console.log('[CapturesView] Captures changed, reloading...');
      loadCaptures();
    };

    window.electronAPI.captures.onCapturesChanged(handleCapturesChanged);

    // No cleanup needed as this is a one-way event listener
  }, [setCaptures]);

  useEffect(() => {
    loadSessions();

    // Listen for session selection (when a new session is created)
    const handleSessionSelected = () => {
      console.log('[View] Session selected, reloading sessions...');
      loadSessions();
    };

    // @ts-ignore - onSessionSelected will be available after preload
    if (window.electronAPI?.session?.onSessionSelected) {
      // @ts-ignore
      window.electronAPI.session.onSessionSelected(handleSessionSelected);
    }
  }, []);

  const loadCaptures = async () => {
    setLoadingCaptures(true);
    try {
      const allCaptures = await window.electronAPI.captures.getAll();
      setCaptures(allCaptures);
    } finally {
      setLoadingCaptures(false);
    }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const response = await sessionsService.fetchSessions({
        limit: 100,
      });
      setSessions(response.sessions);
    } catch (error) {
      console.error('[CapturesView] Error loading sessions:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('authenticated')) {
        toast.error('Please sign in to view sessions');
      } else {
        toast.error('Failed to load sessions');
      }
    } finally {
      setLoadingSessions(false);
    }
  };

  const screenshots = captures.filter((c) => c.type === 'screenshot');
  const recordings = captures.filter((c) => c.type === 'recording' || c.type === 'audio');
  const displayedCaptures = captureTab === 'screenshots' ? screenshots : recordings;

  // Separate backend, uploading, and local (failed) captures
  const backendCaptures = displayedCaptures.filter(c => c.source === 'backend');
  const uploadingCaptures = displayedCaptures.filter(c => c.uploadStatus === 'uploading');
  const localCaptures = displayedCaptures.filter(c => c.source === 'local' && c.uploadStatus !== 'uploading');

  const handleRetry = async (filePath: string) => {
    const toastId = toast.loading('Retrying upload...');
    try {
      const result = await window.electronAPI.captures.retryUpload(filePath);

      if (result.success) {
        toast.success('Upload successful!', { id: toastId });
        await loadCaptures();
      } else {
        toast.error(`Retry failed: ${result.error}`, { id: toastId });
      }
    } catch (error) {
      toast.error(`Error: ${(error as Error).message}`, { id: toastId });
    }
  };

  const handleRetryAll = async () => {
    if (localCaptures.length === 0) {
      toast.error('No failed uploads to retry');
      return;
    }

    setRetryingAll(true);
    try {
      const result = await window.electronAPI.captures.retryAll();

      if (result.success) {
        if (result.uploaded && result.uploaded > 0) {
          toast.success(`Successfully uploaded ${result.uploaded} item(s)!`);
        }
        if (result.failed && result.failed > 0) {
          toast.warning(`${result.failed} item(s) still failed to upload`);
        }
        await loadCaptures();
      } else {
        toast.error('Retry all failed');
      }
    } catch (error) {
      toast.error(`Error: ${(error as Error).message}`);
    } finally {
      setRetryingAll(false);
    }
  };

  const handleLogout = async () => {
    const toastId = toast.loading('Logging out...');
    try {
      const result = await window.electronAPI.auth.logout();

      if (result.success) {
        setAuthStatus({ isAuthenticated: false });
        toast.success('Logged out successfully', { id: toastId });
      } else {
        toast.error(`Logout failed: ${result.error}`, { id: toastId });
      }
    } catch (error) {
      toast.error(`Error: ${(error as Error).message}`, { id: toastId });
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 animate-fade-in">
      {/* Full Page Loading */}
      {isLoadingCaptures && captures.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Loading captures...</p>
        </div>
      )}

      {/* Content (show when not initial loading) */}
      {(!isLoadingCaptures || captures.length > 0) && (
        <>
          {/* Tabs */}
          <div className="border-b border-border flex items-center gap-4">
            <button
              onClick={() => setCaptureTab('sessions')}
              className={cn(
                'px-4 py-3 text-sm font-medium transition-all border-b-2 flex items-center gap-2',
                captureTab === 'sessions'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <BookOpen className="w-4 h-4" />
              Sessions ({sessions.length})
            </button>
            <button
              onClick={() => setCaptureTab('screenshots')}
              className={cn(
                'px-4 py-3 text-sm font-medium transition-all border-b-2 flex items-center gap-2',
                captureTab === 'screenshots'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <ImageIcon className="w-4 h-4" />
              Screenshots ({screenshots.length})
            </button>
            <button
              onClick={() => setCaptureTab('recordings')}
              className={cn(
                'px-4 py-3 text-sm font-medium transition-all border-b-2 flex items-center gap-2',
                captureTab === 'recordings'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Mic className="w-4 h-4" />
              Recordings ({recordings.length})
            </button>
            <div className="flex-1" />
            <button
              onClick={handleLogout}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Logout
            </button>
          </div>

          {/* Failed Uploads Warning */}
          {localCaptures.length > 0 && captureTab !== 'sessions' && (
            <div className="glass rounded-lg border border-amber-500/50 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-foreground">
                  {localCaptures.length} Failed Upload{localCaptures.length > 1 ? 's' : ''}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  These captures couldn't be uploaded. They're stored locally until successfully uploaded.
                </p>
              </div>
              <button
                onClick={handleRetryAll}
                disabled={retryingAll}
                className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={cn('w-4 h-4', retryingAll && 'animate-spin')} />
                Retry All
              </button>
            </div>
          )}

          {/* Uploading Captures Section */}
          {uploadingCaptures.length > 0 && captureTab !== 'sessions' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                <h3 className="text-sm font-medium text-foreground">
                  Uploading ({uploadingCaptures.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {uploadingCaptures.map((capture) => (
                  <CaptureCard
                    key={capture.path}
                    capture={capture}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Failed Uploads Section */}
          {localCaptures.length > 0 && captureTab !== 'sessions' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-medium text-foreground">
                  Failed Uploads ({localCaptures.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {localCaptures.map((capture) => (
                  <CaptureCard
                    key={capture.path}
                    capture={capture}
                    onRetry={() => capture.path && handleRetry(capture.path)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Backend Captures Section */}
          {backendCaptures.length > 0 && captureTab !== 'sessions' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {captureTab === 'screenshots' ? (
                  <ImageIcon className="w-4 h-4 text-primary" />
                ) : (
                  <Mic className="w-4 h-4 text-primary" />
                )}
                <h3 className="text-sm font-medium text-foreground">
                  {captureTab === 'screenshots' ? 'Screenshots' : 'Recordings'} ({backendCaptures.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {backendCaptures.map((capture) => (
                  <CaptureCard
                    key={capture.captureId || capture.path}
                    capture={capture}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sessions Tab */}
          {captureTab === 'sessions' && (
            <>
              {/* Sessions Content */}
              {isLoadingSessions && sessions.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
                    <p className="text-muted-foreground">Loading sessions...</p>
                  </div>
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-20">
                  <div className="text-muted-foreground mb-4">
                    <BookOpen className="w-16 h-16 mx-auto opacity-20" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground mb-1">
                    No sessions yet
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Start a new session to see it here
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-medium text-foreground">
                      Sessions ({sessions.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {sessions.map((session) => (
                      <SessionCard key={session.sessionId} session={session} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Empty State */}
          {displayedCaptures.length === 0 && captureTab !== 'sessions' && (
            <div className="text-center py-20">
              <div className="text-muted-foreground mb-4">
                {captureTab === 'screenshots' ? (
                  <ImageIcon className="w-16 h-16 mx-auto opacity-20" />
                ) : (
                  <Mic className="w-16 h-16 mx-auto opacity-20" />
                )}
              </div>
              <h3 className="text-sm font-medium text-foreground mb-1">
                No {captureTab} yet
              </h3>
              <p className="text-xs text-muted-foreground">
                {captureTab === 'screenshots'
                  ? 'Take screenshots to see them here'
                  : 'Record audio to see recordings here'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
