import React from 'react';
import { Sparkles, Zap, BookOpen, Shuffle, Loader2 } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';

interface GenerationPanelProps {
  region: string;
  mode: 'quick' | 'deep';
  onModeChange: (mode: 'quick' | 'deep') => void;
  onGenerate: () => void;
  onSurpriseMe: () => void;
  isLoading: boolean;
  progress?: { percent: number; message: string } | null;
}

export const GenerationPanel: React.FC<GenerationPanelProps> = ({
  region,
  mode,
  onModeChange,
  onGenerate,
  onSurpriseMe,
  isLoading,
  progress,
}) => {
  const canGenerate = region.trim().length > 0;

  return (
    <FloatingPanel position="bottom-center" width="auto">
      <div className="p-4 flex flex-col md:flex-row items-center gap-4">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-full p-1">
          <button
            onClick={() => onModeChange('quick')}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold
              transition-all duration-200
              ${mode === 'quick'
                ? 'bg-gold text-ink shadow-lg'
                : 'text-ink/60 dark:text-paper/60 hover:text-ink dark:hover:text-paper'
              }
            `}
          >
            <Zap className="w-4 h-4" />
            Quick
          </button>
          <button
            onClick={() => onModeChange('deep')}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold
              transition-all duration-200
              ${mode === 'deep'
                ? 'bg-gold text-ink shadow-lg'
                : 'text-ink/60 dark:text-paper/60 hover:text-ink dark:hover:text-paper'
              }
            `}
          >
            <BookOpen className="w-4 h-4" />
            Deep
          </button>
        </div>

        {/* Generate button */}
        <button
          onClick={onGenerate}
          disabled={!canGenerate || isLoading}
          className={`
            flex items-center gap-2 px-6 py-3 rounded-xl
            font-serif font-bold text-lg
            transition-all duration-300
            ${canGenerate && !isLoading
              ? 'bg-gradient-to-r from-gold-dark via-gold to-gold-light text-ink hover:scale-105 hover:shadow-xl shadow-gold/30'
              : 'bg-ink/20 dark:bg-paper/20 text-ink/40 dark:text-paper/40 cursor-not-allowed'
            }
          `}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {progress ? `${progress.percent}%` : 'Generating...'}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate Timeline
            </>
          )}
        </button>

        {/* Surprise Me button */}
        <button
          onClick={onSurpriseMe}
          disabled={isLoading}
          className="
            flex items-center gap-2 px-4 py-3 rounded-xl
            bg-transparent border-2 border-gold/30 dark:border-gold/20
            text-gold dark:text-gold-light font-bold
            hover:bg-gold/10 hover:border-gold/50
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <Shuffle className="w-5 h-5" />
          Surprise Me
        </button>
      </div>

      {/* Progress bar */}
      {isLoading && progress && (
        <div className="px-4 pb-4">
          <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold-dark to-gold transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-xs text-center mt-2 text-ink/50 dark:text-paper/50">
            {progress.message}
          </p>
        </div>
      )}
    </FloatingPanel>
  );
};

export default GenerationPanel;
