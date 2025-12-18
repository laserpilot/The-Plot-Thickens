# Curve Fitting Experiments: Wall Fold-Over on Tight Curves

## Problem Description

When the braid follows a tight curve, walls and fibers on the **inside** of the curve can fold over themselves. This creates visual artifacts where:
- Wall lines cross back over themselves
- Points bunch up creating jagged or noisy appearance
- Fibers get compressed and distorted

The issue is most visible in:
- **Meandering paths** with tight S-curves
- **L-shape paths** with sharp 90-degree turns
- Any curve where `radius < wallSeparation`

## Root Cause Analysis

### The Sampling Pipeline

1. **Straight-space sampling**: Wall and fiber points are generated at uniform intervals along the Y-axis in "straight" coordinate space
2. **Warp to curve**: Points are transformed onto the curved backbone using normals
3. **Point removal**: `removeFoldedPoints` tries to detect and remove problematic points
4. **Rendering**: Remaining points are connected with curves

### The Problem

When warping uniformly-spaced points onto a curve:
- Points on the **outside** of the curve spread apart (arc is longer)
- Points on the **inside** of the curve bunch together (arc is shorter)
- For very tight curves (radius < halfWidth), inside points can overlap or cross

### Sign Convention Discovery

The original `isOnInside` detection had the sign convention backwards:
- `curvature > 0` = counterclockwise turn = curving **LEFT** (in screen coords where Y is down)
- `curvature > 0 && adjustedX > 0` = curving left, right wall is **inside** (correct)
- `curvature < 0 && adjustedX < 0` = curving right, left wall is **inside** (correct)

**Commit 3ee498b** fixed this sign convention.

## Approaches Tried

### 1. Wave Amplitude Reduction (Partial Success)
Reduce the wave oscillation amplitude on inside walls when curvature is tight.

```javascript
const scaleFactor = Math.pow((radius - baseOffset) / (threshold - baseOffset), 4);
adjustedX = expectedBase + waveComponent * scaleFactor;
```

**Result**: Helps reduce fold-over but can make walls look "dead" or static.

### 2. Wall Shrink Transform (Partial Success)
Pull the inside wall toward the backbone on very tight curves.

```javascript
const shrinkFactor = Math.max(0, (radius - baseOffset) / (shrinkThreshold - baseOffset));
const shrunkBase = expectedBase * shrinkFactor;
adjustedX = shrunkBase + waveComponent * scaleFactor;
```

**Result**: Prevents the wall from extending too far but can create visual discontinuities.

### 3. Fiber Count Compression (Works but Aggressive)
Reduce the number of fibers on inside curves proportionally to compression.

```javascript
const compressionRatio = Math.max(0.2, (radius - halfWidth) / radius);
effectiveFiberCount = Math.max(1, Math.round(effectiveFiberCount * compressionRatio));
```

**Result**: Prevents fiber overlap but can look sparse.

### 4. Pre-Decimation of Inside Points (Works)
Remove bunched points on inside of curves BEFORE the fold-removal step.

```javascript
function decimateInsideCurve(warpedPoints, originalSamples, curvatureSamples, params, side) {
  // Skip points that are too close together on inside of curve
  if (dist < minDist) { removedCount++; continue; }
}
```

**Result**: Reduces bunching effectively. Controlled via "Inside Thin" slider.

### 5. Hard Clamp on Inside Wall (Safety Net)
Cap the maximum offset on inside walls to a fraction of the curve radius.

```javascript
const maxOffset = radius * 0.85;
if (curvature > 0 && adjustedX > 0) {
  adjustedX = Math.min(adjustedX, maxOffset);
}
```

**Result**: Prevents extreme fold-over but doesn't address point bunching.

## Current Implementation

All experimental transforms are gated behind a checkbox:

**"Experimental Curve Mode"** (default: OFF)

When OFF:
- Legacy behavior
- No wave reduction, shrink, or decimation
- Clean rendering

When ON:
- All tight-curve transforms active
- Includes wave reduction, shrink, fiber compression, decimation
- Use "Inside Thin" slider (0-1) to control decimation aggressiveness
- Use "Show Wall Points" to visualize point distribution

## Debug Tools

### Show Wall Points
Visualizes wall sample points with color-coded curvature:
- **Red** = Very tight (radius < halfWidth) - will likely fold
- **Orange** = Tight curve
- **Yellow** = Moderate curve
- **Green** = Loose inside curve
- **Blue** = Outside of curve (no compression)
- **Gray** = Straight section

### Inside Thin Slider
Controls pre-decimation aggressiveness:
- 0 = No decimation
- 1 = Aggressive decimation on tight inside curves

### Console Logging
- `[TIGHT CURVE]` - Logs pairs where radius < 2x wallSeparation
- `[DECIMATE]` - Shows points removed by decimation
- `[FOLD DEBUG]` - Shows points removed by fold detection
- `[WAVE DEBUG]` - Shows wave reduction values on tight curves

## Issues to Address

1. **Fiber appearance**: Experimental mode can make fibers look "noisy" instead of smooth curves
2. **Continuation lines**: May not reach walls properly with aggressive shrink
3. **Redistribution interaction**: Doesn't play well with the redistribution slider
4. **Point removal cascade**: Aggressive decimation followed by fold removal can leave too few points

## Future Directions

1. **Adaptive sampling**: Generate fewer points on inside of curves from the start, instead of generating uniformly and decimating
2. **Curvature-aware spline fitting**: Use B-splines or similar that handle variable point density gracefully
3. **Separate inside/outside wall treatment**: Different wave patterns for inside vs outside
4. **Progressive complexity**: Start simple and only add complexity where needed

## Related Files

- `utils/braid-stress-test.html` - Main stress test with all experimental code
- `web-v2/src/utils/braid-engine.js` - Production braid engine (has same isOnInside fix)

## Related Commits

- `3ee498b` - Fix inside/outside curve detection and add L-shape debug path
- `a661e5c` - Add experimental curve mode toggle and wall point visualization
