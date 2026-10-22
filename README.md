# Chronos

Chronos explores history through cited events, maps and narratives. The refreshed experience opens at `/`; the original application remains available at `/classic/`, including its saved archives, follow-up chats and exports.

```text
/                 Modern interface → /api/chronos/stream (SSE)
/classic/         Classic interface → /api/generate (JSON)
/#/timeline/...   Redirect → /classic/#/timeline/...
```

Modern runs stay in memory. Its recorded example buttons replay saved source data and display a replay notice. Custom queries use Wikipedia/Wikidata and, when configured, Groq; missing credentials produce a visibly scripted model lane rather than evidence of live model success. Sound starts off.

## Run locally

Use Node.js 22 or newer and install the locked dependencies:

```sh
npm ci
```

For the frontend alone, run `npm run dev`. This serves both documents, but needs an API runtime for generation. To run the complete local flow, use two terminals:

```sh
# Terminal 1: actual local Vercel functions, using an existing authorized project link.
# Use recorded example buttons for replay-only acceptance (replay:true).
GROQ_API_KEY='' npm exec vercel -- dev --listen 3220
```

```sh
# Terminal 2: open this frontend URL in your browser.
GROQ_API_KEY='' CHRONOS_DEV_API_ORIGIN=http://127.0.0.1:3220 npm run dev -- --host 127.0.0.1 --port 3223 --strictPort
```

Open [modern](http://127.0.0.1:3223/) or [Classic](http://127.0.0.1:3223/classic/). The Vite frontend proxies `/api` to the local Vercel functions. Vercel CLI 50.1.3 alone misroutes Vite development module requests through the HTML fallback; its frontend URL is therefore not the verified development entry. Production rewrites are not changed to compensate for this CLI behavior.

Vercel dev can inject configured project development environment values, including a model key, even when the shell sets an empty key. Use recorded example buttons (`replay:true`) for fixture-only checks; an empty shell variable alone does not establish provider isolation. Vercel dev requires project metadata and account access. On a fresh checkout, linking a project is a separate explicit setup step; do not copy someone else's credentials or `.env` files. Frontend-only development and recorded/unit tests do not require a model key. Live model use requires a server-side `GROQ_API_KEY` in the approved environment; never use a `VITE_` variable for it. Classic generation requires the key, while modern can use its scripted lane with Wikimedia data or recorded replay.

## Verify and build

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

The build writes separate `dist/index.html` and `dist/classic/index.html` documents. `preview` serves the static frontend and does not execute Vercel functions. The migration record describes the API proxy, routes, storage, source attribution, rollback and remaining release gates: [Classic migration](docs/chronos-classic-migration.md).

As of October 22, 2026, the migration has local test/build and actual local function replay evidence. Hosted routes, hosted streaming/cancellation and real model/provider acceptance require a separately approved Vercel preview. This branch has not been merged or deployed as part of that evidence.

## Attribution

Built by [Adriel Vijuan](https://github.com/aviju888). Historical records and images retain their source citations. Classic uses Leaflet and OpenStreetMap; modern geography uses packaged world-atlas data. Modern interface and font provenance are recorded in [licenses](licenses/README.md).
