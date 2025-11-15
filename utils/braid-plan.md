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

## Where This Goes Next

- **Dial in the playground presets.** Use the new per-strand phase offsets, occluded-zone width sliders, and copy-to-clipboard debug output in `three-strand-braid-playground.html` to capture the exact deltas (phase trims, suppression cutoffs) that make the chevron weave look right at plotter scale.
- **Port discrete states into the real generator.** In `generateBarberPoleSmooth` derive a shared lead/middle/occluded state from `accumulatedTwist`, gate each family with pen-up `null` breaks, and leave the existing sigmoid/flat/cylindrical geometry untouched except for a fixed width multiplier on the middle strand.
- **Profile-specific tweaks.** Keep a small phase-bias map per profile (sigmoid vs flat-candy) so we can nudge the crossings without forking the occlusion logic; once tuned, expose those trims via CLI flags or advanced UI controls.
- **Developer instrumentation.** Mirror the playground’s debug overlay inside the barber-pole tuner (state colors + suppression readouts) so we can verify braid ordering on real SVG paths before exposing the new controls to end users.
- **Expose braid tuning knobs.** After the defaults feel solid, surface the useful parameters—suppression thresholds, occluded-zone width, per-family phase trim—through CLI switches and the tuner sidebar so different plotter setups can fine-tune the braid look.
