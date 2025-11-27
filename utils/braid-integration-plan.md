# Braid Integration Plan

This document captures the current thoughts on how to migrate the `braid-plait-lab` prototype into the main `/web-v2` app. Adjust, expand, or prune as needed.

---

## 1. Lock The Prototype
- **Harness more paths**: add a simple loader in `braid-plait-lab` that can ingest arbitrary SVG backbones so we can stress-test different path shapes (straight, wavy, sharp corners) before extraction.
- **Freeze fixtures**: capture two JSON fixture sets (straight and warped) that record input parameters plus generated geometry. These will become regression test inputs once the engine moves into `/web-v2`.

## 2. Define the Contract

### Module API

```javascript
generateBraid(backbone, params)
```

### Inputs

**backbone** (object): Path definition with two methods:
- `getPointAt(t)`: Returns `{x, y}` at normalized position `t` (0-1)
- `getTangentAt(t)`: Returns normalized tangent `{x, y}` at position `t`

**params** (object): Configuration with the following properties:

**User-Facing Parameters** (exposed in UI):
- `frequency` (number, 0.5-5.0, default: 2.25): Zigzag cycles along the braid
- `cycleJitter` (number, 0-0.5, default: 0): Random phase shift per cycle
- `zigzagScale` (number, 0-3.0, default: 1.0): Multiplier for center amplitude
- `wallScale` (number, 0-3.0, default: 1.0): Multiplier for wall amplitude
- `tipTaper` (number, 0-1.0, default: 0.0): Pinch factor at tips (0=none, 1=full)
- `fiberCount` (integer, 1-30, default: 10): Number of fibers per continuation
- `fiberBias` (number, 0-1.0, default: 0.5): Distribution bias (0=start, 0.5=even, 1=end)
- `fiberLanding` (number, 0-1.0, default: 0.0): Landing position offset
- `fiberBow` (number, 0-1.0, default: 0.5): Fiber curvature strength
- `bowGradient` (number, 0.5-4.0, default: 2.0): Gradient power for fiber curves

**Internal Parameters** (hard-coded in config):
- `wallBounceFactor` (number, default: 1.5): Wall wave frequency multiplier
- `zigzagPhase` (number, default: 0): Center zigzag phase offset in degrees
- `leftWallPhase` (number, default: 0): Left wall phase offset in degrees
- `rightWallPhase` (number, default: 0): Right wall phase offset in degrees
- `sampleSpacing` (number, default: 4): Spacing between samples in pixels
- `continuationLength` (number, default: 20): Base length for continuation curves
- `continuationBias` (number, default: 0.7): Continuation curve bias
- `landingSpread` (number, default: 1.0): Landing rail spread factor
- `wallSeparation` (number, default: 100): Distance between left/right walls
- `braidLength` (number): Total length of braid (derived from backbone)

### Outputs

Returns an object with the following structure:

```javascript
{
  outlines: [
    {
      side: 'left' | 'right' | 'center',
      type: 'wall' | 'zigzag' | 'continuation',
      points: [{x, y}, ...],  // Array of warped points
      index: number            // Ordering index
    },
    ...
  ],
  fibers: [
    {
      side: 'left' | 'right',
      points: [{x, y}, ...],   // Array of warped bezier curve points
      pairIndex: number,       // Source continuation index
      targetPairIndex: number, // Target continuation index
      fiberIndex: number       // Fiber index within pair
    },
    ...
  ],
  metadata: {
    braidLength: number,       // Total arc length
    centerExtremaCount: number,
    leftTroughCount: number,
    rightTroughCount: number,
    continuationCount: number,
    fiberCount: number,
    parameters: {...}          // Echo of input parameters
  }
}
```

### Layer Structure

**For SVG Export:**
- `braid-outline-center` (layer 1): Yellow zigzag center line
- `braid-outline-left` (layer 2): Cyan left wall curves
- `braid-outline-right` (layer 3): Magenta right wall curves
- `braid-continuations` (layer 4): Orange diagonal continuation curves
- `braid-fibers` (layer 5): White/gray fiber fill curves

### Parameter Dependencies

- `braidLength` is derived from backbone total arc length
- `fiberCount` adapts to available continuation length (prevents over-sampling)
- `tipTaper` affects wall/center samples, creating pinch at extrema
- `bowGradient` shapes `fiberBow` distribution (power curve from inner to outer)
- `continuationBias` controls bezier curve shape for diagonals

## 3. Extract the Engine Module ✅ COMPLETE

**Location:** `/web-v2/src/utils/braid-engine.js`

The engine module is now a pure JS module that is DOM-free and suitable for both browser and Node.js environments.

**What's Included:**
- ✅ Segment generation + continuation pairing
- ✅ Fiber creation + bow/taper logic with bezier curves
- ✅ Warp/taper helpers
- ✅ Utility sampling (arc length, normals, interpolation)
- ✅ Wave generation functions (zigzag, bounce, jitter)
- ✅ Extrema detection and wall partner matching
- ✅ Side ordering and opposite landing rail assignment

**Main Export:**
```javascript
import { generateBraid } from './utils/braid-engine.js';

const result = generateBraid(backbone, params);
// Returns: { outlines: [...], fibers: [...], metadata: {...} }
```

**Usage Example:**
```javascript
// Define backbone (or use null for straight braid)
const backbone = {
  getPointAt(t) { return { x: 0, y: t * 800 }; },
  getTangentAt(t) { return { x: 0, y: 1 }; }
};

// Configure parameters (all optional, defaults provided)
const params = {
  frequency: 2.25,
  fiberCount: 10,
  fiberBow: 0.5,
  bowGradient: 2.0,
  braidLength: 800
  // ... see contract above for full parameter list
};

// Generate
const braid = generateBraid(backbone, params);

// Use results
braid.outlines.forEach(outline => {
  console.log(`${outline.side} ${outline.type}:`, outline.points.length, 'points');
});

braid.fibers.forEach(fiber => {
  console.log(`Fiber ${fiber.fiberIndex} on ${fiber.side}:`, fiber.points.length, 'points');
});
```

**Key Design Decisions:**
- No DOM dependencies (no canvas, no rendering)
- Pure functions throughout (stateless, testable)
- Warp transform applied at the end (clean separation of concerns)
- All parameters have sensible defaults
- Output structure matches the contract specification

## 4. Testing Strategy
- **Node CLI**: build a small script that loads the JSON fixtures, runs them through the module, and exports a temporary SVG. Use this both for visual inspection and CI.
- **Assertions**: add unit tests that check counts, bounding boxes, first/last points, and ordering (e.g., `L0-O4` → `R1-L0`). This catches regressions before touching the site.

## 5. Integrate into `/web-v2`
- Introduce a hidden “Braid” experiment page that plugs the current control panel into the new module. Render the module’s output into distinct `<g>` groups (outlines vs. fibers) so we can toggle layers.
- Once the page behaves, wire the module into the main SVG export pipeline so outlines and fibers become separate layers/pen instructions.

## 6. SVG Output
- **Layering**: emit at least two layers: `braid-outline` (orange/yellow) and `braid-fibers` (gray). Consider additional layers for debug overlays if needed.
- **Metadata**: store pen color, plot order, and pen pressure in data attributes so the plotter can differentiate fibers vs. outlines.

## 7. Feature Reduction Checklist
- Decide which controls are user-facing (e.g., width, fiber density, bow strength) and which remain hard-coded.
- Note any presets (e.g., “tight braid”, “loose plait”) that could replace manual sliders in `/web-v2`.
- Keep the full slider set available in `braid-plait-lab` for future experimentation.

## 8. Post-Integration Cleanup
- After the engine is stable in `/web-v2`, consolidate shared helpers (warp, sampling) so we don’t maintain two versions.
- Update this document with lessons learned and parameter defaults before exposing the feature broadly.

---

### Open Questions / Notes
- Which parameters must remain exposed for artists? (Start listing them here.)
- Do we need additional fixtures (e.g., non-symmetric backbone, abrupt corners)?
- How should we surface braid presets in the UI?

Add comments below as ideas surface.

### Parameters
- Needed
  - Frequency Cycles
  - Cycle Jitter
  - Zigzag Scale
  - Wall Scale
  - Tip Taper
  - Fiber Count
  - Fiber Bias
  - Fiber Landing offset
  - Fiber bow strength
- Can be hidden, but part of the params and kept at their current values:
  - Wall bounce factor - keep this value
  - Zigzag Phase
  - Continuation length
  - Left Wall Phase
  - Right Wall Phase
  - Sample spacing - should be just set to 4px in final, 6px isn't high enough i think
  - Continuation bias 
  - Landing Spread
- Unnecessary for final implementation, so these can be cut:
  - Don't care about straight or wavy toggle
  - Backbone frequency doesnt need to be there since it effects wavy 
  - Braid Length - this should ultimately depend on the path it is following as its center line
  - Any of the canvas zoom/pan controls
  - Any of the overlay
- Can just be cut and removed from the lab
  - Diagonal search window doesn't seem to do anything
  - Diagonal curve strength