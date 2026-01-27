import React from 'react';
import { TimelineData } from '../types';
import { Clock, Plus, Trash2, Scroll } from 'lucide-react';

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
        <button 
          onClick={onToggle}
          className="fixed left-0 top-24 bg-ink text-gold border-r border-y border-gold p-2 rounded-r-md z-40 shadow-lg hover:bg-ink-light transition-all"
        >
          <Scroll className="w-5 h-5" />
        </button>
      )}

      {/* Sidebar Drawer */}
      <div className={`fixed left-0 top-0 bottom-0 w-80 bg-ink-light border-r-2 border-gold z-50 transform transition-transform duration-300 shadow-2xl flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        <div className="p-4 bg-ink border-b border-gold-dark flex justify-between items-center">
          <h2 className="text-gold font-display font-bold text-lg flex items-center gap-2">
            <Scroll className="w-5 h-5" />
            Archives
          </h2>
          <button onClick={onToggle} className="text-stone-400 hover:text-white">
            ×
          </button>
        </div>

        <div className="p-4">
          <button 
            onClick={() => { onNew(); if(window.innerWidth < 768) onToggle(); }}
            className="w-full py-3 border border-gold/50 text-gold rounded hover:bg-gold/10 hover:border-gold transition-colors flex items-center justify-center gap-2 font-display uppercase tracking-widest text-sm"
          >
            <Plus className="w-4 h-4" /> New Investigation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {timelines.length === 0 && (
             <div className="text-stone-500 text-center text-sm italic py-4">
               No archived timelines found.
             </div>
          )}

          {timelines.sort((a,b) => b.createdAt - a.createdAt).map(t => (
            <div 
              key={t.id}
              className={`relative group rounded border transition-all ${
                activeId === t.id 
                  ? 'bg-paper text-ink border-gold border-l-4 shadow-md' 
                  : 'bg-ink border-stone-700 text-stone-300 hover:bg-stone-800'
              }`}
            >
              <button 
                onClick={() => { onSelect(t.id); if(window.innerWidth < 768) onToggle(); }}
                className="w-full text-left p-3 pr-8"
              >
                <div className="font-serif font-bold text-sm leading-tight mb-1">{t.region}</div>
                <div className="text-xs opacity-70 flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" />
                  {t.timeRange.start} — {t.timeRange.end}
                </div>
                <div className="text-[10px] mt-2 opacity-50 uppercase tracking-wider">
                  {new Date(t.createdAt).toLocaleDateString()}
                </div>
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                className="absolute top-2 right-2 p-1.5 rounded hover:bg-red-900/50 hover:text-red-400 text-stone-600 transition-colors opacity-0 group-hover:opacity-100"
                title="Delete Archive"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        
        <div className="p-3 bg-ink border-t border-gold-dark text-[10px] text-stone-500 text-center font-mono">
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
