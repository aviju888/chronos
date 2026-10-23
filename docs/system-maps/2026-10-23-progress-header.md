# Chronos research panel and header actions

Follow-up to reading-flow.md: completion now collapses research details, replacing the previous keep-open behavior at the user's request.

## Behavior

```
Start → centered tasks (640px maximum)
      → real source trace → expanded tasks + details (1040px maximum)
      → success → compact status + centered disclosure chevron
                    ↕ reopen research details
```

Phones stack details below tasks. Stopped and failed investigations remain open for inspection. Query parsing alone does not reserve a source column. A new run resets disclosure state. Reduced-motion preferences disable the transition.

Header: Chronos wordmark | New search (+), Archives, Export, sound, theme. Search resets to the landing page; export is disabled until a completed or interrupted result has events. Archives remains available on the landing page. Icon actions have accessible names, hover/focus tooltips and 44px phone targets. Successful autosave is silent; failed saves retain the alert and retry action.

## Boundaries

Only modern UI changes. Classic routes, storage keys, API contracts and public live-only research remain unchanged. Local browser validation uses an isolated fixture stream. Release requires typecheck, focused component tests, native Node API guard, build, desktop/mobile browser checks, and public verification.
