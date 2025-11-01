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
4. ~~Implement SVG export functionality~~ ✅ **DONE**
5. Add more fill modes (crosshatch, striped, spiral)
6. Consider migrating CLI to use shared/ (requires ESM migration)

---

## Session 2 - 2025-10-31

### Phase 3: SVG Export ✓

**Work Completed:**
- [x] Created SVG exporter utility ([web-v2/src/utils/svg-exporter.js](../web-v2/src/utils/svg-exporter.js))
  - `buildSVG()` - Converts processed paths to valid SVG string
  - `downloadSVG()` - Triggers browser download
  - `generateFilename()` - Creates timestamped filenames
- [x] Wired export button in UI ([web-v2/src/ui/app.js](../web-v2/src/ui/app.js))
- [x] Added `originalFilename` to store state for proper export naming
- [x] Implemented XML escaping for security
- [x] Export includes metadata comments (fill mode, timestamp, path count)
- [x] Preserves original SVG viewBox and dimensions

**Key Features:**
- Export works for both processed and original paths
- Filename includes: `{original-name}-{fill-mode}-{timestamp}.svg`
- Proper SVG structure with XML declaration
- Maintains plotter-ready format (black paths, white background)

**Testing:**
- Dev server running at http://localhost:3001
- Can load SVG → process → export workflow complete! 🎉

**Status**: Core export functionality complete. Ready for next Phase 3 task.

### Phase 3: Live Preview ✓

**Work Completed:**
- [x] Added throttle utility function (500ms delay to avoid performance issues)
- [x] Implemented live preview checkbox in Fills tab ([web-v2/index.html](../web-v2/index.html))
- [x] Refactored path processing into shared `processPathsInternal()` function
- [x] Auto-processing triggers when config changes if live preview is enabled
- [x] Added visual feedback: "Processing..." button state with animated dots
- [x] Disabled button during processing to prevent double-clicks
- [x] Throttled recompute prevents excessive processing during rapid parameter changes

**Key Features:**
- Live preview checkbox in Fills tab
- Throttled auto-processing (500ms delay)
- Works for all config parameters (offset, passes, noise, etc.)
- Visual feedback during processing
- Manual "Process Paths" button still available

**Technical Details:**
- Throttle implementation uses setTimeout with proper cleanup
- Processing state tracked in store
- CSS animation for button loading state
- Auto-processes immediately when enabling live preview if paths are loaded

**Status**: Live preview complete. Ready for next Phase 3 task (attractor UI or sample preview).

### Critical Fixes ✓

**Issues Identified:**
1. Canvas preview only visible on Preview tab - hard to see changes while adjusting parameters
2. Processing button had no visual feedback
3. Exported SVG paths were invisible (missing stroke attributes)
4. Path count seemed excessive

**Fixes Completed:**
- [x] **Restructured UI Layout**: Changed from tab-based to split-panel layout
  - Left panel: Controls (File, Fills, Advanced tabs)
  - Right panel: Preview canvas (always visible)
  - Grid layout: `400px | 1fr` for optimal space usage
  - Canvas now visible while adjusting any parameters

- [x] **Fixed Exported SVG Paths**:
  - Added proper SVG attributes to processed paths:
    - `fill: 'none'`
    - `stroke: 'black'`
    - `strokeWidth: 0.1` (mm)
  - Paths now render correctly when exported

- [x] **Fixed Path Processing**:
  - Corrected `generatePasses()` function call signature
  - Was passing object, function expects individual parameters
  - Added proper parameter mapping:
    - `passCount` rounded to integer
    - `envelope` from preset
    - `useNormalMode: true`
  - Added debug logging for path count verification

- [x] **Visual Feedback Improvements**:
  - CSS animation for "Processing..." button state
  - Button disabled during processing
  - Animated dots: `. → .. → ...`

**Technical Details:**
- HTML restructure: `<div class="layout-container">` with grid layout
- CSS updates: `.controls-panel` and `.preview-panel` classes
- Processor now correctly calls shared engine with proper parameters
- Split layout improves workflow: adjust → see changes → export

**Testing:**
- Dev server running smoothly at http://localhost:3001
- UI hot-reloads working correctly
- Ready for user testing

**Status**: Critical UX issues resolved. UI now usable for iterative work.

---

## Session 3 - 2025-11-01

### Phase 3: Attractor UI Polish ✓

**Work Completed:**
- [x] Enhanced HTML with comprehensive attractor controls ([web-v2/index.html](../web-v2/index.html))
  - Per-attractor editable properties (x, y, strength, radius)
  - Manual entry form for precise placement
  - Falloff exponent slider for power/gaussian curves
  - Multi-attractor combination modes (additive, strongest, average, soft, weighted-average)
  - Advanced filtering controls (minInfluenceThreshold, minCoveragePercent, influenceCalcMode)

- [x] Updated state management ([web-v2/src/state/store.js](../web-v2/src/state/store.js))
  - Added comprehensive attractorConfig with all parameters
  - Falloff exponent, multi-mode, and advanced filtering options

- [x] Implemented interactive attractor placement ([web-v2/src/renderer/canvas.js](../web-v2/src/renderer/canvas.js))
  - Ctrl/Cmd+Click to add attractor
  - Shift+Click to remove nearest attractor
  - Click & drag to move attractors
  - Visual rendering with stronger strokes and higher opacity
  - Numbered labels with dark backgrounds for visibility

- [x] Enhanced UI event handlers ([web-v2/src/ui/app.js](../web-v2/src/ui/app.js))
  - Editable attractor list with expandable details panels
  - Custom parameter overrides (null = use global default)
  - Visual indicators for attractors with custom parameters (★ symbol + blue border)
  - Live preview auto-reprocesses on attractor changes

- [x] Integrated with processor ([web-v2/src/utils/processor.js](../web-v2/src/utils/processor.js))
  - Passes all attractor config to shared AttractorSystem
  - Supports all falloff curves, multi-modes, and filtering options

**Key Features:**
- Full parity with original web interface attractor features
- Interactive placement and drag-to-move
- Per-attractor property overrides
- 5 falloff curves: linear, exponential, power, gaussian, inverse-square
- 5 multi-attractor modes: additive, strongest, average, soft, weighted-average
- Advanced filtering: influence threshold, coverage percent, calc mode
- Visual feedback: circles with numbered IDs, color-coded by mode (blue=attract, red=repel)

**Visual Improvements:**
- Stroke opacity increased from 0.3 to 0.6
- Fill opacity increased from 0.05 to 0.15
- Stroke width increased from 1px to 2px
- Center point radius increased from 3px to 4px
- Bold labels with dark backgrounds for better visibility

**Technical Details:**
- HTML5 `<details>` elements for collapsible attractor items
- Event delegation for dynamic list items
- Coordinate transformation for drag (screenToSVG)
- Priority system for click disambiguation (attractor mode > drag > pan)
- Throttled reprocessing (500ms) for performance

**Status**: Attractor UI complete with all features from original interface. Ready for next Phase 3 task.

### Next Steps (Phase 3 Remaining)

According to [REFACTOR_PLAN.md](../REFACTOR_PLAN.md) Phase 3:

- [x] ~~Flesh out UI shell~~ ✅
- [x] ~~Implement pan/zoom + lightweight preview~~ ✅
- [x] ~~Add attractor placement with cached sampling~~ ✅
- [x] ~~Integrate live/manual preview switch + throttled recompute~~ ✅
- [x] ~~"Copy CLI command" action~~ ✅
- [x] ~~Hook up export pipeline~~ ✅
- [ ] **Sample preview testbed** - Simple shapes/lines for testing fill parameters before applying to main SVG
- [ ] **Performance optimization** - Consider web worker for heavy processing

**Remaining Phase 3 Tasks:**
1. Sample preview testbed (reusable test shapes panel)
2. Performance optimization (optional web worker)

**Phase 4 Preview:**
- Port advanced fill modes (focus blur, gradient)
- Restore calibration/diagnostic panels
- Config import/export for presets

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
