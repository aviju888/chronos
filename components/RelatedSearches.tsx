import React, { useMemo } from 'react';
import { Compass, ArrowRight } from 'lucide-react';
import { TimelineData, QueryAnalysis } from '../types';

interface RelatedSearchesProps {
  timeline: TimelineData;
  onSearch: (query: string) => void;
}

// Generate related searches based on timeline data
function generateRelatedSearches(timeline: TimelineData): string[] {
  const related: Set<string> = new Set();
  const { region, events, queryAnalysis } = timeline;

  // Add topics from query analysis if available
  if (queryAnalysis?.topics) {
    queryAnalysis.topics.forEach(topic => related.add(topic));
  }

  // Add broader context if available
  if (queryAnalysis?.broadContext && queryAnalysis.broadContext !== region) {
    related.add(queryAnalysis.broadContext);
  }

  // Extract key figures from events
  const allKeyFigures = events
    .flatMap(e => e.keyFigures || [])
    .filter(Boolean);

  // Get most common figures (mentioned in multiple events)
  const figureCounts: Record<string, number> = {};
  allKeyFigures.forEach(f => {
    figureCounts[f] = (figureCounts[f] || 0) + 1;
  });

  Object.entries(figureCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .forEach(([figure]) => related.add(figure));

  // Extract related locations from events
  const locations = events
    .map(e => e.location?.name)
    .filter((name): name is string => Boolean(name) && name !== region);

  // Get unique nearby locations
  const uniqueLocations = [...new Set(locations)].slice(0, 2);
  uniqueLocations.forEach(loc => related.add(loc));

  // Add related eras/time periods based on the timeline
  const { start, end } = timeline.timeRange;
  const span = end - start;

  // Suggest adjacent time periods
  if (start > -500) {
    // For more recent history, suggest related periods
    if (span < 100) {
      // If viewing a short period, suggest the full era
      related.add(`${region} (Full History)`);
    }
  }

  // Extract categories with many events
  const categoryCounts: Record<string, number> = {};
  events.forEach(e => {
    categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
  });

  const dominantCategory = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0];

  if (dominantCategory && dominantCategory !== 'Other') {
    related.add(`${dominantCategory} History`);
  }

  // Remove the current region from suggestions
  related.delete(region);

  return Array.from(related).slice(0, 6);
}

export const RelatedSearches: React.FC<RelatedSearchesProps> = ({ timeline, onSearch }) => {
  const suggestions = useMemo(() => generateRelatedSearches(timeline), [timeline]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-gold/20 dark:border-gold/30 pt-6 mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Compass className="w-5 h-5 text-gold" />
        <h3 className="font-display font-bold text-ink dark:text-paper text-lg">Continue Exploring</h3>
      </div>

      <p className="text-sm text-sepia dark:text-stone-400 mb-4 font-elegant">
        Discover related histories and topics:
      </p>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSearch(suggestion)}
            className="group flex items-center gap-1.5 px-4 py-2 bg-paper-cream dark:bg-night-light border border-gold/30 hover:border-gold rounded-full text-sm font-elegant text-sepia dark:text-paper hover:text-gold dark:hover:text-gold transition-all hover:shadow-md"
          >
            {suggestion}
            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  );
};
