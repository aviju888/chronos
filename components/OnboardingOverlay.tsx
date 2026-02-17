import React, { useState, useEffect } from 'react';
import { X, MapPin, Clock, Sparkles, MessageCircle, Archive, ChevronRight } from 'lucide-react';

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ElementType;
  highlight?: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Welcome to Chronos',
    description: 'Explore history like never before. Generate AI-powered timelines for any region or era.',
    icon: Sparkles,
  },
  {
    title: 'Choose Your Region',
    description: 'Select from preset regions, type any location, or click directly on the map to pick coordinates.',
    icon: MapPin,
    highlight: 'region',
  },
  {
    title: 'Set the Time Period',
    description: 'Define your date range, or let the AI suggest the most significant period for your region.',
    icon: Clock,
    highlight: 'timeRange',
  },
  {
    title: 'Ask the Historian',
    description: 'Have questions? Chat with our AI historian for deeper insights about any event or era.',
    icon: MessageCircle,
    highlight: 'chat',
  },
  {
    title: 'Save Your Archives',
    description: 'Your timelines are automatically saved. Access them anytime from the sidebar.',
    icon: Archive,
    highlight: 'sidebar',
  },
];

const ONBOARDING_KEY = 'chronos_onboarding_completed';

interface OnboardingOverlayProps {
  onComplete: () => void;
  forceShow?: boolean;
}

export const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ onComplete, forceShow = false }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if onboarding was already completed
    if (forceShow) {
      setIsVisible(true);
      return;
    }

    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      // Small delay before showing to let the page load
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, [forceShow]);

  // Close on Escape key
  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setIsVisible(false);
    onComplete();
  };

  if (!isVisible) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const Icon = step.icon;
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Modal */}
      <div className="relative bg-paper dark:bg-night-light rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header decoration */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-dark via-gold to-gold-dark" />

        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-ink dark:hover:text-paper transition-colors rounded-full hover:bg-stone-100 dark:hover:bg-night"
          aria-label="Skip onboarding"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-8 text-center">
          {/* Icon */}
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-gold/20 to-gold-dark/20 flex items-center justify-center">
            <Icon className="w-8 h-8 text-gold-dark" />
          </div>

          {/* Title */}
          <h2 className="font-display text-2xl font-bold text-ink dark:text-paper mb-3">
            {step.title}
          </h2>

          {/* Description */}
          <p className="text-stone-600 dark:text-stone-400 font-serif leading-relaxed mb-8">
            {step.description}
          </p>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-6">
            {ONBOARDING_STEPS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentStep
                    ? 'bg-gold w-6'
                    : idx < currentStep
                    ? 'bg-gold-dark'
                    : 'bg-stone-300'
                }`}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-center">
            {!isLastStep && (
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-sm font-medium text-stone-500 hover:text-ink transition-colors"
              >
                Skip Tour
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-ink dark:bg-gold text-paper dark:text-ink font-bold text-sm rounded-full hover:bg-ink-light dark:hover:bg-gold-light transition-colors flex items-center gap-2 shadow-md"
            >
              {isLastStep ? "Get Started" : "Next"}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step indicator */}
        <div className="bg-stone-100 dark:bg-night px-8 py-3 text-center text-xs text-stone-500 dark:text-stone-400 font-mono">
          Step {currentStep + 1} of {ONBOARDING_STEPS.length}
        </div>
      </div>
    </div>
  );
};

// Hook to check if onboarding should be shown
export const useOnboarding = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      setShowOnboarding(true);
    }
  }, []);

  const resetOnboarding = () => {
    localStorage.removeItem(ONBOARDING_KEY);
    setShowOnboarding(true);
  };

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  };

  return { showOnboarding, resetOnboarding, completeOnboarding };
};
