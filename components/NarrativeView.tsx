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
      <div className="max-w-4xl mx-auto p-8 bg-paper min-h-full flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <FileText className="w-16 h-16 mx-auto mb-4 text-stone-400" />
          <h3 className="text-xl font-display font-bold text-ink mb-2">No Narrative Available</h3>
          <p className="text-slate text-sm leading-relaxed">
            A historical narrative could not be generated for this timeline.
            Try the Events view to explore individual records.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8 bg-paper min-h-full">
      <div className="bg-white p-12 shadow-sm border border-stone-200">
        <h2 className="text-4xl font-display font-bold text-ink mb-8 text-center border-b pb-6 border-stone-100">Historical Narrative</h2>
        
        <div className="prose prose-lg prose-stone max-w-none font-serif text-slate leading-loose">
          {paragraphs.map((para, idx) => (
            <p key={idx} className="mb-6 first-letter:text-5xl first-letter:font-display first-letter:text-gold first-letter:float-left first-letter:mr-3 first-letter:mt-[-10px]">
              {para}
            </p>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-stone-200 text-center">
             <p className="text-sm text-stone-400 italic">
               Generated based on structured event data. Always verify with primary sources.
             </p>
        </div>
      </div>
    </div>
  );
};
