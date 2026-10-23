# Chronos modern / Classic migration

The refreshed Chronos interface is the default at `/`. Classic remains a separate document at `/classic/` so the original archive, chat, map, generation and export workflow stays available. There is no saved mode preference or automatic preference redirect.

The modern interface is not yet feature-complete relative to Classic. The user requested that useful Classic capabilities carry forward; see the [feature parity audit](chronos-feature-parity.md) for the pending persistence, export, chat, date and discovery work before release.

## Provenance and boundaries

The migration started from `aviju888/chronos` main commit `3579f66e18d1ab231bad77693c55c90ce80c6698`, verified October 22, 2026, in an isolated clone. The original source checkout was kept read-only. Classic's HTML is preserved from that base, with the original root React entry, global styling, fonts and components. Minimal additions provide mode links and Classic export URLs; the existing hash-clear path now retains the query string. Classic theme and onboarding storage access tolerate denied browser storage while retaining session behavior.

Modern adapts the user-owned Chronos component/domain source and three recorded fixtures from the avijuan-lab reference snapshot. Only the required craft helpers, tokens, effects and fonts were extracted. There is no runtime import, navigation, branding or asset dependency on the source project. That source snapshot had no Git metadata; do not assign it a fabricated commit. Exact inputs and SHA-256 hashes are in `licenses/modern-source-manifest.json`; the larger research inventory remains with the implementation evidence. See `licenses/README.md`, the included Beautiful UI MIT license and the bundled font OFL notices. Package dependencies and world-atlas retain upstream licenses.

Modern server provider defaults preserve Chronos's current GPT OSS configuration: `openai/gpt-oss-20b` for fast operations and `openai/gpt-oss-120b` for deep operations, low reasoning effort, reasoning output disabled, and a 256-token reasoning allowance. They intentionally do not restore older model settings from the reference source. Classic's `/api/generate` implementation is unchanged from the migration base.

## Routes and document isolation

```text
Browser
├─ / → modern/main.tsx → modern/App.tsx → modern-only CSS/fonts
│  └─ POST /api/chronos/stream → modern server pipeline → SSE
├─ /classic or /classic/ → classic/index.html → index.tsx → original Classic CSS
│  └─ POST /api/generate → unchanged Classic JSON API
└─ /?query#/timeline/id/view[/event/id]
   └─ /classic/?query#/timeline/id/view[/event/id]
```

The modern Classic entry is a footer link; Classic offers “Try the new Chronos.” Both mode links use native full-document navigation. Vite canonicalizes bare `/classic` to `/classic/` while preserving raw query parameters; Vercel has explicit Classic rewrites before the root fallback. API rewrites precede both page rewrites. The multi-page build supplies independent HTML inputs, preventing modern global CSS, theme tokens or fonts from being imported by Classic. Existing Classic external assets remain as before.

Old root timeline links redirect before modern mounts and retain their search/hash. New Classic share links explicitly use `/classic/#/timeline/{id}/map`. They reference archives in the same browser's local storage; exporting a link does not upload an archive or make it available on another device. Text and JSON exports remain the way to download timeline data. Existing Classic views are `map`, `timeline`, `list`, and `narrative`.

## Storage and run lifecycle

| Owner | Keys/data | Contract |
| --- | --- | --- |
| Classic | `chronos_archives` | Existing local timeline schema and behavior retained. |
| Classic | `chronos_chat_{id}` | Existing per-archive follow-up conversations retained. |
| Classic | `chronos-theme` | Existing theme retained; denied reads use system preference and denied writes keep the session choice. |
| Classic | `chronos_onboarding_completed` | Existing onboarding marker retained; tour controls remain usable without storage. |
| Modern | `chronos-modern-theme` | Isolated preference; follows system until explicitly changed. |
| Modern | `chronos-modern-sfx` | Isolated preference; off by default. |
| Modern | Generated events, narrative, tasks, traces | Memory only; reload resets the run. No archive import or new run persistence. |

Modern does not read or write Classic keys. Switching modes does not migrate, clear or rename archives or chats. If storage reads/writes fail, modern preferences still work for the session. Classic cannot restore inaccessible data while storage is blocked, but opening/switching the document does not erase it. Classic's existing archive quota cleanup and explicit delete controls remain existing behavior; the migration does not redefine them.

Starting/replacing a modern run aborts the earlier client request; stopping marks the run stopped and ignores later frames. Client and server guard against late results. The server uses a standard Vercel Node Web handler with `supportsCancellation: true`, forwards abort into the pipeline and stops emission. Provider and client SSE readers reject premature EOF and explicit streamed errors. Pipeline fallback or replay is visibly identified and must not be counted as live-model success. Narrative frames retain `delta` and optionally carry `source: "model" | "composed"` and `replace: true`; failed model prose is replaced before composed output streams. Recorded delta-only frames remain supported. Narrative attribution is independent of model event provenance. Source lookup failures retain a Partial task status even when useful records survive, and source/narrative notices remain visible after the Pipeline panel collapses.

## Local commands and environment

Use Node.js 22+ and `npm ci`. `npm run dev` supports frontend work. For integrated acceptance, use the two-terminal flow in the README: `GROQ_API_KEY='' npm exec vercel -- dev --listen 3220`, then `GROQ_API_KEY='' CHRONOS_DEV_API_ORIGIN=http://127.0.0.1:3220 npm run dev -- --host 127.0.0.1 --port 3223 --strictPort`. Open port 3223. This was verified with Vercel CLI 50.1.3 and an already authorized ignored project link containing only project identifiers. No credentials or environment files were copied. CLI project environment injection was not independently established or ruled out; no secret values were inspected.

The CLI's development rewrite handling can send source-module requests to HTML, so direct Vercel frontend development is not the verified path. Its request proxy also drops downstream request cancellation before the Web handler. The Vite proxy plus actual local function validates integration, but neither local server demonstrates hosted disconnect propagation.

`npm test`, `npm run typecheck`, and `npm run build` are the completion checks. `npm run preview` serves only static build output. `CHRONOS_DEV_API_ORIGIN` is optional and only controls the Vite development API proxy. `GROQ_API_KEY` is server-only, never exposed through Vite defines, browser env or frontend imports. Configure it only in an explicitly approved server environment. The shell key was explicitly empty for local acceptance, but the Vercel CLI can inject configured project development values. The explicit `replay:true` route uses usable repository fixtures and bypasses external source and model work. Missing, empty or diagnostic-only recordings return an error followed by terminal done; they never fall through to live collection. An empty shell variable alone does not prove a no-key function environment. A single unexpected Classic follow-up HTTP 200 during acceptance is recorded in the receipt; its provider execution is unresolved, and no provider success is claimed.

## Acceptance and release boundary

The [mobile follow-up](chronos-mobile-acceptance.md) records the phone layout, touch, navigation, detail-sheet and Classic round-trip checks.

The Task 4 receipt records local verification of desktop/mobile documents, route refresh, old hash links, archive/chat byte preservation, share/download, theme isolation, denied storage, map/list/details/playback, keyboard controls, stop/replacement, actual local function replay and simulated failure presentation. Unit tests cover provider response/error contracts and abort handling with in-memory mocks. Recorded fixture replay proves integration and UI behavior; it does not prove current Wikipedia, Wikidata or Groq availability, accuracy or live model quality.

Before approving the default change for release, verify `/`, `/classic`, `/classic/`, old hash/query links, both APIs, real streaming and cancellation on a separately approved Vercel preview. Confirm cancellation reaches the hosted function and stops upstream work; browser cancellation alone is insufficient. Run a bounded approved provider check separately and inspect live/replay/fallback labeling. No production merge, deploy, project-link change, paid generation or credential retrieval is authorized merely by this document.

## Rollback

Before release, keep this branch unmerged if acceptance is incomplete. After an approved release, redeploy the known previous production deployment or revert the complete migration commit range through the normal review process, then rebuild/deploy the prior single-document app. The pre-migration base is `3579f66e18d1ab231bad77693c55c90ce80c6698`; do not use a destructive local reset on a shared checkout. Reverting the whole range restores Classic at the original root with its original Vercel routing and API configuration. Retain this migration document/evidence separately if the revert removes it.

Do not clear storage or translate archive/chat values during rollback. Classic's original keys and schemas were kept intact. The two modern preference keys can remain unused; removing them is unnecessary. Verify a saved Classic archive/chat and a legacy root timeline link after rollback. Redeployment and rollback remain separate authorized release actions.
