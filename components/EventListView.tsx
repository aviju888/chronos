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
    <div className="p-6 bg-paper h-full flex flex-col">
       <div className="mb-6 space-y-4 border-b border-stone-200 pb-6">
         <h2 className="text-2xl font-display font-bold text-ink">Historical Archives</h2>
         
         <div className="flex flex-col md:flex-row gap-4">
           <div className="relative flex-1">
             <Search className="absolute left-3 top-3 w-5 h-5 text-stone-400" />
             <input
               type="text"
               placeholder="Search archives..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full pl-10 pr-4 py-2 border border-stone-300 rounded bg-white focus:outline-none focus:border-gold"
             />
           </div>
           
           <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
              <select 
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 border border-stone-300 rounded bg-white text-sm font-bold text-slate focus:outline-none"
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <button
                onClick={() => setShowDisputedOnly(!showDisputedOnly)}
                className={`px-4 py-2 rounded border text-sm font-bold flex items-center gap-2 transition-colors ${
                  showDisputedOnly 
                    ? 'bg-red-50 border-red-300 text-red-700' 
                    : 'bg-white border-stone-300 text-slate hover:bg-stone-50'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Disputed Only
              </button>
           </div>
         </div>
       </div>

       <div className="flex-1 overflow-y-auto pr-2 space-y-3">
         {filteredEvents.length === 0 ? (
           <div className="text-center py-20 text-stone-400">
             <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
             <p className="font-serif">No records found matching your criteria.</p>
           </div>
         ) : (
           filteredEvents.map(evt => (
             <div 
               key={evt.id}
               onClick={() => onEventClick(evt)}
               className="flex gap-4 p-4 bg-white rounded border border-stone-200 hover:border-gold hover:shadow-md cursor-pointer group transition-all"
             >
               {/* Image Thumbnail */}
               <div className="hidden sm:block w-32 h-32 flex-shrink-0 rounded border border-stone-200 overflow-hidden relative group-hover:scale-105 transition-transform">
                  <EventImage 
                    query={evt.imageQuery || evt.title} 
                    alt={evt.title} 
                    className="w-full h-full"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
               </div>

               <div className="w-16 flex-shrink-0 flex flex-col items-center justify-center border-r border-stone-100 pr-4 sm:hidden">
                 <span className="text-lg font-bold text-gold-dark font-display">{formatYear(evt.year)}</span>
               </div>
               
               <div className="flex-1 flex flex-col">
                 <div className="flex justify-between items-start">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                           <span className="hidden sm:inline-block text-gold-dark font-display font-bold text-lg">{formatYear(evt.year)}</span>
                           <span className="text-xs uppercase tracking-wider font-bold text-slate bg-stone-100 px-2 py-0.5 rounded">
                               {evt.category}
                           </span>
                           {evt.isOutOfRange && (
                               <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                                   <Clock className="w-3 h-3" /> Out of Range
                               </span>
                           )}
                           {evt.isDisputed && (
                               <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
                                   <AlertTriangle className="w-3 h-3" /> Disputed
                               </span>
                           )}
                        </div>
                        <h3 className="font-serif font-bold text-ink text-xl group-hover:text-gold-dark transition-colors">{evt.title}</h3>
                    </div>
                 </div>
                 
                 <p className="text-slate text-sm leading-relaxed line-clamp-2 my-2">{evt.summary}</p>
                 
                 <div className="mt-auto flex items-center justify-between pt-2">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-stone-400 flex items-center gap-1 bg-stone-50 px-2 py-1 rounded">
                           <Book className="w-3 h-3" />
                           {evt.citations.length} Citation{evt.citations.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <button className="text-xs font-bold uppercase tracking-wider text-gold-dark flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        View Details <ChevronRight className="w-3 h-3" />
                    </button>
                 </div>
               </div>
             </div>
           ))
         )}
       </div>
    </div>
  );
};
