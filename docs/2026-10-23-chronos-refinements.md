# Chronos identity, navigation and map follow-up

The landing and result headers now use the selected gold serif wordmark. The redundant Try chips are removed; empty-input suggestions blur into focus, with Tab completion and a static reduced-motion variant. New search returns to the centered landing page; completed investigations remain available in Archives.

The result map offers Dots and Map. The geographic view uses the existing Esri basemap configuration and Leaflet dependency, loaded only when requested. It preserves event selection, playback, approximate-location indicators, and the shared area filter. Markers cluster at the current zoom, including a list for events at the same place. Present-day geography and provider attribution remain visible. Phones retain ordinary page scrolling until Move map is selected; pinch zoom remains available. Tile failures offer a clear route back to Dots.

```
Search → investigation → Archives / export
              ├─ Dots ─┐
              └─ Map  ─┴─ selected event + playback + area filter
New search → centered landing

500 candidate topics → recorded coverage checks → enabled Surprise me deck
```

| Before | After | Why |
| --- | --- | --- |
| Serif landing mark, plain result header | Shared gold wordmark at logo positions | Keeps the chosen identity consistent |
| Rotating examples plus a second Try row | One rotating prompt with a short blur transition | Removes repeated choices |
| New search expands a small form above the result | Returns to the full landing page | Matches the requested navigation |
| Dotted map only | Dots / Map switch with labeled geography | Makes places easier to recognize |
| Eight repeated surprise strings | Curated catalog and a shuffled, evaluated deck | Adds variety without promoting unchecked picks |

## Reliability

The query parser previously dropped a three-digit start year: `Islamic Golden Age 750–1258` became a single-year 1258 query. Regression tests now cover that case, early-year ranges, and all 500 catalog ranges. Surprise picks also carry structured dates.

When fewer than five source-backed events are available, the live pipeline can now retain dated Wikipedia passages it already fetched. Each keeps the original sentence and correct originating article URL. These are Wikipedia evidence, never independent model confirmation. Provider failures remain visible as partial coverage.

## Catalog rollout remains incomplete

`surprise-topics.json` contains 500 candidates across 20 categories. `surprise-ready.json` is the selectable subset. The per-topic receipts are in `2026-10-23-surprise-evaluation.json`.

Coverage requirements: at least five events, three source-backed events, three distinct years (or every year for shorter windows), matching requested dates, overlapping event spans, and a completed story. This is a functional coverage check, not expert historical fact-checking.

The initial hosted audit tested 97 topics, with 80 passing. The local source-only audit tested the real Wikimedia pipeline under model unavailability, adding five more eligible topics. Wikimedia then returned rate limits, so the full catalog is not verified. **85 topics are enabled; 415 are held.** The enabled subset is currently concentrated in ancient, Asian, medieval and African histories. Broader-category validation is the next step.

The resumable `scripts/evaluate-surprise.ts` audit uses no model credentials, runs one topic at a time, waits between topics, and stops at the first upstream rate-limit signal. It is explicitly invoked, never part of normal tests or builds. Held picks must pass review before their IDs are added to `surprise-ready.json`; failed or rate-limited receipts must be preserved separately before retrying.

## Validation

- Typecheck and production build.
- Full suite, including Classic storage isolation, parser regressions, provider failure fallback, prompt keyboard/reduced-motion behavior, and catalog gating.
- Isolated desktop Chromium, 320px/390px mobile Chromium and 390px WebKit touch checks: landing, real map tiles, clusters, event details, area filter, playback, map switch, New search, archive reopen without another request, Classic and overflow.
- Public deployment verification is recorded after release. Browser emulation does not establish physical-device acceptance.

Rollback baseline: main `e2d2487e912823fb8a4e33a35d5c5593d54b461b`, deployment `dpl_AgXNR5YtQyfP2JdGrNvtetNgvkCq`.
