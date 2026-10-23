# Chronos reading flow and live research

## User flow

```text
Search → live SSE → stable progress + expanded sources → timeline + story
                                                       └─ event → inline evidence
Archives → stored evidence (no new research request)
Local test harness → explicit fixture option (no public HTTP route)
```

The toolbar and progress panel retain their layout through completion. Search and investigation surfaces fade briefly; streamed results enter once. Source details stay open unless the reader closes them. Event evidence expands under its card, leaving the map and neighboring events accessible. Map and narrative entry points reveal the Events tab on phones. Close/Escape returns to the event trigger, including Safari touch input. Reduced motion removes movement.

## Data and contracts

`POST /api/chronos/stream` accepts query, depth and optional paired dates. It always passes `live: true` to the pipeline and rejects `replay: true` before starting work. Recording playback exists only as an explicit pipeline option for local tests. Network failures never substitute a recording. New client runs have no replay option. Saved archive provenance remains readable; reopening an archive still performs no request. Classic routes, API and storage keys are unchanged.

Related exploration uses only validated catalog destinations whose names occur as Wikipedia article titles or mapped places in the current evidence. It excludes the current topic, deduplicates by catalog entry and disappears when no supported match exists. Raw event sentences never become suggestions. The redundant narrative caption is removed; citations and evidence remain.

## Failure, observation and rollback

Source/provider failures retain their existing traces and partial-result notices. A total source failure reports an error with retry instead of saved data. Stop, replacement and New search abort the current run and ignore late frames. No new service, secret, schema or migration is required. Deploy the combined frontend/API together; rollback is the previous Vercel production deployment.

## Validation

- Full suite: 485 tests passed across the main run and the route test rerun with local-listen permission. One additional Safari focus regression passed afterward (486 total tests).
- Native Node import, public replay rejection and explicitly isolated fixture SSE guard pass; production build and typecheck pass.
- Local browser fixtures: desktop Chromium 1440px, phones 390px/320px, WebKit touch 390px; slow completion with identical progress panel height, stop, error, archives, inline details, focus return, citations and no horizontal overflow.
- Local fixtures are not production acceptance. Public assets/API and one real live investigation are checked after merge/deploy; the release receipt records that result separately.

The 500-topic catalog audit is a separate, partial workstream: 85 enabled, 415 held. This change does not expand that set or claim expert historical validation.
