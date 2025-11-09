import { Image as ImageIcon, Mic, RefreshCw, AlertCircle, Cloud, HardDrive } from 'lucide-react';
import { useAppStore } from '@/store';
import { CaptureCard } from '@/components/CaptureCard';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function CapturesView() {
  const {
    captures,
    setCaptures,
    captureTab,
    setCaptureTab,
  } = useAppStore();

  const [retryingAll, setRetryingAll] = useState(false);

  useEffect(() => {
    loadCaptures();
  }, [setCaptures]);

  const loadCaptures = async () => {
    const allCaptures = await window.electronAPI.captures.getAll();
    setCaptures(allCaptures);
  };

  const screenshots = captures.filter((c) => c.type === 'screenshot');
  const recordings = captures.filter((c) => c.type === 'recording' || c.type === 'audio');
  const displayedCaptures = captureTab === 'screenshots' ? screenshots : recordings;
  
  // Separate backend and local (failed) captures
  const backendCaptures = displayedCaptures.filter(c => c.source === 'backend');
  const localCaptures = displayedCaptures.filter(c => c.source === 'local');

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

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 animate-fade-in">
      {/* Tabs */}
      <div className="border-b border-border flex items-center gap-4">
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
      </div>

      {/* Failed Uploads Warning */}
      {localCaptures.length > 0 && (
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

      {/* Failed Uploads Section */}
      {localCaptures.length > 0 && (
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
      {backendCaptures.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">
              Uploaded Captures ({backendCaptures.length})
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

      {/* Empty State */}
      {displayedCaptures.length === 0 && (
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
    </div>
  );
}
