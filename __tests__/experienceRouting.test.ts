import { describe, expect, it } from 'vitest';
import { classicTimelineUrl, legacyClassicHref } from '../lib/experienceRouting';

describe('legacyClassicHref', () => {
  it('opens a legacy root timeline in Classic without changing search or hash', () => {
    expect(legacyClassicHref({
      pathname: '/', search: '?utm_source=shared%20link&x=1',
      hash: '#/timeline/archive-123/narrative/event/event-456',
    })).toBe('/classic/?utm_source=shared%20link&x=1#/timeline/archive-123/narrative/event/event-456');
  });

  it.each(['map', 'timeline', 'list', 'narrative'])('preserves the %s view', (view) => {
    expect(legacyClassicHref({ pathname: '/', search: '', hash: `#/timeline/archive-123/${view}` }))
      .toBe(`/classic/#/timeline/archive-123/${view}`);
  });

  it('keeps a timeline link without a view in Classic', () => {
    expect(legacyClassicHref({ pathname: '/', search: '', hash: '#/timeline/archive-123' }))
      .toBe('/classic/#/timeline/archive-123');
  });

  it.each(['', '#about', '#/timeline/', '#/timeline', '#/timelines/id/map'])('keeps %s in modern', (hash) => {
    expect(legacyClassicHref({ pathname: '/', search: '?q=rome', hash })).toBeNull();
  });

  it.each(['/classic', '/classic/', '/classic/index.html', '/other'])('never redirects %s', (pathname) => {
    expect(legacyClassicHref({ pathname, search: '', hash: '#/timeline/archive-123/map' })).toBeNull();
  });
});

describe('classicTimelineUrl', () => {
  it('generates absolute share links that explicitly open Classic', () => {
    expect(classicTimelineUrl('https://chronos.example', 'archive-123', 'map'))
      .toBe('https://chronos.example/classic/#/timeline/archive-123/map');
  });
});
