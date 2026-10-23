import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Archive as ArchiveIcon, CalendarBlank, DownloadSimple, Shuffle, X } from '@phosphor-icons/react';
import { downloadArchive, readArchives, readClassicArchives, removeArchive, type Archive } from '@/modern/lib/chronos/archives';
import { Tooltip } from './Tooltip';
import { formatRange } from '@/modern/lib/chronos/time';

export const iconToolClass = 'press flex size-11 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-hover disabled:opacity-40 sm:size-8';
export const toolClass = 'press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control px-2 text-[13px] font-medium text-ink-2 hover:bg-hover disabled:opacity-40';
export type DateDraft = { start: string; end: string };

export function DiscoveryControls({ dates, onDates, onSurprise, error, children }: {
  dates: DateDraft; onDates: (v: DateDraft) => void; onSurprise: () => void; error: string | null; children?: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(dates.start || dates.end));
  useEffect(() => { if (error) setOpen(true); }, [error]);
  return <div className="w-full text-left">
    <div className="flex flex-wrap items-center justify-center gap-x-1">
      <button type="button" className={toolClass} aria-expanded={open} onClick={() => setOpen(!open)}><CalendarBlank size={16} />{dates.start || dates.end ? 'Edit dates' : 'Dates'}</button>
      <button type="button" className={toolClass} onClick={onSurprise}><Shuffle size={16} />Surprise me</button>
      {children}
    </div>
    {open && <div className="mt-1 rounded-[14px] border border-line bg-surface p-3">
      <div className="flex items-end gap-2">
        {(['start', 'end'] as const).map(key => <label key={key} className="min-w-0 flex-1 text-[12px] text-ink-2">
          {key === 'start' ? 'Start year' : 'End year'}
          <input type="text" inputMode="text" autoComplete="off" value={dates[key]} aria-invalid={Boolean(error)}
            onChange={e => onDates({ ...dates, [key]: e.target.value })} placeholder={key === 'start' ? '-27' : '476'}
            className="mt-1 h-11 w-full rounded-control border border-line bg-field px-3 text-[16px] text-ink" />
        </label>)}
        <button type="button" className={toolClass} onClick={() => onDates({start: '', end: ''})}>Clear</button>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">Use negative years for BCE. Leave both empty for automatic dates.</p>
    </div>}
    {error && <p role="alert" className="mt-2 text-[13px] text-red">{error}</p>}
  </div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; previous?.focus({preventScroll: true}); };
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={onClose} className="chronos-dialog rounded-t-[20px] border border-line bg-page p-0 text-ink shadow-card sm:rounded-[20px]">
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-page px-4 py-2">
      <h2 className="text-[18px] font-semibold">{title}</h2>
      <button type="button" aria-label={`Close ${title.toLowerCase()}`} className={toolClass} onClick={onClose}><X size={18} /></button>
    </div>
    <div className="p-4 pb-[max(24px,env(safe-area-inset-bottom))]">{children}</div>
  </dialog>;
}

export function ArchivesButton({ onRestore, disabled = false, iconOnly = false }: { onRestore: (a: Archive) => void; disabled?: boolean; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Tooltip content="Archives" side="bottom" disabled={!iconOnly}><button type="button" aria-label="Archives" className={iconOnly ? iconToolClass : toolClass} disabled={disabled} onClick={() => setOpen(true)}><ArchiveIcon size={17} />{!iconOnly && "Archives"}</button></Tooltip>
    {open && <ArchiveList onClose={() => setOpen(false)} onRestore={a => { setOpen(false); onRestore(a); }} />}
  </>;
}

function ArchiveList({ onClose, onRestore }: { onClose: () => void; onRestore: (a: Archive) => void }) {
  const [data, setData] = useState(readArchives);
  const [classic] = useState(readClassicArchives);
  const [confirm, setConfirm] = useState<string | null>(null);
  return <Modal title="Archives" onClose={onClose}>
    <p className="mb-3 text-[13px] text-ink-3">Saved on this browser. Export a copy to keep it elsewhere.</p>
    {data.error && <p role="alert" className="mb-3 text-[13px] text-red">{data.error}</p>}
    {data.items.length === 0 && <p className="py-8 text-center text-[14px] text-ink-2">Your timelines will appear here.</p>}
    <div className="divide-y divide-line">
      {data.items.map(a => <div key={a.id} className="flex items-center gap-1 py-2">
        <button type="button" onClick={() => onRestore(a)} className="min-h-16 min-w-0 flex-1 rounded-control px-2 py-2 text-left hover:bg-hover">
          <span className="block text-[15px] font-medium [overflow-wrap:anywhere]">{a.state.intent?.topic ?? a.state.query}</span>
          <span className="mt-1 block text-[12px] text-ink-3">{a.state.order.length} events · {new Date(a.savedAt).toLocaleDateString()}{a.state.stopped || a.state.status === 'error' ? ' · Partial' : ''}</span>
        </button>
        {confirm === a.id ? <div className="flex flex-col">
          <button type="button" className={`${toolClass} text-red`} onClick={() => { setData(removeArchive(a.id)); setConfirm(null); }}>Remove</button>
          <button type="button" className={toolClass} onClick={() => setConfirm(null)}>Cancel</button>
        </div> : <button type="button" aria-label={`Remove ${a.state.intent?.topic ?? a.state.query}`} className={toolClass} onClick={() => setConfirm(a.id)}><X size={16} /></button>}
      </div>)}
    </div>
    {classic.length > 0 && <section className="mt-5 border-t border-line pt-4">
      <h3 className="mb-2 text-[13px] font-semibold">Classic archives</h3>
      {classic.map(a => <a key={a.id} href={`/classic/#/timeline/${encodeURIComponent(a.id)}/map`} className="flex min-h-11 items-center rounded-control px-2 text-[14px] text-ink-2 hover:bg-hover">{a.title} ↗</a>)}
    </section>}
  </Modal>;
}

export function ExportButton({ archive, iconOnly = false, disabled = false }: { archive: Archive; iconOnly?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const download = (format: 'json' | 'txt') => {
    try { downloadArchive(archive, format); setOpen(false); } catch { setError(true); }
  };
  return <>
    <Tooltip content="Export" side="bottom" disabled={!iconOnly}><button type="button" aria-label="Export" disabled={disabled} className={iconOnly ? iconToolClass : toolClass} onClick={() => {setOpen(true); setError(false);}}><DownloadSimple size={17} />{!iconOnly && "Export"}</button></Tooltip>
    {open && <Modal title="Export timeline" onClose={() => setOpen(false)}>
      <p className="font-medium">{archive.state.intent?.topic ?? archive.state.query}</p>
      {archive.state.intent && <p className="mt-1 text-[13px] text-ink-3">{formatRange(archive.state.intent.range.start, archive.state.intent.range.end)}</p>}
      <div className="mt-4 flex flex-col gap-2">
        <button type="button" className={`${toolClass} justify-between border border-line bg-surface px-4`} onClick={() => download('txt')}>Download text <span className="text-[12px] text-ink-3">Story, events & sources</span></button>
        <button type="button" className={`${toolClass} justify-between border border-line bg-surface px-4`} onClick={() => download('json')}>Download JSON <span className="text-[12px] text-ink-3">Complete timeline data</span></button>
      </div>
      {error && <p role="alert" className="mt-3 text-[13px] text-red">The download could not start. Please try again.</p>}
    </Modal>}
  </>;
}
