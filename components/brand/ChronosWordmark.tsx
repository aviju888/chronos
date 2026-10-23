import './wordmark.css';

/** The canonical Chronos identity; scale it without changing its letterforms. */
export function ChronosWordmark({ size = 'hero', onDark = false }: { size?: 'hero' | 'compact' | 'inline'; onDark?: boolean }) {
  return <span className={`chronos-wordmark chronos-wordmark--${size}${onDark ? ' chronos-wordmark--on-dark' : ''}`}>Chronos</span>;
}
