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
    <div className="p-6 bg-paper dark:bg-night h-full flex flex-col relative">
       <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] dark:bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] opacity-30 dark:opacity-10 pointer-events-none"></div>

       <div className="mb-6 space-y-4 border-b border-gold/30 pb-6 relative z-10">
         <div>
           <h2 className="text-2xl font-display font-bold text-ink dark:text-paper text-embossed tracking-wide">Historical Archives</h2>
           <div className="gold-strip mt-2 w-40"></div>
         </div>

         <div className="flex flex-col md:flex-row gap-4">
           <div className="relative flex-1">
             <Search className="absolute left-3 top-3 w-5 h-5 text-gold" />
             <input
               type="text"
               placeholder="Search archives..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full pl-10 pr-4 py-3 border-2 border-gold/30 rounded bg-paper-cream dark:bg-night-light focus:outline-none focus:border-gold font-elegant text-ink dark:text-paper card-inset placeholder:text-sepia/50 dark:placeholder:text-stone-500"
             />
           </div>

           <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
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

       <div className="flex-1 overflow-y-auto pr-2 space-y-3 relative z-10">
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
               className="flex gap-4 p-4 bg-paper-cream dark:bg-night-light rounded border border-gold/20 dark:border-gold/30 hover:border-gold shadow-tome hover-lift cursor-pointer group transition-archival"
             >
               {/* Image Thumbnail */}
               <div className="hidden sm:block w-32 h-32 flex-shrink-0 rounded border border-gold/20 overflow-hidden relative group-hover:scale-105 transition-transform">
                  <EventImage
                    query={evt.imageQuery || evt.title}
                    alt={evt.title}
                    className="w-full h-full img-sepia"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
               </div>

               <div className="w-16 flex-shrink-0 flex flex-col items-center justify-center border-r border-gold/20 pr-4 sm:hidden">
                 <span className="text-lg font-bold text-gold font-display">{formatYear(evt.year)}</span>
               </div>

               <div className="flex-1 flex flex-col">
                 <div className="flex justify-between items-start">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                           <span className="hidden sm:inline-block text-gold font-antique font-bold text-lg">[{formatYear(evt.year)}]</span>
                           <span className="text-xs uppercase tracking-wider font-bold text-sepia dark:text-stone-400 bg-gold/10 dark:bg-gold/20 px-2 py-0.5 rounded font-antique">
                               {evt.category}
                           </span>
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
                        </div>
                        <h3 className="font-dramatic font-bold text-ink dark:text-paper text-xl group-hover:text-gold transition-colors">{evt.title}</h3>
                    </div>
                 </div>

                 <p className="text-sepia dark:text-stone-400 text-sm leading-relaxed line-clamp-2 my-2 font-elegant">{evt.summary}</p>

                 <div className="mt-auto flex items-center justify-between pt-2">
                    <div className="flex items-center gap-3">
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
