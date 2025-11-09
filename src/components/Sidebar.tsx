import { Files, Image, BookOpen, Settings } from 'lucide-react';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';

const navItems = [
  { id: 'files' as const, icon: Files, label: 'All Notes' },
  { id: 'captures' as const, icon: Image, label: 'Captures' },
  { id: 'sessions' as const, icon: BookOpen, label: 'Sessions' },
  { id: 'settings' as const, icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const { currentView, setCurrentView } = useAppStore();

  return (
    <aside className="w-60 bg-[#0a0a0a] border-r border-[#1f1f1f] flex flex-col shrink-0">
      {/* Logo & Brand */}
      <div className="p-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#2563eb] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Quelo</h1>
            <p className="text-xs text-gray-500">AI Study Assistant</p>
          </div>
        </div>
      </div>

      {/* Recently Opened Section */}
      <div className="flex-1 px-4 pb-4">
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                currentView === item.id
                  ? 'bg-[#1a1a1a] text-white'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-[#151515]'
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* User Profile */}
        <div className="border-t border-[#1f1f1f] p-4">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>Connected to Quelo</span>
              </div>
        </div>
    </aside>
  );
}
