import React from 'react';
import { Calendar, Clock } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
import { formatYear } from '../../utils';

interface TimeRangePanelProps {
  startYear: number;
  endYear: number;
  onStartYearChange: (year: number) => void;
  onEndYearChange: (year: number) => void;
}

// Quick presets for common historical periods
const PRESETS = [
  { label: 'Ancient', start: -3000, end: 500 },
  { label: 'Medieval', start: 500, end: 1500 },
  { label: 'Modern', start: 1500, end: 2000 },
  { label: 'Recent', start: 1900, end: 2025 },
];

export const TimeRangePanel: React.FC<TimeRangePanelProps> = ({
  startYear,
  endYear,
  onStartYearChange,
  onEndYearChange,
}) => {
  const handlePresetClick = (start: number, end: number) => {
    onStartYearChange(start);
    onEndYearChange(end);
  };

  return (
    <FloatingPanel position="top-right" width="sm">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 text-gold dark:text-gold-light">
          <Calendar className="w-5 h-5" />
          <h3 className="font-serif font-bold text-lg">Time Period</h3>
        </div>

        {/* Year inputs */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs text-ink/60 dark:text-paper/60 mb-1 uppercase tracking-wide">
              From
            </label>
            <input
              type="number"
              value={startYear}
              onChange={(e) => onStartYearChange(parseInt(e.target.value) || 0)}
              className="
                w-full px-3 py-2
                bg-white/50 dark:bg-night-light/50
                border border-gold/30 dark:border-gold/20
                rounded-lg
                text-ink dark:text-paper text-center font-mono
                focus:outline-none focus:ring-2 focus:ring-gold/50
              "
            />
            <div className="text-xs text-center mt-1 text-ink/50 dark:text-paper/50">
              {formatYear(startYear)}
            </div>
          </div>

          <div className="text-gold/50 dark:text-gold/30 pt-4">
            <Clock className="w-4 h-4" />
          </div>

          <div className="flex-1">
            <label className="block text-xs text-ink/60 dark:text-paper/60 mb-1 uppercase tracking-wide">
              To
            </label>
            <input
              type="number"
              value={endYear}
              onChange={(e) => onEndYearChange(parseInt(e.target.value) || 0)}
              className="
                w-full px-3 py-2
                bg-white/50 dark:bg-night-light/50
                border border-gold/30 dark:border-gold/20
                rounded-lg
                text-ink dark:text-paper text-center font-mono
                focus:outline-none focus:ring-2 focus:ring-gold/50
              "
            />
            <div className="text-xs text-center mt-1 text-ink/50 dark:text-paper/50">
              {formatYear(endYear)}
            </div>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset.start, preset.end)}
              className={`
                px-3 py-1.5 text-xs font-bold uppercase tracking-wide
                rounded-full border transition-all
                ${startYear === preset.start && endYear === preset.end
                  ? 'bg-gold text-ink border-gold'
                  : 'bg-transparent text-gold dark:text-gold-light border-gold/30 hover:border-gold/60 hover:bg-gold/10'
                }
              `}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </FloatingPanel>
  );
};

export default TimeRangePanel;
