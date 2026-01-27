import React from 'react';
import { HistoricalEvent } from '../types';
import { X, ExternalLink, AlertTriangle, ShieldCheck, HelpCircle, MessageSquare } from 'lucide-react';
import { EventImage } from './EventImage';

interface EventDetailModalProps {
  event: HistoricalEvent | null;
  onClose: () => void;
  onAskHistorian: (event: HistoricalEvent) => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({ event, onClose, onAskHistorian }) => {
  if (!event) return null;

  const ConfidenceIcon = {
    'High': ShieldCheck,
    'Medium': HelpCircle,
    'Low': AlertTriangle
  }[event.confidenceScore] || HelpCircle;

  const confidenceColor = {
    'High': 'text-green-600 bg-green-50 border-green-200',
    'Medium': 'text-yellow-600 bg-yellow-50 border-yellow-200',
    'Low': 'text-red-600 bg-red-50 border-red-200',
  }[event.confidenceScore];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col border border-stone-300">
        
        {/* Banner Image */}
        <div className="w-full h-48 relative shrink-0">
             <EventImage 
                query={event.imageQuery || event.title} 
                alt={event.title} 
                className="w-full h-full"
             />
             <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
             <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/30 hover:bg-black/50 text-white rounded-full transition-colors backdrop-blur-sm">
                <X className="w-6 h-6" />
             </button>
             <div className="absolute bottom-4 left-6 text-white">
                <span className="inline-block text-xs font-bold tracking-wider uppercase bg-gold px-2 py-0.5 rounded text-ink mb-2 shadow-sm">
                   {event.year} • {event.category}
                </span>
                <h2 className="text-3xl font-serif font-bold leading-none shadow-black drop-shadow-md">{event.title}</h2>
             </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {/* Summary */}
          <div className="prose prose-stone first-letter:text-3xl first-letter:font-serif first-letter:text-gold first-letter:float-left first-letter:mr-2">
             <p className="text-lg leading-relaxed">{event.summary}</p>
          </div>

          {/* Action: Ask Historian */}
          <button 
            onClick={() => onAskHistorian(event)}
            className="w-full py-3 bg-ink hover:bg-ink-light text-gold border border-gold rounded shadow-md transition-all flex items-center justify-center gap-2 group"
          >
            <MessageSquare className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="font-display font-bold tracking-wide">Discuss this Event with Historian</span>
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

          {/* Dispute Handling */}
          {event.isDisputed && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-5">
              <h3 className="text-red-800 font-bold flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5" />
                Historical Dispute
              </h3>
              <p className="text-sm text-red-700 mb-4">
                Sources disagree on key details of this event.
              </p>
              
              <div className="space-y-3">
                 {(event.disputeClaims || []).map((claim, idx) => (
                   <div key={idx} className="bg-white p-3 rounded border border-red-100 shadow-sm">
                      <p className="text-sm text-ink mb-2">{claim.summary}</p>
                      <div className="flex gap-2 text-xs text-slate">
                         <span className="font-bold">Sources:</span>
                         {(claim.citations || []).map((c, i) => (
                           <span key={i} className="bg-stone-100 px-1 rounded">{c.source}</span>
                         ))}
                      </div>
                   </div>
                 ))}
                 {(!event.disputeClaims || event.disputeClaims.length === 0) && (
                    <p className="text-sm italic text-red-600">Specific dispute claims were not detailed in the summary, but consensus is weak.</p>
                 )}
              </div>
            </div>
          )}

          {/* Citations */}
          <div>
            <h3 className="font-bold text-sm text-slate uppercase tracking-wider mb-3">Encyclopedic Citations</h3>
            <ul className="space-y-2">
              {(event.citations || []).map((cit, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-ink bg-stone-50 p-2 rounded">
                  <ExternalLink className="w-4 h-4 mt-0.5 text-gold-dark flex-shrink-0" />
                  <span>
                    <span className="font-semibold">{cit.source}</span>
                    {cit.url && <a href={cit.url} target="_blank" rel="noreferrer" className="ml-2 text-gold-dark underline">Reference Link</a>}
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
