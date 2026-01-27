import React from 'react';
import { FileText } from 'lucide-react';

interface NarrativeViewProps {
  text: string;
}

export const NarrativeView: React.FC<NarrativeViewProps> = ({ text }) => {
  // Simple paragraph splitter for better readability
  const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);

  // Empty state
  if (!text || paragraphs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-8 bg-paper dark:bg-night min-h-full flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <FileText className="w-16 h-16 mx-auto mb-4 text-stone-400 dark:text-stone-600" />
          <h3 className="text-xl font-display font-bold text-ink dark:text-paper mb-2">No Narrative Available</h3>
          <p className="text-slate dark:text-stone-400 text-sm leading-relaxed">
            A historical narrative could not be generated for this timeline.
            Try the Events view to explore individual records.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8 bg-paper dark:bg-night min-h-full relative">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] dark:bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] opacity-30 dark:opacity-10 pointer-events-none"></div>

      <div className="bg-paper-cream dark:bg-night-light p-12 shadow-archive border-manuscript relative z-10 animate-page-turn">
        {/* Decorative header flourish */}
        <div className="text-center mb-8">
          <div className="gold-strip w-24 mx-auto mb-4"></div>
          <h2 className="text-4xl font-display font-bold text-ink dark:text-paper text-embossed tracking-wide animate-ink-fade">Historical Narrative</h2>
          <div className="gold-strip w-24 mx-auto mt-4"></div>
        </div>

        <div className="prose prose-lg prose-stone dark:prose-invert max-w-none font-elegant text-sepia dark:text-stone-300 leading-loose text-justify">
          {paragraphs.map((para, idx) => (
            <p key={idx} className="mb-6 first-letter:text-6xl first-letter:font-display first-letter:text-gold first-letter:float-left first-letter:mr-4 first-letter:mt-[-5px] first-letter:leading-none animate-ink-fade" style={{ animationDelay: `${idx * 0.1}s` }}>
              {para}
            </p>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-gold/30 text-center">
          <div className="gold-strip w-16 mx-auto mb-4"></div>
          <p className="text-sm text-sepia/70 dark:text-stone-500 font-elegant italic">
            Generated based on structured event data. Always verify with primary sources.
          </p>
        </div>
      </div>
    </div>
  );
};
