# Barber Pole Fill Mode - Design Document

**Date:** 2025-01-08
**Status:** Approved for Implementation

## Overview

Implement a dynamic barber pole spiral fill mode that creates candy cane/barber pole stripe patterns with envelope-responsive twist rate and occlusion effects for 3D cylindrical illusion.

## Design Goals

- Stripe width scales with envelope width
- Twist rate inversely proportional to envelope width (tight spiral when narrow, relaxed when wide)
- Stripe occlusion creates illusion of wrapping around cylindrical form
- Natural flowing motion quality - not stiff/geometric
- Works at 2-3mm scale with readable stripe definition

## Architecture

### Core Algorithm Structure

```
generateBarberPoleFill(pathData, options)
  ↓
1. samplePathWithTwist() → centerlineWithPhase[]
  ↓
2. generateStripeBoundaries() → stripeBoundaries[]
  ↓
3. fillStripeBoundaries() → paths[]
```

### Key Components

#### 1. Phase Accumulation

Walk the path and integrate twist rate to track accumulated rotation angle:

```javascript
let accumulatedTwist = 0;
for each sample point:
  - Calculate local envelope width
  - Calculate local twist rate (constant/inverse/proportional)
  - Integrate: accumulatedTwist += localTwistRate × stepDistance
  - Store: {position, normal, localWidth, accumulatedTwist, t}
```

**Twist Rate Modes:**
- `constant`: rate = twistFrequency
- `inverse`: rate = twistFrequency × (maxWidth / localWidth) - **default**
- `proportional`: rate = twistFrequency × (localWidth / maxWidth)

#### 2. Occlusion Calculation

For each stripe at each position, calculate extension factor (0.0-1.0):

```javascript
phase = accumulatedTwist + laneOffset
extension = calculateExtension(phase, occlusionMode, minOcclusion)

Occlusion Modes:
- 'none': extension = 1.0 (always full width)
- 'smooth': linear lerp based on phase (0=front, 0.5=back)
- 'hard': sharp cutoff at quarter points
```

#### 3. Stripe Boundary Generation

For each of N stripes:
- Lane offset = lane / stripeCount
- Walk centerline, calculate phase at each point
- Generate left/right edge points based on extension
- Create closed region polygon

#### 4. Stripe Filling

For each stripe region:
- Create closed path from boundary points
- Fill with parallel lines at baseOffset spacing
- Use scanline or existing offset fill logic
- Apply noise if specified

## Implementation Strategy

**Option B (Selected):** Generate separate stripe geometries, fill each independently

Advantages:
- Cleaner separation of concerns
- Easier debugging and visualization
- Matches existing `generateShapeFill` pattern
- Supports future per-stripe effects

## Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `fillMode` | enum | `barber-pole` | - | Enable mode |
| `stripeCount` | int | 2-8 | 3 | Number of spiral lanes |
| `twistFrequency` | float | 0.05-1.0 | 0.2 | Rotations per mm |
| `twistRateMode` | enum | constant/inverse/proportional | inverse | Twist response |
| `occlusionMode` | enum | none/smooth/hard | smooth | Stripe hiding |
| `minOcclusion` | float | 0.0-0.5 | 0.0 | Min extension at back |
| `baseOffset` | float | 0.1-0.5mm | 0.25mm | Fill line spacing |
| `envelope` | enum | flat/sinTaper/etc | flat | Width variation |

## Integration Points

### Core Implementation
- Add `generateBarberPoleFill()` to `shared/geometry/path-utils.js`
- Export function alongside other fill modes

### CLI Integration
- Add parameters to `process-svg.js`:
  - `--fill-mode barber-pole`
  - `--stripe-count <n>`
  - `--twist-frequency <f>`
  - `--twist-rate-mode <mode>`
  - `--occlusion-mode <mode>`
  - `--min-occlusion <f>`

### Web UI Integration
- Add "Barber Pole" option to Fill Mode dropdown
- Show barber pole controls when selected:
  - Stripe Count slider (2-8)
  - Twist Frequency slider (0.05-1.0)
  - Twist Rate Mode dropdown
  - Occlusion Mode dropdown
  - Min Extension slider (conditional)

### Processor Integration
- Update `shared/geometry/path-utils.js` `generatePasses()` or routing logic
- Update `web-v2/src/utils/processor.js` to handle barber-pole mode
- Update `web-v2/src/state/store.js` config defaults

## Edge Cases

- Very narrow sections (< stripeCount × baseOffset): stripes may overlap - acceptable
- Very fast twist: may need minimum sample density - use sampleRate=0.5mm
- Path shorter than one twist period: partial spiral only - acceptable
- minOcclusion validation: clamp to 0.0-0.5 range

## Testing Strategy

**Visual validation:**
1. Test with flat envelope - should show consistent stripe width
2. Test with sinTaperBoth - stripes should widen/narrow smoothly
3. Test inverse twist mode - spiral should tighten when narrow
4. Test occlusion modes - smooth vs hard vs none should be distinct
5. Test at 2-3mm scale - stripes should be readable

**Integration testing:**
- Works with all envelope presets
- Works with noise parameter
- Works with different stripe counts
- CLI and UI produce identical output

## Future Enhancements

- Variable stripe spacing (irregular widths)
- Organic stripe edges (wiggle/undulate)
- Multi-directional twists (clockwise/counterclockwise)
- Attractor integration (local twist modulation)
- Custom twist curves (Bezier editor)

## Braid Occlusion Next Steps

- **Finalize playground tuning.** Keep iterating in `utils/three-strand-braid-playground.html` with the new per-strand phase offsets, occluded-zone width controls, and copy-to-clipboard debug output so we can lock down the numeric deltas that make the chevron weave read correctly.
- **Promote discrete strand states.** Port the playground logic into `generateBarberPoleSmooth`: derive a single lead/middle/occluded state from the accumulated twist, gate rendering with `null` breaks instead of continuous weights, and keep the existing profile geometry untouched.
- **Per-profile phase trims.** Introduce optional phase bias multipliers for each profile (`sigmoid`, `flat-candy`, `cylindrical`) so we can compensate for their different diagonal offsets without forking the occlusion math.
- **Developer instrumentation.** Mirror the playground’s debug overlay (state-color preview, suppression diagnostics) inside the barber-pole tuner so we can visually confirm state transitions on real paths before exposing the controls in the main UI/CLI.
- **Expose tuning parameters.** Surface the useful knobs (suppression thresholds, occluded-zone width, per-family phase trim) through CLI flags and the tuner UI once the defaults feel solid so the braid variant can be dialed in for different plotter scales.

## Success Criteria

- [ ] Stripes spiral convincingly around ribbon
- [ ] Occlusion creates 3D cylindrical illusion
- [ ] Inverse twist mode creates breathing/flowing motion
- [ ] Works at 2-3mm plotter scale
- [ ] CLI and web UI parity
- [ ] No performance degradation on typical files
