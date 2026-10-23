import { lazy, Suspense, useState } from 'react';
import { DotMap, type DotMapProps } from './DotMap';

const GeographicMap = lazy(() => import('./GeographicMap'));
export function InvestigationMap(props: DotMapProps) {
  const [style, setStyle] = useState<'dots' | 'map'>(() => {
    try { return localStorage.getItem('chronos-modern-map') === 'map' ? 'map' : 'dots'; } catch { return 'dots'; }
  });
  return <div>
    <div role="group" aria-label="Map style" className="mb-2 flex w-fit gap-1 rounded-control bg-inset p-1">
      {(['dots', 'map'] as const).map(value => <button key={value} type="button" aria-pressed={style === value}
        onClick={() => { setStyle(value); props.onHover?.(null); try { localStorage.setItem('chronos-modern-map', value); } catch { /* Session choice still works. */ } }}
        className={`press min-h-11 rounded-control px-3 text-[12px] sm:min-h-8 ${style === value ? 'bg-surface text-ink shadow-btn' : 'text-ink-3 hover:text-ink'}`}>
        {value === 'dots' ? 'Dots' : 'Map'}
      </button>)}
    </div>
    {style === 'dots' ? <DotMap {...props} /> : <Suspense fallback={<div role="status" className="grid min-h-[260px] place-items-center text-[13px] text-ink-3">Loading map…</div>}><GeographicMap key={props.resetKey} {...props} /></Suspense>}
  </div>;
}
