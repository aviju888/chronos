import React from 'react';
import { TimelineData } from '../types';
import { Clock, Plus, Trash2, Scroll } from 'lucide-react';
import { formatYearRange } from '../utils';

interface HistorySidebarProps {
  timelines: TimelineData[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({ 
  timelines, activeId, onSelect, onNew, onDelete, isOpen, onToggle 
}) => {
  return (
    <>
      {/* Tab/Handle to open sidebar */}
      {!isOpen && (
        <div className="fixed left-0 top-24 z-40">
          <button
            onClick={onToggle}
            className="bg-ink text-gold border-r border-y border-gold p-3 rounded-r-md shadow-lg hover:bg-ink-light transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Open Archives"
            aria-label="Open Archives"
          >
            <Scroll className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Sidebar Drawer */}
      <div className={`fixed left-0 top-0 bottom-0 w-80 bg-ink border-r-2 border-gold z-50 transform transition-transform duration-300 shadow-archive flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] opacity-20 pointer-events-none"></div>

        <div className="p-4 bg-ink/80 border-b border-gold/30 flex justify-between items-center relative z-10 backdrop-blur-sm">
          <h2 className="text-gold font-display font-bold text-lg flex items-center gap-2 tracking-widest text-embossed">
            <Scroll className="w-5 h-5" />
            Archives
          </h2>
          <button
            onClick={onToggle}
            className="text-gold/50 hover:text-gold text-2xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close sidebar"
          >
            ×
          </button>
        </div>

        <div className="p-4 relative z-10">
          <button
            onClick={() => { onNew(); if(window.innerWidth < 768) onToggle(); }}
            className="w-full py-3 border-2 border-gold/50 text-gold rounded hover:bg-gold/10 hover:border-gold transition-archival flex items-center justify-center gap-2 font-display uppercase tracking-widest text-sm glow-gold"
          >
            <Plus className="w-4 h-4" /> New Investigation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 relative z-10">
          {timelines.length === 0 && (
             <div className="text-stone-500 text-center text-sm font-elegant italic py-4">
               No archived timelines found.
             </div>
          )}

          {[...timelines].sort((a,b) => b.createdAt - a.createdAt).map(t => (
            <div
              key={t.id}
              className={`relative group rounded border-2 transition-archival ${
                activeId === t.id
                  ? 'bg-paper text-ink border-gold border-l-4 shadow-tome'
                  : 'bg-ink/50 border-gold/20 text-stone-300 hover:bg-ink/80 hover:border-gold/40'
              }`}
            >
              <button
                onClick={() => { onSelect(t.id); if(window.innerWidth < 768) onToggle(); }}
                className="w-full text-left p-3 pr-8"
              >
                <div className="font-dramatic font-bold text-sm leading-tight mb-1">{t.region}</div>
                <div className="text-xs opacity-70 flex items-center gap-1 font-antique">
                  <Clock className="w-3 h-3" />
                  {formatYearRange(t.timeRange.start, t.timeRange.end)}
                </div>
                <div className="text-[10px] mt-2 opacity-50 uppercase tracking-widest font-antique">
                  {new Date(t.createdAt).toLocaleDateString()}
                </div>
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                className="absolute top-2 right-2 p-1.5 rounded hover:bg-crimson/30 hover:text-crimson-light text-stone-600 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Delete Archive"
                aria-label={`Delete ${t.region} archive`}
              >
                <Trash2 className="w-4 h-4 md:w-3 md:h-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 bg-ink/80 border-t border-gold/30 text-[10px] text-gold/50 text-center font-antique tracking-widest relative z-10">
          Chronos Archival System v1.0
        </div>
      </div>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={onToggle}
        />
      )}
    </>
  );
};
