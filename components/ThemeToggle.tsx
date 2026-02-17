import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  placement?: 'fixed' | 'inline';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ placement = 'fixed', className = '' }) => {
  const { theme, toggleTheme } = useTheme();
  const placementClasses = placement === 'fixed'
    ? 'fixed top-2 right-2 md:top-20 md:right-4 z-[100]'
    : 'relative z-10';

  return (
    <button
      onClick={toggleTheme}
      className={`${placementClasses} ${className} p-2 md:p-3 min-w-[44px] min-h-[44px] rounded-full bg-ink dark:bg-paper text-gold dark:text-ink shadow-lg hover:scale-110 transition-all duration-300 border-2 border-gold/30 dark:border-ink/30 flex items-center justify-center`}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <Moon className="w-5 h-5" />
      ) : (
        <Sun className="w-5 h-5" />
      )}
    </button>
  );
};
