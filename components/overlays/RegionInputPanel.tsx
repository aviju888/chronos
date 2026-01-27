import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search, X, Sparkles } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
import { getSuggestions } from '../../services/apiService';

interface RegionInputPanelProps {
  selectedRegion: string;
  onRegionChange: (region: string) => void;
  selectedCountry: string | null;
  onClearCountry: () => void;
}

export const RegionInputPanel: React.FC<RegionInputPanelProps> = ({
  selectedRegion,
  onRegionChange,
  selectedCountry,
  onClearCountry,
}) => {
  const [inputValue, setInputValue] = useState(selectedRegion);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync input with selectedRegion prop
  useEffect(() => {
    setInputValue(selectedRegion);
  }, [selectedRegion]);

  // Fetch suggestions when input changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (inputValue.length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoadingSuggestions(true);
      try {
        const results = await getSuggestions(inputValue);
        setSuggestions(results);
        setShowSuggestions(true);
      } catch (err) {
        console.error('Failed to fetch suggestions:', err);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [inputValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    onRegionChange(suggestion);
    setShowSuggestions(false);
  };

  const handleInputBlur = () => {
    // Delay hiding to allow click on suggestions
    setTimeout(() => {
      setShowSuggestions(false);
      if (inputValue !== selectedRegion) {
        onRegionChange(inputValue);
      }
    }, 200);
  };

  return (
    <FloatingPanel position="top-left" width="md">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2 text-gold dark:text-gold-light">
          <MapPin className="w-5 h-5" />
          <h3 className="font-serif font-bold text-lg">Select Region</h3>
        </div>

        {/* Globe selection indicator */}
        {selectedCountry && (
          <div className="flex items-center gap-2 px-3 py-2 bg-gold/10 dark:bg-gold/5 rounded-lg border border-gold/20">
            <Sparkles className="w-4 h-4 text-gold" />
            <span className="text-sm text-ink dark:text-paper font-medium flex-1">
              Selected: {selectedCountry}
            </span>
            <button
              onClick={onClearCountry}
              className="p-1 hover:bg-gold/20 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-ink/50 dark:text-paper/50" />
            </button>
          </div>
        )}

        {/* Search input */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 dark:text-paper/40">
            <Search className="w-5 h-5" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={handleInputBlur}
            placeholder="Search or click on globe..."
            className="
              w-full pl-10 pr-4 py-3
              bg-white/50 dark:bg-night-light/50
              border border-gold/30 dark:border-gold/20
              rounded-xl
              text-ink dark:text-paper
              placeholder:text-ink/40 dark:placeholder:text-paper/40
              focus:outline-none focus:ring-2 focus:ring-gold/50
              transition-all duration-200
            "
          />
          {isLoadingSuggestions && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-4 right-4 top-full mt-1 z-10 bg-paper dark:bg-night-light rounded-xl border border-gold/20 shadow-xl overflow-hidden">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="
                  w-full px-4 py-3 text-left
                  text-ink dark:text-paper
                  hover:bg-gold/10 dark:hover:bg-gold/5
                  transition-colors
                  border-b border-gold/10 last:border-b-0
                "
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Hint */}
        <p className="text-xs text-ink/50 dark:text-paper/50 text-center">
          Click on the globe to explore regions
        </p>
      </div>
    </FloatingPanel>
  );
};

export default RegionInputPanel;
