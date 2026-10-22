export function legacyClassicHref(location: { pathname: string; search: string; hash: string }): string | null {
  if (location.pathname !== '/' || !/^#\/timeline\/[^/]+(?:\/|$)/.test(location.hash)) {
    return null;
  }
  return `/classic/${location.search}${location.hash}`;
}

export function classicTimelineUrl(origin: string, id: string, view: string): string {
  return `${origin}/classic/#/timeline/${id}/${view}`;
}
