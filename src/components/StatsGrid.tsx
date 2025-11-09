import { Files, CheckCircle, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/store';

export function StatsGrid() {
  const { stats, filteredFiles } = useAppStore();

  const statCards = [
    {
      label: 'Total Notes',
      value: filteredFiles.length,
      icon: Files,
    },
    {
      label: 'Total Annotations',
      value: stats.syncedFiles,
      icon: CheckCircle,
    },
    {
      label: 'Total Storage Used',
      value: '70.14 MB',
      icon: AlertCircle,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-6">
      {statCards.map((stat) => {
        return (
          <div
            key={stat.label}
            className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl p-6 hover:border-[#2a2a2a] transition-colors"
          >
            <div className="mb-3">
              <span className="text-sm text-gray-400">{stat.label}</span>
            </div>
            <div className="text-3xl font-semibold text-white">
              {stat.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

