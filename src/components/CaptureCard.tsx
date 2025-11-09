import { Image as ImageIcon, Mic, RefreshCw, AlertTriangle, Cloud, HardDrive, Loader2 } from 'lucide-react';
import { cn, formatBytes, formatDate, formatDuration } from '@/lib/utils';
import type { Capture } from '@/types';
import { useState } from 'react';
import { toast } from 'sonner';

interface CaptureCardProps {
  capture: Capture;
  onRetry?: () => void;
}

export function CaptureCard({ capture, onRetry }: CaptureCardProps) {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const handleOpenFile = async () => {
    // Only open local files (recordings/audio with path)
    if (capture.path && (capture.type === 'recording' || capture.type === 'audio')) {
      try {
        const result = await window.electronAPI.openFile(capture.path);
        if (!result.success) {
          toast.error(`Failed to open file: ${result.error}`);
        }
      } catch (error) {
        toast.error(`Error opening file: ${(error as Error).message}`);
      }
    }
  };

  const isLocal = capture.source === 'local';
  const isUploading = capture.uploadStatus === 'uploading';
  const hasError = isLocal && capture.uploadError;
  const canOpenFile = capture.path && (capture.type === 'recording' || capture.type === 'audio');

  return (
    <div
      onClick={canOpenFile ? handleOpenFile : undefined}
      className={cn(
        'glass rounded-lg border transition-all group animate-scale-in relative',
        'border-border/50 hover:border-primary/50',
        canOpenFile && 'cursor-pointer',
        hasError && 'border-amber-500/50',
        isUploading && 'border-blue-500/50'
      )}
    >
      {/* Source Badge */}
      <div className="absolute top-2 left-2 z-10">
        {isUploading ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/90 text-white text-xs font-medium">
            <Loader2 className="w-3 h-3 animate-spin" />
            Uploading
          </div>
        ) : isLocal ? (
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

      {/* Preview */}
      <div className="aspect-video bg-muted/20 rounded-t-lg relative overflow-hidden">
        {capture.type === 'screenshot' ? (
          capture.url ? (
            <>
              {/* Loading Skeleton */}
              {imageLoading && !imageError && (
                <div className="absolute inset-0 bg-muted/20 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                </div>
              )}
              {/* Actual Image */}
              <img
                src={capture.url}
                alt={capture.name}
                className={cn(
                  "w-full h-full object-cover transition-opacity duration-200",
                  imageLoading ? "opacity-0" : "opacity-100"
                )}
                loading="lazy"
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageLoading(false);
                  setImageError(true);
                }}
              />
              {/* Error State */}
              {imageError && (
                <div className="absolute inset-0 bg-muted/20 flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground opacity-30" />
                </div>
              )}
            </>
          ) : capture.thumbnail ? (
            <>
              {/* Loading Skeleton */}
              {imageLoading && !imageError && (
                <div className="absolute inset-0 bg-muted/20 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                </div>
              )}
              {/* Actual Image */}
              <img
                src={capture.thumbnail}
                alt={capture.name}
                className={cn(
                  "w-full h-full object-cover transition-opacity duration-200",
                  imageLoading ? "opacity-0" : "opacity-100"
                )}
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageLoading(false);
                  setImageError(true);
                }}
              />
              {/* Error State */}
              {imageError && (
                <div className="absolute inset-0 bg-muted/20 flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground opacity-30" />
                </div>
              )}
            </>
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
        
        {/* Uploading Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        )}
        
        {/* Error Overlay */}
        {hasError && !isUploading && (
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
        
        {/* Uploading Status */}
        {isUploading && (
          <div className="text-xs text-blue-500 bg-blue-500/10 rounded p-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Uploading to server...</span>
            </div>
          </div>
        )}
        
        {/* Error Message */}
        {hasError && !isUploading && (
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
        {isLocal && onRetry && !isUploading && (
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
