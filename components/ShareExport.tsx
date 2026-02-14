import React, { useState } from 'react';
import { Share2, Download, Copy, Check, X, FileText, Image, Link2 } from 'lucide-react';
import { TimelineData } from '../types';
import { formatYear, formatYearRange } from '../utils';

interface ShareExportProps {
  timeline: TimelineData;
  isOpen: boolean;
  onClose: () => void;
}

export const ShareExport: React.FC<ShareExportProps> = ({ timeline, isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}#/timeline/${timeline.id}/map`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const exportAsText = () => {
    setExporting(true);

    const content = `
CHRONOS TIMELINE EXPORT
=======================
Region: ${timeline.region}
Time Period: ${formatYearRange(timeline.timeRange.start, timeline.timeRange.end)}
Generated: ${new Date(timeline.createdAt).toLocaleDateString()}

NARRATIVE
---------
${timeline.narrative}

ERAS
----
${timeline.eras.map(era => `
${era.title} (${formatYearRange(era.startYear, era.endYear)})
${era.summary}
`).join('\n')}

EVENTS (${timeline.events.length} total)
------
${timeline.events.map(evt => `
[${formatYear(evt.year)}] ${evt.title}
Category: ${evt.category}
${evt.summary}
Sources: ${evt.citations.map(c => c.source).join(', ')}
${evt.isDisputed ? '⚠️ DISPUTED' : ''}
`).join('\n---\n')}

---
Exported from Chronos History Explorer
https://chronos-history.vercel.app
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chronos-${timeline.region.toLowerCase().replace(/\s+/g, '-')}-${timeline.timeRange.start}-${timeline.timeRange.end}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExporting(false);
  };

  const exportAsJSON = () => {
    setExporting(true);

    const exportData = {
      ...timeline,
      exportedAt: new Date().toISOString(),
      source: 'Chronos History Explorer',
      url: 'https://chronos-history.vercel.app'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chronos-${timeline.region.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExporting(false);
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Chronos: ${timeline.region}`,
          text: `Explore the history of ${timeline.region} (${formatYearRange(timeline.timeRange.start, timeline.timeRange.end)}) on Chronos`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or error
        console.log('Share cancelled');
      }
    } else {
      copyLink();
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center p-0 md:p-4 bg-ink/50 dark:bg-black/70 backdrop-blur-sm">
      <div className="bg-paper dark:bg-night-light rounded-t-2xl md:rounded-lg shadow-2xl w-full max-w-full md:max-w-md overflow-hidden border-t md:border border-gold/30">
        {/* Header */}
        <div className="bg-ink dark:bg-night p-4 flex justify-between items-center">
          <div className="flex items-center gap-2 text-gold">
            <Share2 className="w-5 h-5" />
            <h2 className="font-display font-bold tracking-wider">Share & Export</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-paper"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Timeline Info */}
          <div className="text-center pb-4 border-b border-gold/20">
            <h3 className="font-serif font-bold text-lg text-ink dark:text-paper">{timeline.region}</h3>
            <p className="text-sm text-gold-dark">{formatYearRange(timeline.timeRange.start, timeline.timeRange.end)}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{timeline.events.length} events • {timeline.eras.length} eras</p>
          </div>

          {/* Share Link */}
          <div>
            <label className="block text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">
              Share Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-3 py-2 bg-stone-100 dark:bg-night rounded border border-stone-300 dark:border-stone-600 text-sm font-mono text-ink dark:text-paper truncate"
              />
              <button
                onClick={copyLink}
                className="px-4 py-2 bg-gold hover:bg-gold-light text-ink rounded font-bold text-sm transition-colors flex items-center gap-2"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Export Options */}
          <div>
            <label className="block text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-3">
              Export Timeline
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={exportAsText}
                disabled={exporting}
                className="flex flex-col items-center gap-2 p-4 border-2 border-stone-300 dark:border-stone-600 rounded-lg hover:border-gold hover:bg-gold/5 transition-all group"
              >
                <FileText className="w-8 h-8 text-stone-400 group-hover:text-gold transition-colors" />
                <span className="text-sm font-bold text-ink dark:text-paper">Text File</span>
                <span className="text-xs text-stone-500">.txt</span>
              </button>

              <button
                onClick={exportAsJSON}
                disabled={exporting}
                className="flex flex-col items-center gap-2 p-4 border-2 border-stone-300 dark:border-stone-600 rounded-lg hover:border-gold hover:bg-gold/5 transition-all group"
              >
                <Download className="w-8 h-8 text-stone-400 group-hover:text-gold transition-colors" />
                <span className="text-sm font-bold text-ink dark:text-paper">JSON Data</span>
                <span className="text-xs text-stone-500">.json</span>
              </button>
            </div>
          </div>

          {/* Native Share (mobile) */}
          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              onClick={shareNative}
              className="w-full py-3 bg-ink dark:bg-gold text-paper dark:text-ink rounded-lg font-bold text-sm uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              Share via...
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="bg-stone-100 dark:bg-night px-6 py-3 text-center">
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Powered by <span className="font-bold text-gold">Chronos</span> • AI Historical Research
          </p>
        </div>
      </div>
    </div>
  );
};
