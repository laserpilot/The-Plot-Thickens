# Refactor Progress Log

Track completed steps, deviations from plan, and open questions for session handoffs.

---

## Session 1 - 2025-10-31

### Phase 0: Baseline & Safety ✓

- [x] Created git tag `pre-web-v2-refactor` for rollback safety
- [x] Documented 5 regression test cases in [docs/regression-tests.md](regression-tests.md)
- [x] Created this progress log

**Current state**: On `v2-refactor` branch with working CLI + web interface. Recent features include spiral/twisted fills and focus-blur modes.

### Phase 1: Web-v2 Scaffold ✓

- [x] Create `web-v2/` workspace with isolated package.json
- [x] Set up Vite bundler (running on http://localhost:3001)
- [x] Establish module structure (state/, ui/, renderer/, utils/, styles/)
- [x] Implement minimal SVG loader and parser
- [x] Build canvas renderer with pan/zoom controls
- [x] Create tab-based UI shell (File, Preview, Fills, Advanced)
- [x] Wire up basic config controls
- [x] Implement CLI command generator

**Status**: Web-v2 is functional! Can load SVG, display paths, pan/zoom, and generate CLI commands.

### Decisions Made

1. **Module bundler**: Using Vite for fast dev server and modern ES modules
2. **Framework choice**: Starting with vanilla JS to keep it simple and avoid framework overhead
3. **State management**: Will use simple pub/sub pattern rather than heavy library

### Open Questions

- Should we support TypeScript in web-v2 from the start, or add it later?
- How to handle the transition period - redirect users from old web/ to web-v2/?
- When to deprecate/remove legacy web/ directory?

### Phase 2: Shared Engine Extraction ✓

- [x] Create `shared/` package structure with package.json
- [x] Create module directories: shared/geometry/, shared/fields/, shared/utils/
- [x] Extract and convert path-utils.js to ES modules in shared/geometry/
- [x] Extract and convert density-field.js to ES modules in shared/fields/
- [x] Extract and convert attractor.js to ES modules in shared/fields/
- [x] Create index.js barrel exports for clean imports
- [x] Wire web-v2 to shared engine via processor.js
- [x] Add "Process Paths" and "Reset to Original" buttons to web UI
- [x] Test offset processing in web-v2 - **working!**

**Status**: Web-v2 now uses the same offset generation engine as the CLI! Can process paths with configurable offset/noise/passes.

### UI Improvements Made

- [x] Changed preview background from black to white (plotter-ready)
- [x] Changed path stroke color from blue to black
- [x] Added semi-transparent info overlay for better readability
- [x] Optimized for A3 landscape aspect ratio (420mm × 297mm)
- [x] Fixed canvas initialization bug (was 0x0 dimensions)

### Decisions Made (Updated)

1. **Module bundler**: Using Vite for fast dev server and modern ES modules
2. **Framework choice**: Vanilla JS - keeps bundle small and simple
3. **State management**: Simple pub/sub pattern - works great, no framework needed
4. **Import strategy**: Using relative imports `../../../shared/` instead of alias - simpler, more reliable
5. **Module format**: ES modules throughout (shared/ uses ESM, not CommonJS)
6. **Canvas rendering**: White background with black paths to match plotter output

### Deviations from Plan

- Used relative imports instead of Vite aliases for shared package (simpler)
- Kept lib/ folder intact for now (CLI still uses it via CommonJS)
- Haven't updated CLI to use shared/ yet (would require CommonJS → ESM migration)

### Next Steps (Phase 3)

1. Add live preview toggle (auto-reprocess on parameter change)
2. Implement attractor placement UI
3. Add sample preview panel for testing parameters
4. Implement SVG export functionality
5. Add more fill modes (crosshatch, striped, spiral)
6. Consider migrating CLI to use shared/ (requires ESM migration)

---

## Session Template

Copy this for future sessions:

```markdown
## Session N - YYYY-MM-DD

### Work Completed
- [ ] Task 1
- [ ] Task 2

### Decisions Made
1. Decision and rationale

### Blockers / Issues
- Issue description and workaround

### Next Steps
1. Next task
```
