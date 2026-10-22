import { useEffect, useState } from 'react';
import { Moon, SpeakerHigh, SpeakerSlash, Sun } from '@phosphor-icons/react';
import { ChronosApp } from './components/chronos/ChronosApp';
import { EXAMPLE_QUERIES } from './lib/chronos/examples';
import { getPreferences, setPreferences } from './lib/preferences';
import { previewSfx } from './lib/sfx';
import './styles.css';

export default function App() {
  const [preferences, updatePreferences] = useState(getPreferences);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const next = preferences.theme === 'system' ? media.matches : preferences.theme === 'dark';
      document.documentElement.classList.toggle('dark', next);
      setDark(next);
    };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preferences.theme]);
  const toggleTheme = () => {
    const next = { ...preferences, theme: dark ? 'light' as const : 'dark' as const };
    updatePreferences(next); setPreferences(next);
  };
  const toggleSound = () => {
    const next = { ...preferences, sfx: !preferences.sfx };
    updatePreferences(next); setPreferences(next);
    if (next.sfx) previewSfx('toggle');
  };
  return (
    <div data-project="chronos" className="min-h-dvh bg-page text-ink">
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-page/95 px-4 backdrop-blur-sm sm:px-6">
        <a href="/" className="text-[14px] font-semibold tracking-[-0.025em]">Chronos</a>
        <nav aria-label="Chronos controls" className="flex items-center gap-2">
          <button type="button" onClick={toggleSound} aria-label={preferences.sfx ? 'Turn sound off' : 'Turn sound on'} aria-pressed={preferences.sfx} className="press flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-hover">
            {preferences.sfx ? <SpeakerHigh size={17} /> : <SpeakerSlash size={17} />}
          </button>
          <button type="button" onClick={toggleTheme} aria-label={dark ? 'Use light theme' : 'Use dark theme'} className="press flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-hover">
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <a href="/classic/" className="ml-1 rounded-control px-2 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink">Classic</a>
        </nav>
      </header>
      <main><ChronosApp examples={EXAMPLE_QUERIES} /></main>
    </div>
  );
}
