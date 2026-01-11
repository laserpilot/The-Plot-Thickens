# Web V3 Implementation Plan

This document outlines a **planned** refactor and reorganization. Do not execute any steps here yet. The goal is to create a new `web-v3` UI while modularizing fill modes, and to cleanly compartmentalize legacy `web`/v1 artifacts.

## Branching

- Create and switch to a new branch named `version-3.0` before starting any work.
- All changes described here should be made on that branch only.

## Goals

- Preserve `web-v2` as the stable baseline.
- Create `web-v3` as the experimental UI shell.
- Keep `shared/` as the single source of truth for geometry + fill logic.
- Extract each fill mode into its own file to improve maintainability and reduce coupling.
- Clean up legacy v1 artifacts and stale documentation so the repo is easier to navigate.
- Provide an up-to-date `README` for `web-v3` to orient new agents quickly.

## High-Level Strategy

1) **Stabilize and freeze** `web-v2` as a reference implementation.
2) **Create `web-v3` UI** by copying a minimal subset of `web-v2` and wiring it to `shared/`.
3) **Modularize fill modes** into `shared/fills/` with a registry.
4) **Refactor processors** (both server and client) to use the fill registry.
5) **Clean up legacy v1 artifacts** by moving them under `web-v1/`.
6) **Refresh documentation** with a new `README` for `web-v3` and relocate stale docs.

## Detailed Steps (Planned Only)

### 1) Branch + Safety

- Create and switch to `version-3.0`.
- Confirm `web-v2` is running and can render a known SVG (baseline).
- Snapshot a few output SVGs for later visual comparison.

### 2) Create `web-v3` (UI Shell Only)

- Copy only the UI shell from `web-v2` into `web-v3`.
  - Keep the same folder structure for now to minimize friction.
  - Update references so `web-v3` always imports fill logic from `shared/`.
- Do not duplicate `shared/` or fill logic inside `web-v3`.
- Ensure `web-v3` can run and process a basic SVG before deeper refactors.

### 3) Extract Fill Modes into `shared/fills/`

Create a new folder structure:

```
shared/
  fills/
    index.js
    curly.js
    barber-pole.js
    crosshatch.js
    hatch-gradient.js
    stippling.js
    shape.js
  geometry/
    path-utils.js   // keep shared helpers only
```

Each fill mode file should export:

- `generate(pathData, options)` function
- `defaults` object (single source of truth for options)
- Optional `schema` for UI automation later

`shared/fills/index.js` should expose a registry:

```
export const fillRegistry = {
  curly: { generate, defaults },
  barber: { generate, defaults },
  ...
};
```

### 4) Update Processors to Use Registry

Update both processors to resolve fill modes via registry:

- `web-v2/src/utils/processor.js`
- `web-v2/server/processor.js`
- `web-v3/src/utils/processor.js` (once created)
- `web-v3/server/processor.js` (if present)

Intent:

- Reduce large switch/if trees.
- Ensure each mode pulls defaults from the same source.
- Avoid mismatches between UI vs server defaults.

### 5) Update UI Defaults from Mode Defaults

In `web-v3`, align UI config defaults with each mode’s `defaults`.

- Avoid duplicate default values in UI code.
- Use `defaults` to initialize UI controls and CLI output.

### 6) Migrate 1–2 Modes First

Start with:

- `curly`
- One more mode (e.g., `barber-pole` or `crosshatch`)

Validate behavior before migrating the rest.

### 7) Legacy v1 Compartmentalization

Move legacy `web/` into `web-v1/` and collect any other v1 artifacts:

- Rename `web/` → `web-v1/`
- Move old scripts, assets, or docs that belong to v1 into `web-v1/`
- Leave a short README in `web-v1/` explaining it is legacy

### 8) Documentation Cleanup

Create new documentation for `web-v3`:

- `web-v3/README.md`: quick start, run commands, mode list, and project intent
- `docs/plans/web-v3-implementation-plan.md`: this plan (current file)

Move or archive stale docs:

- Create `docs/archive/` and move outdated v1/v2 docs there.
- Keep `docs/README.md` current and pointing to `web-v3`.

## Risks / Watchouts

- Keep `shared/` backwards compatible while migrating modes.
- Avoid breaking `web-v2` while building `web-v3`.
- Ensure server and client processors stay in sync on defaults.
- Test a few representative SVGs to catch regressions early.

## Suggested Execution Order

1) Create `web-v3` shell.
2) Add fill registry + extract `curly`.
3) Update processors to registry.
4) Extract 1–2 more modes.
5) Validate outputs vs `web-v2`.
6) Compartmentalize `web-v1`.
7) Update docs (README + archive).

## Not Doing Yet

This plan is for reference only. No changes should be made until an agent explicitly starts the work on branch `version-3.0`.
