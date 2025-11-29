# Shadow-Side Density Implementation Plan

## Goal
Make hatch density respond to point/directional light so the **shadow edge** of each ribbon (side facing away from light) gets denser lines, while the **highlight edge** (facing toward light) stays sparse. This creates automatic gradient that flips based on stroke orientation.

## Key Concept
Instead of uniform density across ribbon width, **bias hatch line placement** toward the shadow side:
- Calculate which edge faces light (highlight) vs away (shadow) using dot product
- Shift hatch origin toward shadow edge so more lines accumulate there
- Automatically handles spikes, loops, and closed shapes

---

## Implementation Steps

### 1. Update Core Function: `generateHatchGradientFill()`

**File**: [web/offset-utils.js](web/offset-utils.js)

#### A. Add `shadowBias` Parameter (Line ~1180-1202)

```javascript
function generateHatchGradientFill(
  pathData,
  baseWidth,
  hatchAngles,
  baseSpacing,
  lightAngle,
  lightStrength = 0.8,
  baseWeight = 0.2,
  shadowSoftness = 0.5,
  noise = 0,
  seed = 0,
  pathId = '',
  offsetEnvelope = null,
  noiseFrequency = 50,
  organicOptions = {},
  extractOutline = false,
  lightMode = 'directional',
  lightPosX = 0,
  lightPosY = 0,
  falloffRadius = 100,
  densityOptions = {},
  curvatureScore = 0,
  shadowBias = 0.5  // NEW: Controls how far to shift toward shadow edge
) {
```

#### B. Replace Weight Calculation Logic (Line ~1335-1380)

**FIND** (around line 1335 in the hatch generation loop):
```javascript
// Calculate weight based on lighting mode
let rawWeight;

if (lightMode === 'point') {
  // POINT LIGHT MODE: Calculate direction and distance from sample to light
  const toLightX = lightPosX - sample.x;
  const toLightY = lightPosY - sample.y;
  const dist = Math.sqrt(toLightX * toLightX + toLightY * toLightY);

  if (dist < 0.001) {
    rawWeight = baseWeight;
  } else {
    const lightDirX = toLightX / dist;
    const lightDirY = toLightY / dist;

    const orientDot = sample.nx * lightDirX + sample.ny * lightDirY;
    // Remap signed dot to [0,1]: +1 (facing) → 0 (sparse), -1 (away) → 1 (dense)
    const orientWeight = (1 - orientDot) / 2;

    const distanceFalloff = 1 / (1 + dist / falloffRadius);
    const distWeight = 1 - distanceFalloff;

    const orientStrength = 0.7;
    const distStrength = 0.3;
    rawWeight = (orientWeight * orientStrength + distWeight * distStrength) * lightStrength + baseWeight;
  }
} else {
  // DIRECTIONAL MODE: Global light direction
  const dotProduct = sample.nx * globalLightDirX + sample.ny * globalLightDirY;
  rawWeight = ((1 - dotProduct) / 2) * lightStrength + baseWeight;
}

// Apply shadow softness (easing)
if (shadowSoftness > 0) {
  rawWeight = smoothstep(baseWeight, 1.0, rawWeight);
}

// Clamp weight
const weight = Math.max(0, Math.min(1, rawWeight));
```

**REPLACE WITH**:
```javascript
// NEW: Calculate highlight factor (which side faces the light)
let highlightFactor; // 0 = shadow side, 1 = highlight side

if (lightMode === 'point') {
  const toLightX = lightPosX - sample.x;
  const toLightY = lightPosY - sample.y;
  const dist = Math.hypot(toLightX, toLightY);

  if (dist < 0.001) {
    highlightFactor = 1.0; // At light position, fully lit
  } else {
    const lightDirX = toLightX / dist;
    const lightDirY = toLightY / dist;

    // Dot product: +1 = facing light (highlight), -1 = facing away (shadow)
    const dot = sample.nx * lightDirX + sample.ny * lightDirY;

    // Map to [0,1]: 1 = highlight, 0 = shadow
    highlightFactor = (dot + 1) * 0.5;

    // Optional: Apply softness for smoother transitions
    if (shadowSoftness > 0) {
      highlightFactor = Math.pow(highlightFactor, 1 + shadowSoftness);
    }

    // Optional: Apply distance falloff
    const distanceFalloff = 1 / (1 + dist / falloffRadius);
    highlightFactor *= distanceFalloff;
  }
} else {
  // Directional mode
  const dot = sample.nx * globalLightDirX + sample.ny * globalLightDirY;
  highlightFactor = (dot + 1) * 0.5;

  if (shadowSoftness > 0) {
    highlightFactor = Math.pow(highlightFactor, 1 + shadowSoftness);
  }
}

// Shadow factor: inverse of highlight
const shadowFactor = 1 - highlightFactor;

// Density: sparse on highlight, dense on shadow
const density = baseWeight + shadowFactor * lightStrength;
const weight = Math.max(0.05, Math.min(1.0, density));
```

#### C. Add Shadow Bias Offset (Line ~1396-1403)

**FIND** (around line 1396):
```javascript
// Apply position jitter if organic mode enabled
let sampleX = sample.x;
let sampleY = sample.y;
if (organicEnabled && positionJitter > 0) {
  const jitterAmount = simpleNoise(currentArcLength / 20 + seed * 500, seed + hatchIndex) * positionJitter;
  sampleX += sample.nx * jitterAmount;
  sampleY += sample.ny * jitterAmount;
}
```

**REPLACE WITH**:
```javascript
// NEW: Bias hatch origin toward shadow edge
// This shifts more hatch lines to the shadow side
const shadowOffset = sample.halfWidth * shadowFactor * shadowBias;
let sampleX = sample.x - sample.nx * shadowOffset;
let sampleY = sample.y - sample.ny * shadowOffset;

// Apply position jitter if organic mode enabled (on top of shadow bias)
if (organicEnabled && positionJitter > 0) {
  const jitterAmount = simpleNoise(currentArcLength / 20 + seed * 500, seed + hatchIndex) * positionJitter;
  sampleX += sample.nx * jitterAmount;
  sampleY += sample.ny * jitterAmount;
}
```

---

### 2. Add UI Controls

**File**: [web/index.html](web/index.html)

**Location**: Inside `hatch-gradient-controls` div, after the `shadow-softness` control (around line 408)

**ADD**:
```html
<label>
  Shadow Bias (edge shift):
  <input type="range" id="shadow-bias" min="0" max="1" step="0.05" value="0.5">
  <span id="shadow-bias-value">0.50</span>
  <span class="hint-icon"
    title="How far to shift hatch lines toward shadow edge. 0 = centered (uniform), 1 = fully shifted to shadow side.">?</span>
</label>

<label>
  <input type="checkbox" id="shadow-debug-mode">
  Debug: Show Shadow/Highlight Edges
  <span class="hint-icon"
    title="Visualize which edges face the light (blue = highlight, red = shadow). Helps verify gradient orientation.">?</span>
</label>
```

---

### 3. Add State Variables

**File**: [web/sketch.js](web/sketch.js)

**Location**: After existing hatch gradient state variables (around line 56)

**ADD**:
```javascript
// Hatch gradient state
// ... existing variables ...
let shadowBias = 0.5; // Bias hatch origin toward shadow edge (0 = centered, 1 = fully shifted)
let shadowDebugMode = false; // Visualize shadow/highlight edges for debugging
```

---

### 4. Wire UI Controls

**File**: [web/ui-controls.js](web/ui-controls.js)

**Location**: After existing gradient hatch controls (around line 476)

**ADD**:
```javascript
// Shadow bias control
setupSlider('shadow-bias', (value) => {
  shadowBias = value;
  needsRedraw = true;
  redraw();
  updateCLICommand();
  updateGradientPreview();
});

// Shadow debug mode toggle
const shadowDebugCheckbox = document.getElementById('shadow-debug-mode');
if (shadowDebugCheckbox) {
  shadowDebugCheckbox.addEventListener('change', (e) => {
    shadowDebugMode = e.target.checked;
    needsRedraw = true;
    redraw();
  });
}
```

---

### 5. Update Function Call Sites

#### A. Preview Rendering

**File**: [web/sketch.js](web/sketch.js)

**Location**: Line ~456-461 (hatch gradient preview rendering)

**FIND**:
```javascript
const hatchPaths = generateHatchGradientFill(
  path.d, baseWidth, gradientHatchAngles, gradientHatchSpacing,
  lightAngle, lightStrength, gradientBaseWeight, shadowSoftness,
  noise, seed, path.id, envelope, noiseFrequency, organicOptions, false,
  lightMode, lightX, lightY, falloffRadius, gradientDensityOptions, path.curvatureScore || 0
);
```

**CHANGE TO**:
```javascript
const hatchPaths = generateHatchGradientFill(
  path.d, baseWidth, gradientHatchAngles, gradientHatchSpacing,
  lightAngle, lightStrength, gradientBaseWeight, shadowSoftness,
  noise, seed, path.id, envelope, noiseFrequency, organicOptions, false,
  lightMode, lightX, lightY, falloffRadius, gradientDensityOptions,
  path.curvatureScore || 0, shadowBias  // ADD shadowBias parameter
);
```

#### B. Export Function

**File**: [web/ui-controls.js](web/ui-controls.js)

**Location**: Line ~1310-1315 (export SVG function)

**FIND**:
```javascript
const gradientResult = generateHatchGradientFill(
  path.d, baseWidth, gradientHatchAngles, gradientHatchSpacing,
  lightAngle, lightStrength, gradientBaseWeight, shadowSoftness,
  noise, seed, path.id, envelope, noiseFrequency, organicOptions, addOutlineStroke,
  lightMode, lightX, lightY, falloffRadius, gradientDensityOptions, path.curvatureScore || 0
);
```

**CHANGE TO**:
```javascript
const gradientResult = generateHatchGradientFill(
  path.d, baseWidth, gradientHatchAngles, gradientHatchSpacing,
  lightAngle, lightStrength, gradientBaseWeight, shadowSoftness,
  noise, seed, path.id, envelope, noiseFrequency, organicOptions, addOutlineStroke,
  lightMode, lightX, lightY, falloffRadius, gradientDensityOptions,
  path.curvatureScore || 0, shadowBias  // ADD shadowBias parameter
);
```

---

### 6. Optional: Debug Visualization

**File**: [web/sketch.js](web/sketch.js)

**Location**: Inside `renderOffsetPreview()` or create new debug render mode

**ADD** (pseudocode - implement as needed):
```javascript
if (shadowDebugMode && fillMode === 'hatch-gradient') {
  // For each path, draw colored edges:
  // - Blue on highlight side (facing light)
  // - Red on shadow side (facing away)

  // Recompute light direction at each sample point
  // Draw small perpendicular lines colored by shadowFactor
}
```

---

### 7. CLI Version (Same Changes)

**File**: [lib/path-utils.js](lib/path-utils.js)

Apply identical changes to the CLI version:

1. Add `shadowBias` parameter to `generateHatchGradientFill()` (line ~1028)
2. Replace weight calculation logic with highlight/shadow factor approach
3. Add shadow offset before casting hatch rays
4. Update all call sites in [lib/svg-processor.js](lib/svg-processor.js)

**File**: [process-svg.js](process-svg.js)

Add CLI flag:
```javascript
.option('--shadow-bias <value>', 'Bias hatch lines toward shadow edge (0-1)', parseFloat, 0.5)
```

Pass through to processing functions.

---

## Testing Strategy

### Test Cases

1. **Simple Spike Test**
   - Create path pointing away from light source
   - Expected: Sparse hatching near base (highlight), dense at tip (shadow)

2. **Closed Shape Test (Octagon)**
   - Place light at center
   - Expected: Inner edges sparse (facing light), outer edges dense (facing away)

3. **Curved Stroke Test**
   - Light to the left, curved path
   - Expected: Left side sparse, right side dense, gradient follows curve

4. **Orientation Flip Test**
   - Two parallel paths, opposite orientations
   - Expected: Gradients flip automatically based on which side faces light

5. **shadowBias Parameter Test**
   - shadowBias = 0: Uniform density (current behavior)
   - shadowBias = 0.5: Moderate bias
   - shadowBias = 1.0: Extreme bias (all lines on shadow edge)

### Debug Mode

Toggle `shadow-debug-mode` checkbox to visualize:
- Blue edges = highlight (facing light)
- Red edges = shadow (facing away)
- Verify correct edge classification for all orientations

---

## Key Benefits

1. ✅ **Automatic orientation handling**: Dot product naturally adapts to any stroke angle
2. ✅ **Works for closed shapes**: Inner/outer edges get correct light/shadow treatment
3. ✅ **Works for spikes**: Tips get denser hatching when facing away from light
4. ✅ **Composable**: Works with existing density profiles and organic mode
5. ✅ **Tunable**: `shadowBias` slider controls gradient strength
6. ✅ **Physically plausible**: Mimics how light would create shadows on a 3D ribbon

---

## Rollback Plan

If issues arise:
1. Set `shadowBias = 0` to disable feature (reverts to current behavior)
2. Comment out shadow offset calculation section
3. Revert to old weight calculation logic

---

## Future Enhancements

- [ ] Per-hatch line length modulation (fade on highlight side)
- [ ] Multiple light sources (blend multiple shadow factors)
- [ ] Ambient occlusion for closed shapes
- [ ] Interactive light position dragging in UI
- [ ] Gradient preview canvas showing shadow bias effect

---

## Files to Modify Summary

| File | Lines | Changes |
|------|-------|---------|
| `web/offset-utils.js` | ~1180-1202 | Add `shadowBias` parameter |
| `web/offset-utils.js` | ~1335-1380 | Replace weight with highlight/shadow calculation |
| `web/offset-utils.js` | ~1396-1403 | Add shadow bias offset |
| `web/index.html` | ~408 | Add UI controls |
| `web/sketch.js` | ~56 | Add state variables |
| `web/ui-controls.js` | ~476 | Wire UI controls |
| `web/sketch.js` | ~456-461 | Update preview call |
| `web/ui-controls.js` | ~1310-1315 | Update export call |
| `lib/path-utils.js` | Similar to web | Apply same changes for CLI |
| `process-svg.js` | Add flag | Add `--shadow-bias` CLI flag |

---

## Estimated Time

- Core implementation: 30-45 minutes
- UI integration: 15-20 minutes
- Testing: 20-30 minutes
- CLI version: 20-30 minutes
- **Total: ~90-120 minutes**

---

## Success Criteria

- [ ] Shadow bias slider controls hatch line placement
- [ ] Highlight edges have sparse hatching, shadow edges have dense hatching
- [ ] Gradient automatically flips based on stroke orientation
- [ ] Works correctly for spikes, curves, and closed shapes
- [ ] Debug mode visualizes shadow/highlight edges correctly
- [ ] Export produces same results as preview
- [ ] CLI version mirrors web functionality
- [ ] No performance regression

