import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store';

export function UploadProgressDialog() {
  const { uploadProgress, setUploadProgress } = useAppStore();

  if (!uploadProgress) return null;

  const handleClose = () => {
    if (uploadProgress.success || uploadProgress.error) {
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="glass rounded-xl shadow-glass max-w-lg w-full p-6 border border-border/50 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Uploading File</h2>
          {(uploadProgress.success || uploadProgress.error) && (
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          {/* File name */}
          <div className="flex justify-between text-sm">
            <span className="font-medium text-foreground truncate">
              {uploadProgress.fileName}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              {uploadProgress.status}
            </span>
          </div>

          {/* Upload Progress */}
          {!uploadProgress.success && !uploadProgress.error && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>Upload Progress</span>
                <span>{uploadProgress.percent}%</span>
              </div>
              <div className="w-full rounded-full h-2 bg-background/50 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out relative overflow-hidden"
                  style={{ width: `${uploadProgress.percent}%` }}
                >
                  <div className="absolute inset-0 shimmer" />
                </div>
              </div>
              {uploadProgress.partInfo && (
                <div className="flex justify-between text-xs text-muted-foreground/70 mt-1">
                  <span>{uploadProgress.partInfo}</span>
                  {uploadProgress.bytes && <span>{uploadProgress.bytes}</span>}
                </div>
              )}
            </div>
          )}

          {/* Preprocessing Progress */}
          {uploadProgress.preprocessProgress !== undefined && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>Processing Document</span>
                <span>{uploadProgress.preprocessProgress}%</span>
              </div>
              <div className="w-full rounded-full h-2 bg-background/50 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 ease-out relative overflow-hidden"
                  style={{ width: `${uploadProgress.preprocessProgress}%` }}
                >
                  <div className="absolute inset-0 shimmer" />
                </div>
              </div>
              {uploadProgress.preprocessPageInfo && (
                <div className="text-xs text-muted-foreground/70 mt-1">
                  {uploadProgress.preprocessPageInfo}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {uploadProgress.error && (
            <div className="glass rounded-lg p-3 border border-destructive/30 bg-destructive/10 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{uploadProgress.error}</p>
            </div>
          )}

          {/* Success */}
          {uploadProgress.success && (
            <div className="glass rounded-lg p-3 border border-green-500/30 bg-green-500/10 flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-green-400">Upload completed successfully!</p>
                {uploadProgress.noteId && (
                  <p className="text-xs text-green-400/70 font-mono mt-1">
                    Note ID: {uploadProgress.noteId}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {!uploadProgress.success && !uploadProgress.error && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Uploading...</span>
            </div>
          )}
        </div>

        {/* Close button */}
        {(uploadProgress.success || uploadProgress.error) && (
          <div className="mt-6">
            <button
              onClick={handleClose}
              className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-all text-sm font-medium"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
