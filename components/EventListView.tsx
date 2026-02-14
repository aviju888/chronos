import React, { useState, useMemo } from 'react';
import { HistoricalEvent, EventCategory } from '../types';
import { Search, AlertTriangle, Book, Filter, ChevronRight, Clock } from 'lucide-react';
import { EventImage } from './EventImage';
import { formatYear } from '../utils';

interface EventListViewProps {
  events: HistoricalEvent[];
  onEventClick: (event: HistoricalEvent) => void;
}

export const EventListView: React.FC<EventListViewProps> = ({ events, onEventClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showDisputedOnly, setShowDisputedOnly] = useState(false);

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchesSearch = e.title.toLowerCase().includes(searchTerm.toLowerCase()) || e.summary.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || e.category === selectedCategory;
      const matchesDispute = showDisputedOnly ? e.isDisputed : true;
      return matchesSearch && matchesCategory && matchesDispute;
    }).sort((a, b) => a.year - b.year);
  }, [events, searchTerm, selectedCategory, showDisputedOnly]);

  const categories = ['All', ...Object.values(EventCategory)];

  return (
    <div className="px-3 py-3 md:p-6 bg-paper dark:bg-night h-full flex flex-col relative">
       <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] dark:bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] opacity-30 dark:opacity-10 pointer-events-none"></div>

       <div className="mb-3 md:mb-6 space-y-3 md:space-y-4 border-b border-gold/30 pb-3 md:pb-6 relative z-10">
         <div className="hidden md:block">
           <h2 className="text-2xl font-display font-bold text-ink dark:text-paper text-embossed tracking-wide">Historical Archives</h2>
           <div className="gold-strip mt-2 w-40"></div>
         </div>

         {/* Search bar */}
         <div className="relative">
           <Search className="absolute left-3 top-2.5 md:top-3 w-4 h-4 md:w-5 md:h-5 text-gold" />
           <input
             type="text"
             placeholder="Search archives..."
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="w-full pl-9 md:pl-10 pr-4 py-2.5 md:py-3 border-2 border-gold/30 rounded-full md:rounded bg-paper-cream dark:bg-night-light focus:outline-none focus:border-gold font-elegant text-sm md:text-base text-ink dark:text-paper card-inset placeholder:text-sepia/50 dark:placeholder:text-stone-500"
           />
         </div>

         {/* Mobile: horizontal scrolling filter chips */}
         <div className="flex md:hidden gap-2 overflow-x-auto pb-1 scrollbar-none">
           {categories.map(c => (
             <button
               key={c}
               onClick={() => setSelectedCategory(c)}
               className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full border font-bold transition-all flex-shrink-0 ${
                 selectedCategory === c
                   ? 'bg-ink dark:bg-gold text-gold dark:text-ink border-gold'
                   : 'bg-paper-cream dark:bg-night-lighter text-sepia dark:text-stone-400 border-gold/30 active:bg-paper-dark'
               }`}
             >
               {c}
             </button>
           ))}
           <button
             onClick={() => setShowDisputedOnly(!showDisputedOnly)}
             className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full border font-bold transition-all flex-shrink-0 flex items-center gap-1 ${
               showDisputedOnly
                 ? 'bg-crimson/15 border-crimson/50 text-crimson dark:text-crimson-light'
                 : 'bg-paper-cream dark:bg-night-lighter text-sepia dark:text-stone-400 border-gold/30'
             }`}
           >
             <AlertTriangle className="w-3 h-3" />
             Disputed
           </button>
         </div>

         {/* Desktop: dropdown + button */}
         <div className="hidden md:flex gap-4">
           <div className="relative flex-1"></div>
           <div className="flex gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 border-2 border-gold/30 rounded bg-paper-cream dark:bg-night-light text-sm font-bold text-sepia dark:text-paper focus:outline-none focus:border-gold font-antique"
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <button
                onClick={() => setShowDisputedOnly(!showDisputedOnly)}
                className={`px-4 py-2 rounded border-2 text-sm font-bold flex items-center gap-2 transition-archival ${
                  showDisputedOnly
                    ? 'bg-crimson/10 dark:bg-crimson/20 border-crimson/50 text-crimson dark:text-crimson-light'
                    : 'bg-paper-cream dark:bg-night-light border-gold/30 text-sepia dark:text-paper hover:border-gold'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Disputed Only
              </button>
           </div>
         </div>
       </div>

       <div className="flex-1 overflow-y-auto pr-0 md:pr-2 space-y-2 md:space-y-3 relative z-10">
         {filteredEvents.length === 0 ? (
           <div className="text-center py-20 text-sepia dark:text-stone-500">
             <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
             <p className="font-elegant italic">No records found matching your criteria.</p>
           </div>
         ) : (
           filteredEvents.map(evt => (
             <div
               key={evt.id}
               onClick={() => onEventClick(evt)}
               className="flex gap-3 md:gap-4 p-2.5 md:p-4 bg-paper-cream dark:bg-night-light rounded-lg md:rounded border border-gold/20 dark:border-gold/30 md:hover:border-gold shadow-sm md:shadow-tome md:hover-lift cursor-pointer group transition-all active:scale-[0.99]"
             >
               {/* Always-visible thumbnail on mobile */}
               <div className="w-16 h-16 md:w-32 md:h-32 flex-shrink-0 rounded md:rounded border border-gold/20 overflow-hidden relative">
                  <EventImage
                    query={evt.imageQuery || evt.title}
                    alt={evt.title}
                    className="w-full h-full img-sepia"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
               </div>

               <div className="flex-1 flex flex-col min-w-0">
                 {/* Mobile: compact layout */}
                 <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                   <span className="text-xs md:text-lg font-bold text-gold font-antique">{formatYear(evt.year)}</span>
                   <span className="text-[10px] md:text-xs uppercase tracking-wider font-bold text-sepia dark:text-stone-400 bg-gold/10 dark:bg-gold/20 px-1.5 py-0.5 rounded font-antique">
                       {evt.category}
                   </span>
                   {evt.isDisputed && (
                       <AlertTriangle className="w-3 h-3 text-crimson dark:text-crimson-light md:hidden" />
                   )}
                 </div>
                 <h3 className="font-dramatic font-bold text-ink dark:text-paper text-sm md:text-xl group-hover:text-gold transition-colors leading-tight truncate md:whitespace-normal">{evt.title}</h3>

                 <p className="text-sepia dark:text-stone-400 text-xs md:text-sm leading-relaxed line-clamp-1 md:line-clamp-2 mt-0.5 md:my-2 font-elegant">{evt.summary}</p>

                 {/* Desktop-only badges and details */}
                 <div className="hidden md:flex mt-auto items-center justify-between pt-2">
                    <div className="flex items-center gap-3">
                        {evt.isOutOfRange && (
                            <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Out of Range
                            </span>
                        )}
                        {evt.isDisputed && (
                            <span className="text-[10px] font-bold text-crimson dark:text-crimson-light bg-crimson/10 dark:bg-crimson/20 border border-crimson/30 dark:border-crimson/50 px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Disputed
                            </span>
                        )}
                        <span className="text-xs font-bold text-sepia dark:text-stone-500 flex items-center gap-1 bg-gold/10 dark:bg-gold/20 px-2 py-1 rounded font-antique">
                           <Book className="w-3 h-3" />
                           {evt.citations.length} Citation{evt.citations.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <span className="text-xs font-elegant italic text-gold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        View Details <ChevronRight className="w-3 h-3" />
                    </span>
                 </div>
               </div>
             </div>
           ))
         )}
       </div>
    </div>
  );
};
