# Testing

## Run

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Coverage (181 tests, 6 files, all passing)

```
File               | Stmts  | Branch | Funcs  | Lines
-------------------|--------|--------|--------|------
utils.ts           | 100%   | 100%   | 100%   | 100%
lib/parsing.ts     | 100%   | 98.2%  | 100%   | 100%
lib/validation.ts  | 98.7%  | 98.5%  | 100%   | 98.7%
lib/wikidata.ts    | 40.6%  | 92.3%  | 57.1%  | 40.6%
services/image...  | 67.4%  | 88.9%  | 85.7%  | 67.4%
services/storage.. | 64.1%  | 86.7%  | 100%   | 64.1%
-------------------|--------|--------|--------|------
TOTAL              | 75.9%  | 95.8%  | 89.5%  | 75.9%
```

## Test Files

| File | Tests | What it covers |
|------|-------|----------------|
| `validation.test.ts` | 45 | sanitizeString, validateCoordinates, validateYear, validateTimeRange, validateEvent |
| `parsing.test.ts` | 67 | safeParseJSON, extractYearFromText, extractExactDate, normalizeString, areTitlesSimilar, categorizeEvent, quickDetectQueryType, extractKeyFigures, deduplicateEvents |
| `wikidata.test.ts` | 17 | isValidQId, toWikidataYear, fromWikidataYear, parseWikidataResults |
| `utils.test.ts` | 21 | formatYear, formatYearRange, parseHash, updateHash |
| `storageService.test.ts` | 20 | getStorageUsage, loadTimelines, saveTimelines, deleteTimeline, clearAllData |
| `imageCache.test.ts` | 11 | getCachedImage, cacheImage, clearImageCache, cache expiration |

## Not covered (requires network mocking)

- `services/apiService.ts` - Client API wrappers (all calls go through `fetch`)
- `api/generate.ts` - Serverless function (Groq/Wikipedia/Wikidata API calls)
- `lib/wikidata.ts` async functions - `findWikidataEntity`, `queryWikidataEvents`, `enrichFromWikidata`
- `services/imageCache.ts` - `fetchImageWithCache` (Wikipedia image API)

Coverage JSON: `coverage/coverage-summary.json`
