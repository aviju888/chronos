import { useEffect, useState } from 'react';
import { Moon, SpeakerHigh, SpeakerSlash, Sun } from '@phosphor-icons/react';
import { ChronosApp } from './components/chronos/ChronosApp';
import { ChronosWordmark } from '../components/brand/ChronosWordmark';
import { getPreferences, setPreferences } from './lib/preferences';
import { previewSfx } from './lib/sfx';
import './styles.css';

export default function App() {
  const [preferences, updatePreferences] = useState(getPreferences);
  const [dark, setDark] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
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
    <div data-project="chronos" className="flex min-h-dvh flex-col bg-page text-ink">
      <header className="chronos-header sticky top-0 z-30 flex h-12 items-center justify-end border-b border-line bg-page/95 px-2 backdrop-blur-sm sm:px-6">
        {hasRun && <a href="/" aria-label="Chronos home" className="mr-auto flex min-h-11 items-center"><ChronosWordmark size="compact" /></a>}
        <nav aria-label="Chronos controls" className="flex shrink-0 items-center gap-0 sm:gap-1">
          <div ref={setActionsHost} className="contents" />
          <button type="button" onClick={toggleSound} aria-label={preferences.sfx ? 'Turn sound off' : 'Turn sound on'} aria-pressed={preferences.sfx} className="press flex size-11 items-center justify-center rounded-control text-ink-2 hover:bg-hover sm:size-8">
            {preferences.sfx ? <SpeakerHigh size={17} /> : <SpeakerSlash size={17} />}
          </button>
          <button type="button" onClick={toggleTheme} aria-label={dark ? 'Use light theme' : 'Use dark theme'} className="press flex size-11 items-center justify-center rounded-control text-ink-2 hover:bg-hover sm:size-8">
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </nav>
      </header>
      <main className="flex-1"><ChronosApp onRunChange={setHasRun} headerActionsTarget={actionsHost} /></main>
      <footer className="flex min-h-16 items-center justify-center px-4 pb-[env(safe-area-inset-bottom)]">
        <a href="/classic/" className="inline-flex min-h-11 items-center rounded-control px-3 text-[12px] font-medium text-ink-3 hover:bg-hover hover:text-ink">Chronos Classic</a>
      </footer>
    </div>
  );
}
