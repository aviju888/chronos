import React, { useState, useMemo } from 'react';
import { HistoricalEvent, EventCategory, RelevanceType } from '../types';
import { Search, AlertTriangle, Book, Filter, ChevronRight, ChevronDown, Clock, MapPin, Globe, Compass } from 'lucide-react';
import { EventImage } from './EventImage';
import { formatYear } from '../utils';

interface EventListViewProps {
  events: HistoricalEvent[];
  onEventClick: (event: HistoricalEvent) => void;
}

// Relevance group configuration
const relevanceGroups = {
  direct: {
    title: 'Local History',
    description: 'Events that happened at this location',
    icon: MapPin,
    defaultExpanded: true
  },
  regional: {
    title: 'Regional Events',
    description: 'Events in the surrounding area',
    icon: Compass,
    defaultExpanded: false
  },
  contextual: {
    title: 'Historical Context',
    description: 'Broader events that shaped history',
    icon: Globe,
    defaultExpanded: false
  }
};

export const EventListView: React.FC<EventListViewProps> = ({ events, onEventClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showDisputedOnly, setShowDisputedOnly] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    direct: true,
    regional: false,
    contextual: false
  });

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const matchesSearch = e.title.toLowerCase().includes(searchTerm.toLowerCase()) || e.summary.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || e.category === selectedCategory;
      const matchesDispute = showDisputedOnly ? e.isDisputed : true;
      return matchesSearch && matchesCategory && matchesDispute;
    }).sort((a, b) => a.year - b.year);
  }, [events, searchTerm, selectedCategory, showDisputedOnly]);

  // Group events by relevance type
  const groupedEvents = useMemo(() => {
    const groups: Record<string, HistoricalEvent[]> = {
      direct: [],
      regional: [],
      contextual: []
    };

    filteredEvents.forEach(event => {
      const relevance = event.relevanceType || 'direct';
      if (groups[relevance]) {
        groups[relevance].push(event);
      } else {
        groups.direct.push(event); // Default to direct if unknown
      }
    });

    return groups;
  }, [filteredEvents]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const categories = ['All', ...Object.values(EventCategory)];

  // Check if we have any relevance-typed events
  const hasRelevanceData = events.some(e => e.relevanceType);

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

       <div className="flex-1 overflow-y-auto pr-2 space-y-4 relative z-10">
         {filteredEvents.length === 0 ? (
           <div className="text-center py-20 text-sepia dark:text-stone-500">
             <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
             <p className="font-elegant italic">No records found matching your criteria.</p>
           </div>
         ) : hasRelevanceData ? (
           // Grouped view with expandable sections
           Object.entries(relevanceGroups).map(([key, group]) => {
             const groupEvents = groupedEvents[key] || [];
             if (groupEvents.length === 0) return null;

             const Icon = group.icon;
             const isExpanded = expandedGroups[key];

             return (
               <div key={key} className="border border-gold/20 dark:border-gold/30 rounded-lg overflow-hidden">
                 {/* Group Header */}
                 <button
                   onClick={() => toggleGroup(key)}
                   className="w-full flex items-center justify-between p-4 bg-paper-cream dark:bg-night-light hover:bg-gold/5 dark:hover:bg-gold/10 transition-colors"
                 >
                   <div className="flex items-center gap-3">
                     <Icon className="w-5 h-5 text-gold" />
                     <div className="text-left">
                       <h3 className="font-display font-bold text-ink dark:text-paper">{group.title}</h3>
                       <p className="text-xs text-sepia dark:text-stone-400 font-elegant">{group.description}</p>
                     </div>
                   </div>
                   <div className="flex items-center gap-2">
                     <span className="text-sm font-antique text-gold bg-gold/10 dark:bg-gold/20 px-2 py-0.5 rounded">
                       {groupEvents.length} event{groupEvents.length !== 1 ? 's' : ''}
                     </span>
                     {isExpanded ? (
                       <ChevronDown className="w-5 h-5 text-gold" />
                     ) : (
                       <ChevronRight className="w-5 h-5 text-gold" />
                     )}
                   </div>
                 </button>

                 {/* Group Events */}
                 {isExpanded && (
                   <div className="border-t border-gold/20 dark:border-gold/30 p-3 space-y-3 bg-paper dark:bg-night">
                     {groupEvents.map(evt => (
                       <EventCard key={evt.id} event={evt} onEventClick={onEventClick} />
                     ))}
                   </div>
                 )}
               </div>
             );
           })
         ) : (
           // Flat view for events without relevance data
           filteredEvents.map(evt => (
             <EventCard key={evt.id} event={evt} onEventClick={onEventClick} />
           ))
         )}
       </div>
    </div>
  );
};

// Extracted EventCard component for reusability
const EventCard: React.FC<{ event: HistoricalEvent; onEventClick: (event: HistoricalEvent) => void }> = ({ event: evt, onEventClick }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={() => onEventClick(evt)}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEventClick(evt); } }}
    className="flex gap-4 p-4 bg-paper-cream dark:bg-night-light rounded border border-gold/20 dark:border-gold/30 hover:border-gold shadow-tome hover-lift cursor-pointer group transition-archival focus:outline-none focus:ring-2 focus:ring-gold/50"
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
            {/* Relevance Type Badge */}
            {evt.relevanceType && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-1 ${
                evt.relevanceType === 'direct'
                  ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800'
                  : evt.relevanceType === 'regional'
                  ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                  : 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800'
              }`}>
                {evt.relevanceType === 'direct' && <MapPin className="w-3 h-3" />}
                {evt.relevanceType === 'regional' && <Compass className="w-3 h-3" />}
                {evt.relevanceType === 'contextual' && <Globe className="w-3 h-3" />}
                {evt.relevanceType}
              </span>
            )}
          </div>
          <h3 className="font-dramatic font-bold text-ink dark:text-paper text-xl group-hover:text-gold transition-colors">{evt.title}</h3>
        </div>
      </div>

      <p className="text-sepia dark:text-stone-400 text-sm leading-relaxed line-clamp-4 my-2 font-elegant">{evt.summary}</p>

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
);
