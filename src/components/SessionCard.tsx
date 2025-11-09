import { BookOpen, Hash, Calendar } from 'lucide-react';
import type { Session } from '@/types';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';

interface SessionCardProps {
  session: Session;
  onClick?: (session: Session) => void;
}

export function SessionCard({ session, onClick }: SessionCardProps) {
  const { currentSession } = useAppStore();
  const isCurrentSession = currentSession?.sessionId === session.sessionId;
  console.log('Rendering SessionCard for session:', session.sessionId, 'Is current session:', isCurrentSession, currentSession);

  const startDate = new Date(session.startTime);
  const endDate = session.endTime ? new Date(session.endTime) : null;
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadgeColor = (status: 'active' | 'ended') => {
    return status === 'active'
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const getStatusText = (status: 'active' | 'ended') => {
    return status === 'active' ? 'Active' : 'Ended';
  };

  return (
    <div
      onClick={() => onClick?.(session)}
      className="group bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg p-4 hover:border-[#2a2a2a] hover:bg-[#141414] transition-all cursor-pointer"
    >
      {/* Header with Title and Status */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
            {session.title || session.subject}
          </h3>
          <p className="text-xs text-gray-400 mt-1">{session.sessionId}</p>
        </div>
        {isCurrentSession && session.status === 'active' && (
          <div
            className={cn(
              'px-2 py-1 rounded text-xs font-medium border',
              getStatusBadgeColor(session.status)
            )}
          >
            {getStatusText(session.status)}
          </div>
        )}
      </div>

      {/* Subject and Topic */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-xs text-gray-300">{session.subject}</span>
        </div>
        <div className="flex items-center gap-2">
          <Hash className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          <span className="text-xs text-gray-300">{session.topic}</span>
        </div>
      </div>

      {/* Dates */}
      <div className="space-y-2 pt-3 border-t border-[#1f1f1f]">
        <div className="flex items-center gap-2 text-xs">
          <Calendar className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <span className="text-gray-400">Started: {formatDate(startDate)}</span>
        </div>
        {endDate && (
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span className="text-gray-400">Ended: {formatDate(endDate)}</span>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1f1f1f] text-xs text-gray-500">
        <span>ID: {session.userId.slice(0, 8)}...</span>
        <span>
          {new Date(session.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </div>
  );
}
