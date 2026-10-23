# Mobile investigations, archives and export

The modern Chronos experience now keeps investigations in a separate browser archive, restores them without another research request, and exports cited text or complete JSON. Optional dates and discovery controls bring useful Classic capabilities into the default experience. Classic remains at `/classic/` with its storage and API untouched.

## Presentation

| Before | After | Why |
| --- | --- | --- |
| Technical trace automatically expanded during loading | One progress card with source tasks and real counts; trace is optional | Keeps progress understandable on a phone |
| Empty map, range and story placeholders stacked below loading | Results appear once events arrive | Avoids several competing waiting states |
| Long mobile stack of map, story and events | Map, Events and Story views with direct citation details | Keeps the active task in reach |
| No modern archive or complete export | Autosave, reopen and cited text/JSON downloads | Makes investigations useful beyond one visit |

## System map

```text
Topic + optional dates
  -> POST /api/chronos/stream
     -> validate dates -> pipeline -> evidence-driven SSE progress
        -> map / events / story
        -> terminal run with events
           -> chronos_modern_archives_v1 -> restore without API
           -> cited text / JSON download

chronos_archives -> read-only Classic links -> /classic/#/timeline/:id/map
```

- **Contract:** optional `range: { start, end }`, both integers from 10000 BCE through the current year, excluding year zero. Explicit selection overrides inferred and query dates. Replay with an explicit range is rejected; a live request with explicit dates never falls back to a differently dated recording.
- **Storage:** versioned modern snapshots retain event IDs, aliases, sources, narrative citations, notices and partial status. Writes read existing entries first, do not evict old entries, and leave data untouched on corruption or quota errors. Technical trace logs and transient merge animations are omitted from saved snapshots.
- **User control:** Surprise me and related topics prefill the composer; only submission starts research. Removing an archive requires a second click. Existing Classic archive/chat keys are never written by these tools.
- **Failure behavior:** storage errors stay visible and export remains usable. Stop keeps partial events; restored work cancels outstanding requests and ignores late frames. Loading labels follow received evidence, not timing estimates.
- **Observability:** visible source task states, notices and optional source traces; browser storage contents and downloaded files provide the archive/export acceptance evidence. No new analytics or configuration.
- **Rollback:** redeploy the previous production deployment `dpl_DxYE879Prdwfrv47WveMBtsH811m` / main merge `1dfb11c6aaa6832bee5a07daa552fb5988adab8c`. Modern archives remain in their separate key; no migration/backfill or environment change is needed.

## Validation

- `npm run typecheck`, `npm test`: 474 tests across 31 suites, and `npm run build` pass.
- Browser checks: Chromium at 320, 390 and 430 pixels; WebKit at 390; desktop at 1440. Slow SSE fixture stages, date validation and request payload, discovery prefills, map/playback, view switches, source filtering, event/citation details, text and JSON downloads, archive reload without API, error/partial/stop behavior, owned archive removal, and Classic key preservation.
- Storage-denied, quota-exceeded and corrupt-storage scenarios preserve export functionality and do not overwrite existing data.
- Automated phone checks are browser emulation. Physical-device acceptance is not claimed.
- Production verification is recorded in the release handoff after deployment; local fixtures are not live provider proof.
