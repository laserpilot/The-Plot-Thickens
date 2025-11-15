# Three-Strand Braid Algorithm (Chevron Pattern)

## Mental Model: Classic Hair Plait

Think of a traditional three-strand hair braid where:
- Two strands form the sharp V in front
- Third strand slips behind
- Strands rotate roles every 1/3 cycle

**Key insight**: The chevron comes from diagonal crossings, not discrete positioning.

## Core Principles

1. **Position is independent of visibility**
   - Each strand follows a smooth sinusoidal path across the width
   - Phase offsets create natural diagonal crossings
   - Position does NOT get multiplied by visibility weight

2. **Visibility controls thickness and clipping**
   - Strand width scales by visibility weight (occluded = thinner)
   - Polylines break when visibility drops below threshold
   - NO opacity tricks - everything discrete for pen plotting

3. **Zone-based occlusion ordering: 0>1, 1>2, 2>0**
   - Cycle divided into 3 equal zones
   - Each zone has one "lead" family (on top)
   - Sequential occlusion pattern ensures proper weaving

## Algorithm

### 1. Path Generation (Sinusoidal with Phase Offsets)

```javascript
// For each strand (0, 1, 2):
const strandPhase = (phase + strandIdx / 3) % 1.0;
const centerOffset = halfWidth * Math.sin(strandPhase * 2 * Math.PI);

// NOTE: Do NOT multiply centerOffset by visibility!
// Position is independent - strands always cross the full width
```

**Why this works**:
- Strand 0: phase offset = 0
- Strand 1: phase offset = 1/3 (120° behind)
- Strand 2: phase offset = 2/3 (240° behind)
- Three sinusoids naturally create crossing diagonals

### 2. Zone-Based Visibility Weights

```javascript
// Determine current zone (0, 1, or 2)
const zoneIndex = Math.floor(normalizedPhase * 3);

// Lead family for this zone
const leadFamily = zoneIndex;
const occludedFamily = (leadFamily + 1) % 3;

// Assign weights based on role
if (familyIdx === leadFamily) {
  visibility = 1.0;  // Lead: full width
} else if (familyIdx === occludedFamily) {
  visibility = 0.1 * (1 - suppression);  // Occluded: thin/hidden
} else {
  visibility = 0.6 * (1 - suppression);  // Middle: medium
}
```

**Zone progression**:
- Zone 0: Family 0 leads, Family 1 occludes, Family 2 middle
- Zone 1: Family 1 leads, Family 2 occludes, Family 0 middle
- Zone 2: Family 2 leads, Family 0 occludes, Family 1 middle

### 3. Apply Visibility to Thickness Only

```javascript
// Scale thickness by visibility
const actualThickness = strandThickness * Math.max(0.02, visibility);

// Calculate boundary curves
const centerX = curr.x + perp.x * centerOffset;  // Position unchanged!
const centerY = curr.y + perp.y * centerOffset;

const leftX = centerX - perp.x * (actualThickness / 2);
const leftY = centerY - perp.y * (actualThickness / 2);
const rightX = centerX + perp.x * (actualThickness / 2);
const rightY = centerY + perp.y * (actualThickness / 2);
```

### 4. Clip Polylines When Hidden

```javascript
// Break the polyline when visibility drops too low
if (visibilityScale > 0.01) {
  // Add points to left/right/center arrays
} else {
  // Add null to break the polyline
  strands[strandIdx].left.push(null);
  strands[strandIdx].right.push(null);
  strands[strandIdx].center.push(null);
}
```

## Output for Pen Plotting

Each strand produces three polylines:
- **Left boundary**: Array of {x, y} points with nulls for breaks
- **Right boundary**: Array of {x, y} points with nulls for breaks
- **Center line**: Optional reference (can omit for final output)

The plotter draws discrete line segments - when a strand goes "under", it appears thinner and may have gaps, but it still follows its sinusoidal path.

## Suppression Parameter

The `suppression` slider (0.0 - 0.9) controls how aggressively to hide non-lead strands:

- **suppression = 0.0**: All three visible (occluded=0.1, middle=0.6)
- **suppression = 0.5**: Middle/occluded significantly faded
- **suppression = 0.9**: Only lead visible (others nearly zero width)

Implemented as:
```javascript
const middleWeight = 0.6 * (1 - suppression);
const occludedWeight = 0.1 * (1 - suppression);
```

## Key Mistakes to Avoid

❌ **Don't multiply position by visibility**
```javascript
// WRONG:
const centerOffset = laneOffset * visibilityScale;  // Collapses to center!
```

❌ **Don't use discrete lane snapping**
```javascript
// WRONG:
laneOffset = familyIdx === lead ? halfWidth : 0;  // Creates zigzags!
```

❌ **Don't rely on opacity for pen plotting**
```javascript
// WRONG:
ctx.globalAlpha = visibility;  // Pen can't vary opacity!
```

✅ **Correct approach**:
- Smooth sinusoidal paths for all strands
- Visibility scales thickness only
- Break polylines for clipping

## Porting to Main Barber Pole

When integrating into `generateBarberPoleSmooth()`:

1. Use existing `samplePathWithTwist()` for centerline sampling
2. Replace current three-strand logic with sinusoidal offsets
3. Keep zone-based `calculateThreeStrandVisibility()` function
4. Apply visibility to `stripeWidthFactor`, not to lateral offset
5. Output left/right boundary curves as separate stripe families

## Parameters

- **twistFrequency**: How many times the braid cycles along the path
- **strandWidth**: Total width of the three-strand bundle (halfWidth = radius)
- **strandThickness**: Individual ribbon thickness (scaled by visibility)
- **suppression**: How much to hide middle/occluded strands (0-0.9)

## Visual Result

The chevron V-shape appears where:
- Two strands converge at edges (one ascending, one descending)
- Third strand is tucked behind at center (thin or clipped)
- Pattern repeats every 1/3 cycle as roles rotate

This creates the classic braided appearance without needing discrete lane positions or opacity tricks.

## Bundle Tightness Macro Control

To simplify braid tuning, a **bundle tightness** macro (0-1) derives multiple parameters using linear interpolation:

### Derivation Formulas

```javascript
// bundleTightness ∈ [0, 1] where:
//   0 = loose bundle (wider gaps, earlier suppression)
//   1 = tight bundle (narrow gaps, extended visibility)

const lerp = (a, b, t) => a + (b - a) * t;

// Thickness multipliers
leadThickness = lerp(0.8, 1.1, tight);        // 0.8 → 1.1
middleThickness = lerp(0.4, 0.9, tight);      // 0.4 → 0.9
occludedThickness = lerp(0.15, 0.05, tight);  // 0.15 → 0.05 (inverted!)

// Occlusion zone geometry
occludedZoneWidth = lerp(0.38, 0.22, tight);  // 0.38 → 0.22
occludedZoneCenter = 0.5;                      // Always centered

// Suppression cutoffs (when linkSuppression is enabled)
middleSuppressionCutoff = lerp(0.55, 0.85, tight);      // 0.55 → 0.85
occludedSuppressionCutoff = lerp(0.3, 0.55, tight);     // 0.3 → 0.55
```

### Implementation in Playground

The `three-strand-braid-playground.html` implements this with:
- **Bundle Tightness slider**: Primary macro control (0-1)
- **Link suppression checkbox**: Derives cutoffs from tightness when checked
- **Manual override**: Tweaking advanced controls sets `manualOverride = true`
- **Reset button**: Clears override and re-derives from bundle tightness
- **Bundle fill visualization**: Translucent gray overlay shows bundle shape

### Validation Criteria

Test at extremes to verify behavior:

**bundleTightness = 0 (Loose)**:
- Wider occluded zone (more hiding)
- Thinner lead/middle strands
- Middle strand suppresses earlier (cutoff 0.55)
- Bundle overlay shows visible gaps
- Chevron pattern still recognizable

**bundleTightness = 1 (Tight)**:
- Narrow occluded zone (less hiding)
- Thicker lead/middle strands
- Middle strand visible longer (cutoff 0.85)
- Bundle overlay appears as single tight ribbon
- Minimal gaps between crossings
- Over/under sequence remains correct

### Port to generateBarberPoleSmooth

When integrating into production barber pole generator:
1. Add `bundleTightness` parameter (default: 0.5)
2. Derive thickness multipliers and zone width using above formulas
3. Apply to existing `calculateThreeStrandVisibility()` logic
4. Expose via CLI flag: `--bundle-tightness 0.0-1.0`
5. Add to tuner UI as primary braid control

## Where This Goes Next

- **Dial in the playground presets.** Use the new per-strand phase offsets, occluded-zone width sliders, and copy-to-clipboard debug output in `three-strand-braid-playground.html` to capture the exact deltas (phase trims, suppression cutoffs) that make the chevron weave look right at plotter scale.
- **Port discrete states into the real generator.** In `generateBarberPoleSmooth` derive a shared lead/middle/occluded state from `accumulatedTwist`, gate each family with pen-up `null` breaks, and leave the existing sigmoid/flat/cylindrical geometry untouched except for a fixed width multiplier on the middle strand.
- **Profile-specific tweaks.** Keep a small phase-bias map per profile (sigmoid vs flat-candy) so we can nudge the crossings without forking the occlusion logic; once tuned, expose those trims via CLI flags or advanced UI controls.
- **Developer instrumentation.** Mirror the playground's debug overlay inside the barber-pole tuner (state colors + suppression readouts) so we can verify braid ordering on real SVG paths before exposing the new controls to end users.
- **Expose braid tuning knobs.** After the defaults feel solid, surface the useful parameters—suppression thresholds, occluded-zone width, per-family phase trim—through CLI switches and the tuner sidebar so different plotter setups can fine-tune the braid look.

## Alternate Plotter-Friendly Path: Ribbon Polygons + Clipping

If the parametric visibility model still feels too brittle, we can fall back to an explicit hidden-line removal pipeline tailored to pen plotters:

1. **Straight braid with depth ordering**
   - For each strand `i` and longitudinal coordinate `y`, compute sinusoidal offsets and a synthetic depth:
     ```js
     const angle = freq * y + (i / 3) * TAU;
     const x = width * Math.sin(angle);   // lateral offset
     const z = Math.cos(angle);           // depth rank (1 = front)
     ```
   - Offset the centerline by ±(thickness / 2) along the local normal to build full ribbon polygons.

2. **Segment-wise polygon clipping**
   - March along the straight braid in small segments where the z-order is stable.
   - For each segment, sort strands by `z` and use a clipping library (e.g., `clipper-lib`, Paper.js) to subtract higher-ranked polygons from lower ones:
     ```
     visibleBottom = bottomPoly
       .difference(midPoly)
       .difference(topPoly);
     visibleMiddle = midPoly.difference(topPoly);
     visibleTop = topPoly;
     ```
   - Append the resulting visible outlines to per-strand path arrays.

3. **Warp onto the actual backbone**
   - Normalize straight-braid `y` to `t = y / totalLength`.
   - Sample the real backbone path at `t` to obtain point `P(t)` and normal `N(t)`.
   - Map each straight-braid point by `finalPoint = P(t) + N(t) * x`, effectively “pasting” the clipped braid onto the curved path.

4. **Emit toolpaths**
   - After clipping and warping, each strand’s left/right boundaries are already discrete polylines with occlusion resolved—perfect for exporting as pen-plotter paths without runtime visibility logic.

This approach is heavier (requires polygon clipping and segment bookkeeping) but guarantees clean hidden-line removal once the playground tuning reaches diminishing returns.

### Fiber Density Extension

- Instead of a single ribbon polygon per strand, generate multiple inner "fiber" polylines (e.g., 5 offsets across the thickness) plus one outer occluder polygon. Run the same clipping pass, subtracting occluder polygons from each fiber line to obtain discrete, plot-ready segments.
- Because fibers are generated in straight space before clipping/warping, we can vary their spacing procedurally (denser near the inner edge, sparser near the outer edge) simply by sampling different offsets. Post-clipping, warp every retained fiber segment with the same `finalPoint = P(t) + N(t) * x` transform.
- This keeps the hidden-line removal exact while giving us future hooks for density controls, per-fiber jitter, or hair-like texturing within each visible strand.

---

## Polygon Clipping Implementation Design

### Overview

This section documents the detailed design for implementing the ribbon polygons + clipping approach in `three-strand-braid-clipping.html`. This prototype validates the geometric hidden-line removal technique before integrating into the main barber pole generator.

### Architecture: Four-Stage Pipeline

**Stage 1: Straight Braid Generation**
- Generate braid geometry in simplified 2D straight-space coordinates
- Y-axis = longitudinal (along braid length)
- X-axis = lateral offset from centerline
- Z-axis = synthetic depth for front-to-back ordering

**Stage 2: Ribbon Polygon Construction**
- Build closed polygons by offsetting strand centerlines perpendicular to tangent
- Each segment produces a 4-sided polygon (quad)
- Offset distance = ±(thickness / 2)

**Stage 3: Polygon Clipping (Hidden Line Removal)**
- Sort strands by z-depth per segment
- Use boolean difference operations to subtract higher-ranked polygons from lower
- Produces discrete, occlusion-resolved geometry

**Stage 4: Warp Transform**
- Map straight-space coordinates onto curved backbone path
- Normalize y → t parameter [0, 1]
- Transform: `finalPoint = P(t) + x * N(t)`

### Technology Choices

**Clipping Library:** `polygon-clipping` (v0.15.3)
- Modern, actively maintained NPM package
- Clean API: `difference(poly1, poly2)`
- Returns simple coordinate arrays
- ~30KB minified
- Aligns with web-v2's minimal dependency philosophy

**Rendering:** Native HTML5 Canvas 2D API
- Consistent with existing web-v2 architecture
- Path2D objects for efficient rendering
- Custom viewport management

**Integration:** Standalone HTML file
- CDN-loaded polygon-clipping library
- No build step required for prototype
- Easy to test and iterate

### Coordinate Systems

**Straight-space (generation):**
```
Origin: (0, 0) at top-center of braid
Y-axis: Points down (increases along braid length)
X-axis: Points right (lateral displacement)
Z-axis: Points toward viewer (depth ordering only, not rendered)
```

**World-space (rendering):**
```
Canvas pixel coordinates
Origin: top-left of canvas
Applied after all geometric operations
```

### Data Structures

**Segment Structure:**
```javascript
{
  angleStart: number,      // Starting angle in radians
  angleEnd: number,        // Ending angle in radians
  strands: [
    {
      strandIndex: 0,      // Which strand (0, 1, 2)
      centerline: [        // Start and end points
        [x0, y0],
        [x1, y1]
      ],
      leftEdge: [[x, y], [x, y]],
      rightEdge: [[x, y], [x, y]],
      polygon: [           // polygon-clipping format
        [[x, y], [x, y], [x, y], [x, y], [x, y]] // closed ring
      ],
      z: number,           // Average depth for sorting
      visiblePolygon: [    // After boolean operations
        // May be empty [], single polygon, or multiple polygons
      ]
    },
    // ... strands 1 and 2
  ]
}
```

**Global State:**
```javascript
{
  params: {
    frequency: 2,          // Braid cycles per total length
    thickness: 20,         // Ribbon width in pixels
    braidLength: 400,      // Total length in straight-space
    segmentAngleDelta: 5,  // Degrees per segment (resolution)
    backboneAmplitude: 0   // 0 = straight (Phase A), >0 = sine wave (Phase B)
  },
  segments: [],            // Array of Segment objects
  backbonePath: null       // Phase B: curve sampling functions
}
```

### Stage 1: Straight Braid Generation

**Algorithm:**
```javascript
function generateStraightBraid(params) {
  const { frequency, braidLength, segmentAngleDelta, thickness } = params;
  const segments = [];

  // Total angle range for all cycles
  const totalAngle = frequency * 2 * Math.PI;
  const angleStep = (segmentAngleDelta * Math.PI) / 180;

  for (let angle = 0; angle < totalAngle; angle += angleStep) {
    const segment = {
      angleStart: angle,
      angleEnd: Math.min(angle + angleStep, totalAngle),
      strands: []
    };

    // Generate all 3 strands for this segment
    for (let strandIndex = 0; strandIndex < 3; strandIndex++) {
      const phase = (strandIndex / 3) * 2 * Math.PI;

      // Sample at segment start and end
      const points = [angle, segment.angleEnd].map(a => {
        const y = (a / totalAngle) * braidLength;
        const x = (thickness * 2) * Math.sin(a + phase);
        const z = Math.cos(a + phase);  // 1 = front, -1 = back
        return { x, y, z };
      });

      segment.strands.push({
        strandIndex,
        centerline: [
          [points[0].x, points[0].y],
          [points[1].x, points[1].y]
        ],
        z: (points[0].z + points[1].z) / 2  // Average for sorting
      });
    }

    segments.push(segment);
  }

  return segments;
}
```

**Key Details:**
- Phase offsets: 0°, 120°, 240° for natural three-strand weaving
- Z-depth calculated from cosine (front = +1, back = -1)
- Lateral amplitude = 2× thickness to allow overlap
- Segments sized by angle increments (not arc length) for stability

### Stage 2: Ribbon Polygon Construction

**Algorithm:**
```javascript
function buildRibbonPolygons(segment, thickness) {
  segment.strands.forEach(strand => {
    const [p0, p1] = strand.centerline;

    // Calculate tangent vector
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.sqrt(dx * dx + dy * dy);

    // Normalized tangent
    const tx = dx / len;
    const ty = dy / len;

    // Perpendicular normal (rotate tangent 90° CCW)
    const nx = -ty;
    const ny = tx;

    // Offset by half thickness
    const offset = thickness / 2;

    // Build quad vertices (counter-clockwise winding)
    const leftEdge = [
      [p0[0] + nx * offset, p0[1] + ny * offset],
      [p1[0] + nx * offset, p1[1] + ny * offset]
    ];
    const rightEdge = [
      [p0[0] - nx * offset, p0[1] - ny * offset],
      [p1[0] - nx * offset, p1[1] - ny * offset]
    ];

    strand.leftEdge = leftEdge;
    strand.rightEdge = rightEdge;

    // Closed polygon for clipping (must close the loop)
    strand.polygon = [[
      leftEdge[0],
      leftEdge[1],
      rightEdge[1],
      rightEdge[0],
      leftEdge[0]  // Close the ring
    ]];
  });
}
```

**Key Details:**
- Normal vector = tangent rotated 90° counter-clockwise
- Quad vertices ordered CCW for proper polygon orientation
- Final vertex duplicates first to close the ring (required by polygon-clipping)
- Simple rectangles; overlaps between adjacent segments handled by clipping

### Stage 3: Polygon Clipping

**Algorithm:**
```javascript
import { difference } from 'polygon-clipping';

function performOcclusionClipping(segment) {
  // Sort strands by depth (front to back: high z to low z)
  const sorted = segment.strands.slice().sort((a, b) => b.z - a.z);

  // Front strand is always fully visible
  sorted[0].visiblePolygon = sorted[0].polygon;

  // Middle strand: subtract front strand
  sorted[1].visiblePolygon = difference(
    sorted[1].polygon,
    sorted[0].polygon
  );

  // Back strand: subtract both front and middle strands
  let backVisible = sorted[2].polygon;
  backVisible = difference(backVisible, sorted[0].polygon);
  backVisible = difference(backVisible, sorted[1].polygon);
  sorted[2].visiblePolygon = backVisible;

  // Note: visiblePolygon may be:
  // - Empty array [] if fully occluded
  // - Single polygon if partially visible
  // - Multiple polygons if split by occlusion
  // - Polygon with holes (outer ring + hole rings)
}
```

**Clipping Result Cases:**

**Fully visible:**
```javascript
[
  [[x1, y1], [x2, y2], [x3, y3], [x4, y4], [x1, y1]]
]
```

**Partially occluded (split):**
```javascript
[
  [[x1, y1], [x2, y2], [x3, y3], [x1, y1]],  // First fragment
  [[x4, y4], [x5, y5], [x6, y6], [x4, y4]]   // Second fragment
]
```

**Polygon with hole:**
```javascript
[
  [
    [x1, y1], [x2, y2], [x3, y3], [x1, y1],  // Outer ring (CCW)
    [x4, y4], [x5, y5], [x6, y6], [x4, y4]   // Hole (CW)
  ]
]
```

**Fully occluded:**
```javascript
[]
```

**Key Details:**
- Z-sorting is per-segment (depth order can change between segments)
- Boolean operations are cumulative (back strand subtracts both others)
- Must handle empty results gracefully in rendering
- Use evenodd fill rule for polygons with holes

### Stage 4: Warp Transform

**Phase A: Straight Backbone (Identity Transform)**
```javascript
// No warping needed - straight-space = world-space
function renderPhaseA(visiblePolygon, ctx) {
  // Polygons already in final coordinates
  drawPolygon(ctx, visiblePolygon);
}
```

**Phase B: Curved Backbone (Sine Wave)**
```javascript
function createSineBackbone(amplitude, braidLength) {
  return {
    getPointAt(t) {
      // t ∈ [0, 1]
      const y = t * braidLength;
      const x = amplitude * Math.sin(t * 2 * Math.PI * 2); // 2 cycles
      return { x, y };
    },

    getTangentAt(t) {
      const delta = 0.001;
      const p0 = this.getPointAt(t - delta);
      const p1 = this.getPointAt(t + delta);
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: dx / len, y: dy / len };
    }
  };
}

function warpToBackbone(straightPolygon, params) {
  const { braidLength, backbonePath } = params;

  return straightPolygon.map(polygon => {
    return polygon.map(ring => {
      return ring.map(([x, y]) => {
        // Normalize y to parameter t
        const t = y / braidLength;

        // Sample backbone
        const P = backbonePath.getPointAt(t);
        const tangent = backbonePath.getTangentAt(t);

        // Normal perpendicular to tangent
        const normal = { x: -tangent.y, y: tangent.x };

        // Map: finalPoint = P(t) + x * N(t)
        return [
          P.x + x * normal.x,
          P.y + x * normal.y
        ];
      });
    });
  });
}
```

**Key Details:**
- Tangent computed via finite differences (simple and robust)
- Normal = tangent rotated 90°
- Lateral offset (x) determines displacement along normal
- All polygons warped identically (maintains occlusion relationships)

### Rendering

**Canvas Rendering with Hole Support:**
```javascript
function renderVisiblePolygons(ctx, segments, colors) {
  segments.forEach(segment => {
    segment.strands.forEach(strand => {
      if (!strand.visiblePolygon || strand.visiblePolygon.length === 0) {
        return; // Fully occluded
      }

      ctx.fillStyle = colors[strand.strandIndex];

      // Each element is a separate polygon
      strand.visiblePolygon.forEach(polygon => {
        ctx.beginPath();

        // Each ring in the polygon
        polygon.forEach((ring, ringIndex) => {
          ring.forEach((point, i) => {
            if (i === 0) ctx.moveTo(point[0], point[1]);
            else ctx.lineTo(point[0], point[1]);
          });
          ctx.closePath();
        });

        // evenodd fill handles holes correctly
        ctx.fill('evenodd');
      });
    });
  });
}
```

### UI: Three-Panel Visualization

**Layout:**
```
┌─────────────┬─────────────┬─────────────┐
│   Panel 1   │   Panel 2   │   Panel 3   │
│  Straight   │  Clipped    │   Warped    │
│   Braid     │  Ribbons    │   Result    │
└─────────────┴─────────────┴─────────────┘
       ▲              ▲             ▲
   Raw input    Core algo      Final output
```

**Panel 1: Pre-Clipping (Validation)**
- Shows all ribbon polygons before boolean ops
- Strands rendered with transparency to see overlaps
- Validates polygon construction

**Panel 2: Post-Clipping (Critical Validation)**
- Shows visiblePolygon results
- Occlusion should be geometrically perfect
- Missing regions indicate successful clipping
- This is the key debugging view

**Panel 3: Warped (Final Result)**
- Phase A: Identical to Panel 2 (straight backbone)
- Phase B: Shows braid following curved path
- Validates warp transform correctness

**Control Panel:**
```javascript
const controls = {
  // Basic parameters
  frequency: { min: 0.5, max: 5, default: 2, step: 0.1 },
  thickness: { min: 5, max: 50, default: 20, step: 1 },
  braidLength: { min: 200, max: 800, default: 400, step: 50 },
  segmentAngleDelta: { min: 1, max: 20, default: 5, step: 1 },

  // Phase B controls (initially hidden)
  backboneAmplitude: { min: 0, max: 100, default: 0, step: 5 },

  // Visualization toggles
  showWireframes: false,
  showZDepthColors: false,
  highlightStrand: -1  // -1 = all, 0/1/2 = specific strand
};
```

### Implementation Phases

**Phase A: Straight Braid with Clipping**
1. HTML structure with three canvases + control panel
2. Load polygon-clipping from CDN
3. Implement generateStraightBraid()
4. Implement buildRibbonPolygons()
5. Implement performOcclusionClipping()
6. Implement three-panel rendering
7. Wire up controls and parameter updates
8. **Validation:** Middle panel shows clean geometric occlusion

**Phase B: Backbone Warping**
1. Implement createSineBackbone()
2. Implement warpToBackbone()
3. Update Panel 3 to show warped result
4. Add backboneAmplitude control
5. **Validation:** Braid follows curve with correct occlusion

**Phase C: Export & Polish**
1. Add SVG export (convert polygons to path strings)
2. Performance profiling and optimization
3. Code documentation and inline comments
4. Update this design doc with lessons learned

### Success Criteria

**Phase A Complete:**
- ✅ Panel 2 shows zero overlapping strands
- ✅ Visible regions are geometrically clipped
- ✅ Adjusting thickness/frequency maintains clean occlusion
- ✅ Performance < 100ms to regenerate
- ✅ No visual artifacts or gaps in visible areas

**Phase B Complete:**
- ✅ Braid smoothly follows sine wave backbone
- ✅ Occlusion remains correct after warping
- ✅ Can adjust amplitude without breaking
- ✅ Tangent calculation produces smooth curves

**Ready for Web-v2 Integration:**
- ✅ SVG export produces clean, plotter-ready paths
- ✅ Code is well-documented with clear separation of stages
- ✅ Algorithm validated on complex curves
- ✅ Performance acceptable for interactive use

### Integration Path to Web-v2

Once prototype is validated:

1. **Extract core algorithm** into shared utility module
2. **Adapt to barber pole backbone** paths (use existing path sampling)
3. **Replace parametric visibility** with clipping-based occlusion
4. **Maintain backward compatibility** via feature flag
5. **Performance optimization** if needed (segment caching, etc.)
6. **Expose controls** in tuner UI

### Advantages Over Parametric Approach

**Geometric Correctness:**
- Exact occlusion (no approximation)
- No tuning of visibility thresholds
- Works identically across all path profiles

**Plotter-Friendly Output:**
- Discrete polylines already broken at occlusion boundaries
- No runtime visibility logic needed
- Clean gaps where strands go under

**Extensibility:**
- Easy to add fiber density (multiple lines per strand)
- Can vary fiber spacing procedurally
- Future: texture, jitter, varying thickness

**Debugging:**
- Intermediate stages are visually inspectable
- Clipping failures are obvious (overlaps remain)
- Separation of concerns (geometry vs visibility)

### Limitations & Trade-offs

**Computational Cost:**
- Boolean operations are O(n²) per segment
- More expensive than parametric thickness scaling
- Mitigated by: coarse angle increments, segment caching

**Complexity:**
- Additional dependency (polygon-clipping)
- More code than simple visibility weights
- Justified by: correctness, plotter requirements

**Rendering:**
- Must handle multiple polygon types (split, holes, empty)
- evenodd fill rule required
- More complex than simple polyline drawing

### Next Steps After Implementation

1. **Validate on real plotter** - Test exported SVG on physical hardware
2. **Optimize segment resolution** - Find minimum angle delta for smooth appearance
3. **Add fiber density** - Implement multiple lines per strand
4. **Performance tuning** - Profile and optimize hot paths
5. **Integrate into web-v2** - Port to production barber pole generator
6. **Document lessons learned** - Update this section with findings
