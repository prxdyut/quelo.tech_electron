import { FileIcon, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn, formatBytes, formatDate, getFileIcon } from '@/lib/utils';
import type { FileItem } from '@/types';
import * as Icons from 'lucide-react';
import { useState } from 'react';

interface FileCardProps {
  file: FileItem;
}

export function FileCard({ file }: FileCardProps) {
  const iconName = getFileIcon(file.name);
  const IconComponent = (Icons as any)[iconName] || FileIcon;
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
console.log('Rendering FileCard for file:', file);
  const getStatusConfig = () => {
    switch (file.status) {
      case 'synced':
        return {
          icon: CheckCircle2,
          label: 'Synced',
          color: 'text-green-400',
        };
      case 'syncing':
        return {
          icon: Loader2,
          label: 'Syncing...',
          color: 'text-blue-400',
        };
      case 'error':
        return {
          icon: AlertCircle,
          label: 'Error',
          color: 'text-red-400',
        };
      default:
        return {
          icon: Clock,
          label: 'Pending',
          color: 'text-gray-400',
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl overflow-hidden hover:border-[#2a2a2a] transition-all group cursor-pointer">
      {/* Preview Image */}
      {file.preview && (
        <div className="w-full h-40 bg-[#1a1a1a] overflow-hidden relative">
          {/* Loading Skeleton */}
          {imageLoading && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
            </div>
          )}
          {/* Actual Image */}
          <img 
            src={file.preview} 
            alt={file.name}
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
          {/* Error State - show file icon if preview fails */}
          {imageError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <FileIcon className="w-12 h-12 text-gray-600 opacity-30" />
            </div>
          )}
        </div>
      )}
      
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-blue-400 shrink-0">
            <IconComponent className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
              {file.name}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {formatBytes(file.size)}
            </p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[#1f1f1f] flex items-center justify-between">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(file.modifiedTime)}
          </span>

          <span className={cn('text-xs flex items-center gap-1', statusConfig.color)}>
            <StatusIcon className={cn('w-3 h-3', file.status === 'syncing' && 'animate-spin')} />
            {statusConfig.label}
          </span>
        </div>

        {file.uploadProgress !== undefined && file.status === 'syncing' && (
          <div className="mt-3">
            <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${file.uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1 text-right">
              {file.uploadProgress}%
            </p>
          </div>
        )}

        {file.error && (
          <div className="mt-3 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
            {file.error}
          </div>
        )}
      </div>
    </div>
  );
}

