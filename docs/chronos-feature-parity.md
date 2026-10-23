# Chronos feature parity

Audit requested October 22, 2026 after reviewing the new landing page. The user expects useful Classic features to carry forward into the new default. Preserving a feature in Classic does not satisfy that expectation by itself.

The modern experience is not yet feature-complete. This is an implementation backlog, not a claim that these gaps have been fixed.

| Capability | Classic | Modern now | Recommended follow-up |
| --- | --- | --- | --- |
| Save and reopen timelines | Local archives with delete/new controls | Run exists only in memory; refresh loses it | First priority: persist modern runs, show history, reopen/delete, and handle unavailable storage honestly |
| Access existing archives | Reads `chronos_archives` | No archive reader | Keep the original values intact; add explicit access without silently converting or overwriting them |
| Export and share | Text/JSON downloads and a browser-local timeline link | None | Restore downloads and make link behavior clear; Classic links do not share data across devices |
| Follow-up questions | Timeline-aware chat, per-timeline history, Ask Historian from event details | None | Bring contextual questions and saved conversations into the modern results UI |
| Explicit date range | Editable start/end years and suggested ranges | Years can be written in the prompt; no dedicated controls | Add optional date controls without filling the landing page with fields |
| Find events | Text search, category filter, disputed-only filter | Source-agreement and geographic filters | Restore text search and relevant category/confidence filtering using the modern data model |
| Explore a place | Search suggestions and a map picker before generating | Freeform prompt; map interaction after generating | Add optional place discovery after core persistence/export work |
| Surprise me / presets | Randomized region/date presets | Three recorded examples; eight rotating prompt suggestions with Tab completion | Prompt inspiration is improved; a true randomize action and editable presets remain separate |
| Map, timeline, narrative and event details | Four views with event detail and chat entry | Map, playback/scrubber, events, cited narrative and details | Core exploration exists; preserve it while adding the missing workflows |
| Theme and help | Theme, first-run tour and help button | Theme and optional sound; no tour | Keep necessary controls discoverable; do not copy the entire old tour automatically |

## Suggested release order

1. Save/reopen new runs and retain access to existing archives.
2. Restore export, follow-up questions and explicit date controls.
3. Restore event search and review the remaining discovery/help differences.
4. Complete hosted routing, API, cancellation and intentional provider acceptance before changing production's default.

The landing refinements are separate: the original Cinzel/gold wordmark is centered, duplicate header branding is hidden on the landing page, recorded examples say “Try,” empty prompts rotate with Tab completion, and Classic offers a styled “Try the new Chronos” link. These changes do not close the functional gaps above.

## Source evidence

- Classic: `App.tsx`, `components/HistorySidebar.tsx`, `services/storageService.ts`, `components/ShareExport.tsx`, `components/ChatPanel.tsx`, `components/EventDetailModal.tsx`, `components/SetupForm.tsx`, `components/EventListView.tsx`.
- Modern: `modern/components/chronos/ChronosApp.tsx`, `useChronos.ts`, `EventList.tsx`, `EventDetail.tsx`, `PromptComposer.tsx`, and `modern/lib/chronos/examples.ts`.
- Existing route/storage boundaries: `docs/chronos-classic-migration.md`.
