# Mobile experience follow-up

The Classic entry lives in the modern page footer. The centered wordmark and short description remain the landing's focus. The footer is part of normal page flow, so very short screens can scroll to it.

| Before | After | Why |
| --- | --- | --- |
| Classic occupied the header | Quiet `Chronos Classic` footer link | Keep the entry point available without competing with the main task |
| Small phone controls and compact prompt row | 44px primary controls, stacked phone composer, 16px input | Comfortable touch input and avoidance of iOS input zoom |
| Landing automatically focused the input | No autofocus on coarse pointers; explicit submission blurs the field | Keep the keyboard out of the way on arrival and while reading results |
| Long phone results required repeated scrolling | Sticky Map / Events / Story links with offset anchors | Move between the map, event list and narrative |
| Detail sheet allowed background scrolling | Phone modal semantics, focus loop, scroll locking and safe-area padding | Keep interaction within the sheet and restore the page after dismissal |

## Browser verification

Built frontend served locally; all generation requests intercepted with the repository's Roman Empire recording (66 events). Failure and delayed responses were controlled by the test harness. No provider or real generation API was called.

- Chromium touch viewports: 320×568, 390×844 (dark), 430×932.
- WebKit touch viewport: 390×844 (light).
- Desktop landing and Classic round-trip: Chromium 1440×1000.
- Centered wordmark, footer placement, input font size, initial focus, primary control sizing and horizontal overflow.
- Deep-mode prompt submission and keyboard blur; map/event/story section links.
- Map zoom/reset/trail, playback/pause, keyboard timeline cursor, source filters.
- Event sheet bounds, inner scrolling, focus loop, Close/scrim dismissal and page scroll restoration.
- Narrative cited-event navigation; controlled failure/retry and stopping a delayed run.
- Actual Chromium touch gestures: one finger scrolls the page, two fingers pinch the map; pin-to-detail and area selection/clearing.
- Footer → Classic → new Chronos in Chromium 320px and WebKit 390px. A disposable Classic archive remained readable; archive/chat values remained byte-identical after the round-trip. No API requests were attempted.

All 445 tests across 29 suites, typecheck and production build pass. This includes 13 focused footer/composer/detail tests. Commit/build receipts are recorded with the PR. The existing large geography-chunk build warning remains.

These are browser-emulated phone checks, not physical iPhone/Android keyboard or browser-toolbar acceptance. Hosted APIs, live providers and the [feature-parity backlog](chronos-feature-parity.md) remain separate release work. A short physical-phone pass is recommended before release.
