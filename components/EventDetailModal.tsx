import React, { useEffect, useRef } from 'react';
import { HistoricalEvent } from '../types';
import { X, ExternalLink, AlertTriangle, ShieldCheck, HelpCircle, MessageSquare, Clock } from 'lucide-react';
import { EventImage } from './EventImage';
import { formatYear } from '../utils';

interface EventDetailModalProps {
  event: HistoricalEvent | null;
  onClose: () => void;
  onAskHistorian: (event: HistoricalEvent) => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({ event, onClose, onAskHistorian }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!event) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [event, onClose]);

  if (!event) return null;

  const ConfidenceIcon = {
    'High': ShieldCheck,
    'Medium': HelpCircle,
    'Low': AlertTriangle
  }[event.confidenceScore] || HelpCircle;

  const confidenceColor = {
    'High': 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    'Medium': 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    'Low': 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  }[event.confidenceScore];

  return (
    <div className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center p-0 md:p-4 bg-ink/60 backdrop-blur-sm" onClick={onClose}>
      <div ref={contentRef} onClick={(e) => e.stopPropagation()} className="bg-paper dark:bg-night-light rounded-t-2xl md:rounded-lg shadow-archive w-full max-w-full md:max-w-2xl h-[95vh] md:h-auto md:max-h-[90vh] overflow-y-auto flex flex-col md:border-manuscript animate-page-turn">

        {/* Banner Image */}
        <div className="w-full h-36 md:h-48 relative shrink-0">
             <EventImage
                query={event.imageQuery || event.title}
                alt={event.title}
                className="w-full h-full"
             />
             <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/30 to-transparent vignette"></div>
             <button onClick={onClose} className="absolute top-3 right-3 md:top-4 md:right-4 p-2 bg-ink/50 hover:bg-ink/70 text-gold rounded-full transition-archival backdrop-blur-sm border border-gold/30 glow-gold min-w-[44px] min-h-[44px] flex items-center justify-center">
                <X className="w-6 h-6" />
             </button>
             {/* Mobile drag handle */}
             <div className="md:hidden absolute top-2 left-1/2 -translate-x-1/2">
               <div className="w-10 h-1 bg-white/40 rounded-full" />
             </div>
             <div className="absolute bottom-3 left-4 md:bottom-4 md:left-6 text-white">
                <span className="inline-block text-[10px] md:text-xs font-bold tracking-widest uppercase bg-gradient-to-r from-gold to-gold-dark px-2 md:px-3 py-0.5 md:py-1 rounded text-ink mb-1 md:mb-2 shadow-lg font-antique">
                   [{formatYear(event.year)}] • {event.category}
                </span>
                <h2 className="text-2xl md:text-3xl font-dramatic font-bold leading-none drop-shadow-lg">{event.title}</h2>
             </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-6 space-y-5 md:space-y-6 relative">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] dark:bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] opacity-30 dark:opacity-10 pointer-events-none"></div>

          {/* Summary */}
          <div className="prose prose-stone dark:prose-invert first-letter:text-4xl first-letter:font-display first-letter:text-gold first-letter:float-left first-letter:mr-3 first-letter:leading-none relative z-10 animate-ink-fade">
             <p className="text-lg leading-relaxed text-sepia dark:text-stone-300 font-elegant">{event.summary}</p>
          </div>

          {/* Action: Ask Historian */}
          <button
            onClick={() => onAskHistorian(event)}
            className="relative z-10 w-full py-3 bg-ink dark:bg-gold hover:bg-ink-light dark:hover:bg-gold-light text-gold dark:text-ink border border-gold rounded shadow-tome transition-archival flex items-center justify-center gap-2 group glow-gold"
          >
            <MessageSquare className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="font-display font-bold tracking-widest text-sm">Discuss with Historian</span>
          </button>

          {/* Confidence Badge */}
          <div className={`flex items-center gap-3 p-3 rounded border ${confidenceColor}`}>
             <ConfidenceIcon className="w-5 h-5" />
             <div>
                <span className="block font-bold text-sm">Historical Confidence: {event.confidenceScore}</span>
                <span className="text-xs opacity-90">
                   Based on source consensus and documentation availability.
                </span>
             </div>
          </div>

          {/* Out of Range Warning */}
          {event.isOutOfRange && (
            <div className="flex items-center gap-3 p-3 rounded border text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
               <Clock className="w-5 h-5" />
               <div>
                  <span className="block font-bold text-sm">Outside Requested Time Range</span>
                  <span className="text-xs opacity-90">
                     This event falls outside the time period you specified, but may provide relevant context.
                  </span>
               </div>
            </div>
          )}

          {/* Dispute Handling */}
          {event.isDisputed && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg p-5">
              <h3 className="text-red-800 dark:text-red-400 font-bold flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5" />
                Historical Dispute
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                Sources disagree on key details of this event.
              </p>

              <div className="space-y-3">
                 {(event.disputeClaims || []).map((claim, idx) => (
                   <div key={idx} className="bg-white dark:bg-night p-3 rounded border border-red-100 dark:border-red-800 shadow-sm">
                      <p className="text-sm text-ink dark:text-paper mb-2">{claim.summary}</p>
                      <div className="flex gap-2 text-xs text-slate dark:text-paper/60">
                         <span className="font-bold">Sources:</span>
                         {(claim.citations || []).map((c, i) => (
                           <span key={i} className="bg-stone-100 dark:bg-night-lighter px-1 rounded">{c.source}</span>
                         ))}
                      </div>
                   </div>
                 ))}
                 {(!event.disputeClaims || event.disputeClaims.length === 0) && (
                    <p className="text-sm italic text-red-600 dark:text-red-400">Specific dispute claims were not detailed in the summary, but consensus is weak.</p>
                 )}
              </div>
            </div>
          )}

          {/* Citations */}
          <div className="relative z-10">
            <h3 className="font-antique text-sm text-sepia dark:text-stone-400 uppercase tracking-widest mb-3">Encyclopedic Citations</h3>
            <ul className="space-y-2">
              {(event.citations || []).map((cit, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-ink dark:text-paper bg-paper-cream dark:bg-night p-3 rounded border border-gold/20 card-inset">
                  <ExternalLink className="w-4 h-4 mt-0.5 text-gold flex-shrink-0" />
                  <span className="font-elegant">
                    <span className="font-semibold">{cit.source}</span>
                    {cit.url && <a href={cit.url} target="_blank" rel="noreferrer" className="ml-2 text-gold hover:text-gold-light underline transition-colors">Reference</a>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
};
