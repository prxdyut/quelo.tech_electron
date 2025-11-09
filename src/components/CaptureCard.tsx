import { Image as ImageIcon, Mic, Check, RefreshCw, AlertTriangle, Cloud, HardDrive } from 'lucide-react';
import { cn, formatBytes, formatDate, formatDuration } from '@/lib/utils';
import type { Capture } from '@/types';
import { useAppStore } from '@/store';

interface CaptureCardProps {
  capture: Capture;
  onRetry?: () => void;
}

export function CaptureCard({ capture, onRetry }: CaptureCardProps) {
  const { selectedCaptures, toggleCaptureSelection } = useAppStore();
  const captureId = capture.captureId || capture.path;
  const isSelected = captureId ? selectedCaptures.has(captureId) : false;

  const handleToggle = () => {
    if (captureId) {
      toggleCaptureSelection(captureId);
    }
  };

  const isLocal = capture.source === 'local';
  const hasError = isLocal && capture.uploadError;

  return (
    <div
      className={cn(
        'glass rounded-lg border transition-all group animate-scale-in relative',
        isSelected
          ? 'border-primary shadow-neon'
          : 'border-border/50 hover:border-primary/50',
        hasError && 'border-amber-500/50'
      )}
    >
      {/* Source Badge */}
      <div className="absolute top-2 left-2 z-10">
        {isLocal ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/90 text-white text-xs font-medium">
            <HardDrive className="w-3 h-3" />
            Local
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/90 text-white text-xs font-medium">
            <Cloud className="w-3 h-3" />
            Uploaded
          </div>
        )}
      </div>

      {/* Checkbox */}
      <div className="absolute top-2 right-2 z-10">
        <div
          onClick={handleToggle}
          className={cn(
            'w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer',
            isSelected
              ? 'bg-primary border-primary'
              : 'border-border bg-background/50 group-hover:border-primary/50'
          )}
        >
          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
        </div>
      </div>

      {/* Preview */}
      <div 
        onClick={handleToggle}
        className="aspect-video bg-muted/20 rounded-t-lg relative overflow-hidden cursor-pointer"
      >
        {capture.type === 'screenshot' ? (
          capture.url ? (
            <img
              src={capture.url}
              alt={capture.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : capture.thumbnail ? (
            <img
              src={capture.thumbnail}
              alt={capture.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-muted-foreground opacity-30" />
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-pink-500/20">
            <Mic className="w-12 h-12 text-purple-400" />
          </div>
        )}
        
        {/* Error Overlay */}
        {hasError && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <h3 className="text-sm font-medium text-foreground truncate">
          {capture.name}
        </h3>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatBytes(capture.size)}</span>
          <span>{formatDate(typeof capture.timestamp === 'number' ? capture.timestamp : capture.timestamp.getTime())}</span>
        </div>
        
        {/* Recording Duration */}
        {(capture.type === 'recording' || capture.type === 'audio') && capture.duration && (
          <div className="text-xs text-purple-400 flex items-center gap-1">
            <Mic className="w-3 h-3" />
            <span>{formatDuration(capture.duration)}</span>
          </div>
        )}
        
        {/* Error Message */}
        {hasError && (
          <div className="text-xs text-amber-500 bg-amber-500/10 rounded p-2">
            <div className="flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">Upload failed</p>
                <p className="text-amber-600 truncate">{capture.uploadError}</p>
                {capture.retryCount && capture.retryCount > 1 && (
                  <p className="mt-1 text-amber-600">Retried {capture.retryCount} times</p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Retry Button */}
        {isLocal && onRetry && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="w-full px-3 py-1.5 text-xs bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3 h-3" />
            Retry Upload
          </button>
        )}
      </div>
    </div>
  );
}
