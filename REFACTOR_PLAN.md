# Refactor Roadmap

Guiding plan for rebuilding the Plotter Line Thickener with a cleaner UI and maintainable architecture. Check off items as they land; edit or reprioritize as the project evolves.

---

## 1. Goals & Guardrails
- [ ] Preserve ability to load SVG, preview offsets, and export processed SVGs at every major milestone.
- [ ] Keep one “known good” branch/tag to fall back on while experimenting.
- [ ] Share geometry / density logic between CLI and web builds to avoid future drift.
- [ ] Replace ad-hoc globals with explicit state management and typed configuration.
- [ ] Bias toward incremental migrations; delete legacy code only after ported features are validated.
- [ ] Keep v2 artifacts isolated (dedicated folder/workspace, prefixed config files) so legacy and new stacks can run side-by-side until parity is reached.

---

## 2. Architecture Principles
- **Module boundaries**: isolate parsing, state, rendering, and UI components.
- **Shared core**: move math/utilities into a `shared/` package consumed by CLI + web.
- **Event-driven UI**: UI dispatches actions; render layer subscribes to derived state.
- **Async heavy work**: long-running computations happen in workers or async tasks.
- **Config-first**: every feature derives from a schema so CLI and UI stay aligned.

---

## 2.5 North Star & Plotter Constraints
- **Purpose**: enhance existing SVG artwork for pen plotting by duplicating/offsetting paths (“echoes”) to simulate variable stroke weight with a single-width pen.
- **Medium constraints**:
  - Pen plotters only respect path geometry; stroke width, opacity, and fills rarely translate.
  - Overlapping passes are the primary lever for perceived darkness/thickness.
  - Output must remain pure `<path>` data with consistent viewBox and scale.
- **Success criteria**:
  - Artist can load an SVG, audition adjustments in a fast preview, then export plotter-ready paths.
  - UI and CLI expose the same mental model (offset distance, noise, pass counts, attractor influence).
  - Optional diagnostics never compromise the core plotting pipeline.

---

## 3. Feature Inventory & Priority

| Feature / Capability | Priority | Notes |
| --- | --- | --- |
| Core SVG loader & bounds fitting | 🟥 Critical | baseline for any preview |
| Preview canvas with pan/zoom | 🟥 Critical | minimal UI scaffolding |
| Offset fill rendering (length-based) | 🟥 Critical | foundation for CLI parity |
| Export processed SVG | 🟥 Critical | CLI + UI alignment |
| CLI parity for base offset/noise | 🟥 Critical | ensure shared engine |
| Attractor placement & weight preview | 🟧 High | essential interactive workflow |
| Live preview toggle | 🟧 High | keep but optimize for performance |
| Focus blur fill (point/directional) | 🟧 High | anchor advanced fill modes |
| Stripe / crosshatch / gradient fills | 🟨 Medium | port once core stable |
| Organic hatch controls | 🟨 Medium | depend on shared random/seed logic |
| Focus window tooling | 🟨 Medium | nice for large files; postpone if needed |
| Preview pattern generators (focus blur) | 🟨 Medium | reintroduce after base UI |
| Calibration sandbox (`calibration.html`) | 🟩 Optional | keep separate playground |
| Curvature diagnostics & debug overlays | 🟩 Optional | add once pipeline solid |
| Deprecated experiments / one-off scripts | ⬜ Deprioritize | archive or drop if unused |

Legend: 🟥 critical, 🟧 high, 🟨 medium, 🟩 optional, ⬜ evaluate/remove

---

## 4. Phase Breakdown

### Phase 0 – Baseline Snapshot
- [ ] Tag current repo (e.g., `pre-refactor`).
- [ ] Document “must work” workflows (CLI command combos, UI attractor flow).
- [ ] Capture sample input/output pairs for regression comparison.
- [ ] Maintain legacy directories (root scripts, web/) untouched until parity is confirmed

### Phase 1 – web-v2 Scaffold
- [ ] Create `web-v2/` workspace (own `package.json`, configs prefixed with `web-v2.*`) to avoid blending with legacy files.
- [ ] Set up bundler (Vite/Rollup) and optionally TypeScript inside that workspace.
- [ ] Implement minimal app shell: state store, React/Lit/vanilla modules.
- [ ] Load SVG → compute bounds → render static paths.
- [ ] Mirror CLI config schema in shared module.
- [ ] Establish UI layout skeleton: top-level tabs/panels (`File`, `Preview`, `Fills`, `Advanced`) and a dedicated “Sample Preview” region placeholder shared by upcoming controls.

### Phase 2 – Core Engine Extraction
- [ ] Move geometry + density code to `shared/engine`.
- [ ] Write unit tests for density field, noise, offset helpers.
- [ ] Wire CLI to shared engine; ensure existing commands pass.
- [ ] Expose same APIs to web-v2 renderer.

### Phase 3 – Interactive Essentials
- [x] Flesh out UI shell: wire tabs/panels from Phase 1 skeleton, ensure controls are grouped to avoid long scrolling.
- [x] Implement pan/zoom + lightweight client-side preview (favor responsiveness over perfect accuracy; offer small sample preview area and optional full-canvas render toggle).
- [x] Add attractor placement with cached sampling.
- [x] Integrate live/manual preview switch + throttled recompute.
- [x] Expose both:
  - [x] A "Copy CLI command" action that mirrors current settings.
  - [x] An "Export via CLI" action that invokes the shared engine/CLI backend directly from the UI.
- [x] Hook up export pipeline to shared engine.
- [x] Introduce reusable sample preview testbed (simple shapes/lines) that all fill/lighting parameters can target before running against the main SVG.
- [x] Set up persistent progress log (`docs/refactor-progress.md`) to capture completed steps, deviations, and open questions for easy handoff between sessions.

### Phase 4 – Advanced Fills & Tooling
- [x] Add text field that shows the CLI command, not just offer copy/paste on advanced tab
- [x] Add the fill envelopes from the original version for controls of things like sinTaper, EaseInOut, exponential, etc - currently missing in UI and CLI
- [x] Make sure UI tabs are arranged in a way that doesn't hide them - migrated to vertical accordion layout
- [x] Add length-to-weight curve controls (linear, easeIn, easeOut, easeInOut)
- [x] Show detected min/max length values after processing
- [x] Add output size controls (keep original, A3 landscape, A3 portrait)
- [x] Fix SVG export dimension bug (was outputting viewBox coords as mm)
- [x] Port focus blur controls + preview canvas (consider worker).
- [x] Reintroduce crosshatch/striped/gradient modes via shared modules.
- [x] Add Noise Gradient fill effect (per-path fuzzy→crisp or crisp→fuzzy transitions).
- [x] Add Shape Fill mode (filled/hollow circles arranged like "peas in pod").
- [x] Add Dynamic Barber Pole effect (envelope-responsive twist with occlusion).
- [ ] Add Custom Envelope Taper controls (beyond existing presets).
- [x] Restore calibration / diagnostic panels selectively.
- [x] Add config import/export for presets.

### Phase 5 – Polish & Cleanup
- [ ] Remove redundant legacy files once parity verified.
- [ ] Enable linting, formatting, and automated tests in CI (local script ok).
- [ ] Update documentation + screenshots for new UI.

---

## 5. Workstreams & Owners

| Workstream | Tasks | Status |
| --- | --- | --- |
| Shared Engine | Extract path utils, density, randomness | ☐ |
| UI Framework | Decide tech (vanilla modules vs. framework), set conventions | ☐ |
| State Management | Introduce store, action patterns, derived selectors | ☐ |
| Rendering | Canvas/SVG renderer with layering + performance tuning | ☐ |
| Testing | Snapshot diffs for SVG, unit tests for math, integration scripts | ☐ |
| Documentation | Update README, add architecture guide, maintain checklist | ☐ |

Feel free to annotate with owner initials or target dates.

---

## 6. Risk Log
- High risk of feature drift if CLI and web use different engines → mitigate by prioritizing shared modules early.
- Performance regressions when recomputing weights → plan worker-based sampling & caching.
- Scope creep from legacy experiments → enforce priority table, archive or delete low-value tools.

---

## 7. Parking Lot (Future Ideas)
- GPU-accelerated rendering for previews.
- Preset gallery with saved attractor layouts.
- Batch processing UI for multiple SVGs.
- Plugin hooks for custom noise fields.
- Batch "gallery" export mode: queue multiple fill configurations (optionally randomized) against a single SVG to explore unexpected outcomes.

Add or remove items as plans change.

---

## 8. Feature Specifications

### Noise Gradient Fill Effect

**Purpose**: Create per-path noise intensity gradients across fill width, transitioning from fuzzy to crisp (or vice versa) to add dimensional texture at small plotter scale (2-3mm fills with 0.38mm pen).

**Design Goals**:
- Avoid "shower door" global pattern effects - each path is independent
- Work naturally at small scale (5-8 pen strokes)
- Provide clear visual distinction from existing effects (focus-blur, light-based)
- User-controllable parameters matching existing UI patterns

#### Scope & Compatibility

**Works with**:
- Offset Fill mode
- Striped Fill mode

**Disabled for**:
- Crosshatch mode
- Hatch Gradient mode
- Spiral/Twisted mode

**Independent of**:
- Focus-Blur effect (no interaction)
- Light-Based effects (no override)

#### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `noiseGradientMode` | enum | `flat`, `fuzzy-crisp`, `crisp-fuzzy` | `flat` | Gradient direction across passes |
| `noiseMin` | float | 0-2mm | 0.05 | Noise at "crisp" end of gradient |
| `noiseMax` | float | 0-2mm | 0.4 | Noise at "fuzzy" end of gradient |
| `gradientCurve` | enum | `linear`, `exponential`, `inverse`, `smoothstep` | `linear` | Transition curve shape |

#### Modes

**Flat** (default):
- Current behavior: uniform noise across all passes
- Uses existing `noise` parameter
- Backward compatible with existing configs

**Fuzzy→Crisp**:
- Outermost passes: high noise (soft/fuzzy edges)
- Innermost passes: low noise (tight/crisp core)
- Visual effect: halo or glow around path
- Use case: soft atmospheric edges that fade into background

**Crisp→Fuzzy**:
- Outermost passes: low noise (defined boundary)
- Innermost passes: high noise (textured interior)
- Visual effect: contained energy within clean edges
- Use case: clear shapes with interior texture/detail

#### Gradient Curves

**Linear**: Steady proportional change across passes
```
t = passIndex / totalPasses
noise = lerp(noiseMin, noiseMax, t)
```

**Exponential**: Slow start, rapid finish (emphasizes one end)
```
t = pow(passIndex / totalPasses, 2)
noise = lerp(noiseMin, noiseMax, t)
```

**Inverse**: Rapid start, slow finish (reverse emphasis)
```
t = 1 - pow(1 - passIndex/totalPasses, 2)
noise = lerp(noiseMin, noiseMax, t)
```

**Smooth Step**: Sigmoidal ease-in-out (gentle transition)
```
t = smoothstep(passIndex / totalPasses)
noise = lerp(noiseMin, noiseMax, t)
```

#### Implementation Notes

**Pass Indexing**:
- Pass 0 = centerline (original path)
- Pass 1, 2, 3... = offsets outward from centerline
- Gradient applies to offset passes only (not centerline)

**Direction Mapping**:
- `fuzzy-crisp`: outer passes (high index) use `noiseMax`, inner (low index) use `noiseMin`
- `crisp-fuzzy`: reverse mapping (outer = min, inner = max)

**Backward Compatibility**:
- When `noiseGradientMode = flat`, ignore `noiseMin`/`noiseMax` and use existing `noise` parameter
- Existing CLI commands and saved configs continue to work unchanged
- Default mode is `flat` for zero breaking changes

**Integration Points**:
- Modify `generatePasses()` in `shared/geometry/path-utils.js`
- Add gradient calculation before noise application in offset generation
- Per-pass noise value calculated from gradient function
- No changes needed to envelope or taper logic

#### CLI Examples

```bash
# Fuzzy outer edges, crisp core (default linear gradient)
node process-svg.js input.svg output.svg \
  --fill-mode offset \
  --noise-gradient fuzzy-crisp \
  --noise-min 0.05 \
  --noise-max 0.4

# Crisp boundary, textured interior with exponential falloff
node process-svg.js input.svg output.svg \
  --fill-mode offset \
  --noise-gradient crisp-fuzzy \
  --noise-min 0.02 \
  --noise-max 0.6 \
  --gradient-curve exponential

# Dramatic halo effect with smooth transition
node process-svg.js input.svg output.svg \
  --fill-mode offset \
  --max-passes 8 \
  --noise-gradient fuzzy-crisp \
  --noise-min 0.0 \
  --noise-max 0.8 \
  --gradient-curve smoothstep

# Backward compatible - traditional uniform noise
node process-svg.js input.svg output.svg \
  --fill-mode offset \
  --noise 0.2
  # (noiseGradientMode defaults to 'flat')
```

#### Web UI Integration

**Location**: Fills tab, in Noise section (below base noise controls)

**UI Structure**:
```
Noise Controls
  Base Noise: [0.2mm] ─────────────── (shown when gradient mode = flat)

  [ ] Enable Noise Gradient

  (When enabled, show:)
    Mode: [Flat ▼]
          Options: Flat | Fuzzy→Crisp | Crisp→Fuzzy

    Noise Min:  [0.05mm] ────────────── 0-2mm
    Noise Max:  [0.4mm]  ────────────── 0-2mm

    Gradient Curve: [Linear ▼]
                    Options: Linear | Exponential | Inverse | Smooth Step
```

**Behavior**:
- Checkbox defaults to unchecked (mode = flat)
- When unchecked: uses simple "Base Noise" slider
- When checked: reveals gradient controls
- Mode selector shows directional arrows for clarity
- Min/max sliders validate (min < max)
- Live preview updates when enabled

#### Testing & Validation

**Unit Tests**:
- [ ] Gradient curve functions produce correct interpolation values
- [ ] Pass indexing correctly maps outer→inner or inner→outer
- [ ] Edge cases: 1 pass, 2 passes, 50 passes
- [ ] Backward compatibility: flat mode matches current behavior

**Visual Tests**:
- [ ] 2-3mm fills at plotter scale show clear gradient effect
- [ ] Fuzzy→Crisp creates visible halo without overlap chaos
- [ ] Crisp→Fuzzy maintains clean boundaries
- [ ] Exponential/inverse curves show distinct visual character vs linear
- [ ] Works correctly with striped fill (skipped passes still follow gradient)

**Regression Tests**:
- [ ] Existing CLI commands produce identical output
- [ ] Existing config files load and process correctly
- [ ] Default behavior unchanged when feature not explicitly enabled

#### Use Cases

- **Soft atmospheric edges**: Fuzzy→Crisp for paths fading into background
- **Defined shapes with texture**: Crisp→Fuzzy for clear boundaries with interior detail
- **Variable emphasis**: Combine with length-based or attractor weighting for mixed modes per path
- **Small-scale detail**: Creates perceptible dimensional texture at 2-3mm without overwhelming form
- **Stylistic control**: Offers new aesthetic vocabulary beyond density/spacing variation

---

### Shape Fill Mode - "Peas in Pod" Effect

**Purpose**: Fill paths with sequential filled or hollow circles arranged like beads on a string, creating organic textured fills with flowing, tapered rhythms. Alternative to stippling (point dots) or offset fills (parallel lines).

**Design Goals**:
- Auto-size circles to fit envelope width at each position
- Sequential placement along path centerline (beads on string)
- Proportional spacing that responds to envelope taper
- Support both hollow (outline) and filled (concentric passes) circles
- Work naturally at 2-3mm scale with 0.38mm pen

#### Scope & Compatibility

**Works with**:
- All envelope types (flat, sinTaper, sinTaperBoth, linearTaper, etc.)
- Length-based and attractor-based weighting
- Standard offset/noise parameters for filled circles

**Independent of**:
- Other fill modes (replaces offset/crosshatch/stipple when active)
- Focus-Blur and Light-Based effects (conceptually compatible but not initially integrated)

**Future expansion**:
- Additional shapes (triangles, squares, hexagons)
- Hexagonal packing option (beyond sequential)
- Shape rotation/orientation controls

#### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `fillMode` | enum | `shape-fill` | - | Enable shape fill mode |
| `shapeType` | enum | `circle` | `circle` | Shape to use (circle only initially) |
| `shapeFillMode` | enum | `hollow`, `filled` | `filled` | Outline only vs concentric fill passes |
| `shapeSpacing` | float | 0.0-2.0 | 1.0 | Spacing multiplier relative to local envelope width |

**Reuses existing parameters**:
- `baseOffset` - Spacing between concentric passes in filled circles (e.g., 0.25mm)
- `envelope` - All envelope presets work (determines circle size variation)
- `minPasses` / `maxPasses` - Could influence circle placement density (optional)

#### How It Works

**1. Circle Sizing** (Auto-fit to envelope):
- At each position along path, circle diameter = local envelope width
- With flat envelope (constant width): all circles same size
- With tapered envelope (sinTaperBoth, linearTaper): circles shrink/grow naturally
- Example: 1.5mm envelope width → 1.5mm diameter circle (0.75mm radius)

**2. Circle Placement** (Sequential "beads on string"):
- Start at path beginning, walk along centerline
- Place circle at current position
- Advance by: `current_diameter + (shapeSpacing × local_envelope_width)`
- Repeat until reaching path end
- Spacing is **proportional to local envelope width** (breathes with taper)

**Spacing Examples** (at position with 1.0mm envelope width):
- `shapeSpacing = 1.0`: gap = 1.0mm (circles touch, diameter-width spacing)
- `shapeSpacing = 0.5`: gap = 0.5mm (50% of local width)
- `shapeSpacing = 1.2`: gap = 1.2mm (slight overlap, 20% extra)
- `shapeSpacing = 0.0`: circles packed tight at same center (maximum overlap)

**3. Circle Fill Density** (when `shapeFillMode = filled`):
- Number of concentric passes = `circle_radius / baseOffset`
- Maintains consistent visual density regardless of circle size
- Examples with `baseOffset = 0.25mm`:
  - 1.5mm radius → 1.5 / 0.25 = 6 concentric passes
  - 0.75mm radius → 0.75 / 0.25 = 3 passes
  - 0.4mm radius → 0.4 / 0.25 ≈ 2 passes (rounded)

**4. Hollow Mode** (`shapeFillMode = hollow`):
- Only draw outer circumference (1 pass per circle)
- Creates outline/skeleton effect
- Lighter, faster, more delicate appearance

#### Visual Effect at 2-3mm Scale

**Example: 3mm path length, sinTaperBoth envelope (0.5mm → 1.5mm → 0.5mm width)**

With `shapeSpacing = 0.5`, `baseOffset = 0.25mm`, `shapeFillMode = filled`:

Position | Envelope Width | Circle Diameter | Fill Passes | Gap After
---------|----------------|-----------------|-------------|----------
Start    | 0.5mm         | 0.5mm          | 2 passes    | 0.25mm
Middle   | 1.5mm         | 1.5mm          | 6 passes    | 0.75mm
End      | 0.5mm         | 0.5mm          | 2 passes    | -

Result: 3-4 circles with flowing size variation and proportional rhythm

#### Implementation Notes

**Circle Generation**:
- Use existing circle path generation (likely from stippling code)
- For filled circles: generate N concentric circles at decreasing radii
- Each concentric circle offset by `baseOffset` from previous
- For hollow: single circle at full radius

**Path Walking**:
- Sample path at regular intervals to get centerline positions
- At each position, query envelope function for width
- Calculate circle placement based on accumulated distance traveled
- Stop when remaining path length < next circle diameter

**Envelope Integration**:
- Reuse existing envelope functions (flat, sinTaper, easeInOut, etc.)
- Query envelope at normalized position `t` (0.0 to 1.0 along path)
- Circle radius = `envelope(t) × maxWidth / 2`
- Spacing = `shapeSpacing × envelope(t) × maxWidth`

**Edge Cases**:
- Path too short for even one circle: skip or draw single centered circle?
- Tapered ends too narrow (< 2 × baseOffset): skip tiny circles or allow minimum size?
- Suggest: minimum circle radius = 2 × baseOffset (needs at least 2 passes to read as filled)

#### CLI Examples

```bash
# Basic filled circles with touching spacing
node process-svg.js input.svg output.svg \
  --fill-mode shape-fill \
  --shape-type circle \
  --shape-fill-mode filled \
  --shape-spacing 1.0 \
  --offset 0.25

# Hollow circles with 50% gaps (outline beads effect)
node process-svg.js input.svg output.svg \
  --fill-mode shape-fill \
  --shape-type circle \
  --shape-fill-mode hollow \
  --shape-spacing 0.5

# Tapered peas-in-pod with tight packing
node process-svg.js input.svg output.svg \
  --fill-mode shape-fill \
  --envelope sinTaperBoth \
  --shape-spacing 0.8 \
  --offset 0.2

# Dense filled beads (overlapping slightly)
node process-svg.js input.svg output.svg \
  --fill-mode shape-fill \
  --shape-fill-mode filled \
  --shape-spacing 0.9 \
  --offset 0.15
```

#### Web UI Integration

**Location**: Fills tab, new section when Shape Fill mode selected

**UI Structure**:
```
Fill Mode: [Shape Fill ▼]

Shape Fill Controls
  Shape Type:     [Circle ▼]
                  Options: Circle (more shapes later)

  Fill Mode:      [Filled ▼]
                  Options: Filled | Hollow

  Shape Spacing:  [1.0] ────────────── 0.0-2.0
                  (Gap relative to envelope width)

  Fill Density:   [0.25mm] ──────────── 0.1-0.5mm
                  (Spacing between concentric passes)
                  (Only shown when Fill Mode = Filled)

Envelope:         [sinTaperBoth ▼]
                  (All existing envelope presets)
```

**Behavior**:
- Fill Mode dropdown includes "Shape Fill" alongside Offset, Crosshatch, etc.
- When selected, shows shape-specific controls
- Shape Spacing slider with visual tooltip showing gap behavior
- Fill Density reuses existing offset control
- Preview updates in real-time with live preview enabled

#### Testing & Validation

**Unit Tests**:
- [ ] Circle placement algorithm produces correct positions along path
- [ ] Spacing calculation responds correctly to envelope taper
- [ ] Fill density (concentric passes) calculates correctly for various radii
- [ ] Edge cases: very short paths, very narrow tapers, spacing = 0

**Visual Tests**:
- [ ] Filled circles appear solid at 2-3mm scale (sufficient concentric passes)
- [ ] Hollow circles create clean outline beads
- [ ] Spacing flows naturally with tapered envelopes (no sudden jumps)
- [ ] Circle sizes transition smoothly in tapered sections
- [ ] Works with all envelope presets (flat, sinTaper, easeInOut, etc.)

**Regression Tests**:
- [ ] Other fill modes (offset, crosshatch) unaffected
- [ ] Existing stippling mode still works
- [ ] CLI backward compatibility maintained

**Performance Tests**:
- [ ] Large files with many paths process efficiently
- [ ] Preview renders smoothly (consider simplification for preview)

#### Use Cases

- **Organic texture**: Peas-in-pod feel creates natural, flowing patterns
- **Dimensional flow**: Tapering creates sense of volume and movement
- **Efficient fills**: Fewer total passes than full offset fills (faster plotting)
- **Decorative elements**: Beaded, pearl-like, or cellular path treatments
- **Scale variation**: Effective from 2mm to much larger paths
- **Lighter alternative**: Hollow mode offers delicate outline effect vs heavy fills
- **Rhythmic patterns**: Proportional spacing creates musical, breathing quality

#### Future Enhancements

**Additional shapes** (Phase 5+):
- Triangles (orientation options)
- Squares/diamonds
- Hexagons
- Organic blobs (varied, seed-based randomness)

**Advanced packing**:
- Hexagonal packing (offset rows for denser coverage)
- Random jittered positions (organic variation)
- Dual-size mixing (alternating large/small)

**Integration**:
- Combine with attractor weighting (filled vs hollow based on influence)
- Vary shape type along path (circles → triangles transition)
- Rotation/orientation controls (align with path or independent angle)

---

### Dynamic Barber Pole Effect

**Purpose**: Create candy cane/barber pole spiral stripes that respond organically to path envelope, with stripe width and twist rate varying dynamically. Includes occlusion effect (stripes shorten/disappear when "wrapping to back") to create convincing 3D helical appearance in 2D.

**Design Goals**:
- Stripe width scales with envelope width (wide stripes in wide sections, thin in narrow)
- Twist rate inversely proportional to envelope width (tight spiral when narrow, relaxed when wide)
- Stripe occlusion creates illusion of wrapping around cylindrical form
- Natural flowing motion quality - not stiff/geometric
- Works at 2-3mm scale with readable stripe definition

#### Scope & Compatibility

**Works with**:
- All envelope types (flat, sinTaper, sinTaperBoth, etc.)
- Length-based and attractor-based weighting
- Existing offset/noise parameters

**Replaces**:
- Current spiral/twisted fill mode (which lacks proper occlusion)

**Independent of**:
- Other fill modes (offset, crosshatch, stipple, shape-fill)
- Focus-Blur and Light-Based effects

**Future expansion**:
- Variable twist rate modes (constant, inverse, custom curve)
- Irregular stripe spacing (breaks perfect geometric division)
- Organic stripe edge variation (wiggle, undulate)
- Multiple twist directions (clockwise/counterclockwise mixing)

#### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `fillMode` | enum | `barber-pole` | - | Enable barber pole spiral mode |
| `twistFrequency` | float | 0.05-1.0 | 0.2 | Base rotations per mm (0.2 = 1 rotation per 5mm) |
| `twistRateMode` | enum | `constant`, `inverse`, `proportional` | `inverse` | How twist rate responds to envelope width |
| `stripeCount` | int | 2-8 | 3 | Number of parallel spiral stripe lanes |
| `occlusionMode` | enum | `none`, `smooth`, `hard` | `smooth` | How aggressively stripes shorten at back |
| `minOcclusion` | float | 0.0-0.5 | 0.0 | Minimum stripe extension at "back" (0 = disappear, 0.5 = centerline only) |

**Reuses existing parameters**:
- `baseOffset` - Spacing between stripe fill lines (within each stripe)
- `envelope` - All envelope presets determine width variation
- `noise` - Optional organic variation in stripe edges

#### Twist Rate Modes

**Constant** (`twistRateMode = constant`):
- Twist rate stays constant regardless of envelope width
- Consistent spiral angle everywhere
- Less dynamic but predictable

**Inverse** (`twistRateMode = inverse`) - **Recommended default**:
- Twist rate inversely proportional to envelope width
- Wide sections: slow, relaxed spiral
- Narrow sections: fast, tight spiral
- Creates natural breathing motion

**Proportional** (`twistRateMode = proportional`):
- Twist rate proportional to envelope width
- Wide sections: fast spiral
- Narrow sections: slow spiral
- Opposite feel from inverse

#### How It Works

**1. Stripe Lane Definition**:
- Divide ribbon width into N equal lanes (N = `stripeCount`)
- Each lane gets a phase offset: `lane_offset = lane_index / stripeCount`
- Example with 3 stripes: offsets = 0.0, 0.33, 0.67

**2. Twist Rate Calculation** (at position `t` along path):
- Get local envelope width: `w = envelope(t) × maxWidth`
- Calculate local twist rate:
  - `constant`: `rate = twistFrequency`
  - `inverse`: `rate = twistFrequency × (maxWidth / w)` (faster when narrow)
  - `proportional`: `rate = twistFrequency × (w / maxWidth)` (faster when wide)

**3. Phase Accumulation** (walking along path):
- Integrate twist rate to get accumulated rotation angle
- At each sample point:
  ```
  accumulatedTwist += localTwistRate × stepDistance
  phase[lane] = (accumulatedTwist + laneOffset) % 1.0
  ```
- Phase 0.0 = front-facing, 0.5 = back-facing, 1.0 = wraps to front again

**4. Stripe Width**:
- `stripeWidth = envelopeWidth / stripeCount`
- Example: 1.5mm envelope, 3 stripes → 0.5mm per stripe
- Example: 0.5mm envelope, 3 stripes → 0.17mm per stripe
- Proportions stay consistent as envelope varies

**5. Occlusion/Shortening** (for each stripe at each position):
- Based on phase (0.0-1.0):
  ```
  if occlusionMode == 'none':
    extension = 1.0  // always full width

  else if occlusionMode == 'smooth':
    if phase < 0.5:  // front half
      extension = lerp(1.0, minOcclusion, phase * 2)
    else:  // back half
      extension = lerp(minOcclusion, 1.0, (phase - 0.5) * 2)

  else if occlusionMode == 'hard':
    extension = (phase < 0.25 || phase > 0.75) ? 1.0 : minOcclusion
  ```
- Stripe extends from centerline by: `extension × (envelopeWidth / 2)`
- At extension = 0.0: stripe disappears (at back)
- At extension = 0.5: stripe reaches centerline only
- At extension = 1.0: stripe reaches full width (at front)

**6. Stripe Fill Generation**:
- For each stripe lane, at each position:
  - Calculate stripe boundaries based on extension
  - Fill stripe region with parallel lines at `baseOffset` spacing
  - Lines run perpendicular to path direction (not spiraling)
  - Only the stripe boundaries spiral, fills are straight across

#### Visual Effect at 3mm sinTaperBoth Path

**Configuration**: `twistFrequency = 0.3`, `stripeCount = 3`, `twistRateMode = inverse`, `occlusionMode = smooth`

Position | Envelope | Stripe | Twist | Stripe A | Stripe B | Stripe C
---------|----------|--------|-------|----------|----------|----------
Start (narrow) | 0.5mm | 0.17mm | Fast (3x) | `\|---●---\|` full front | ` ● ` back (hidden) | `\|--●--\|` quarter
Middle (wide) | 1.5mm | 0.5mm | Slow (1x) | `\|-------●-------\|` full | `\|----●----\|` 3/4 | ` ● ` back
End (narrow) | 0.5mm | 0.17mm | Fast (3x) | ` ● ` back | `\|---●---\|` full front | `\|--●--\|` quarter

**Result**: Stripes appear to spiral around the ribbon, widening and slowing in the middle, tightening and accelerating at the ends. Creates flowing, breathing barber pole with sense of 3D form.

#### Implementation Notes

**Path Sampling**:
- Sample path at regular intervals (based on `baseOffset` or fixed 0.5mm)
- At each sample: calculate position, tangent, normal, envelope width
- Track accumulated twist angle as you walk

**Twist Integration**:
- Need to integrate twist rate along path (not just multiply by distance)
- For tapered paths, twist rate changes at each step
- Accumulate: `totalTwist += twistRate(t) × dt`

**Stripe Boundary Calculation**:
- For each lane at each sample point:
  - Calculate phase from accumulated twist + lane offset
  - Calculate extension from occlusion curve
  - Calculate perpendicular offset from centerline
  - Generate stripe boundaries as offset curves

**Fill Strategy**:
- Option A: Fill entire ribbon with offset passes, assign stripe identity per pass
- Option B: Generate separate stripe geometries, fill each independently
- Option B likely cleaner (separate path groups per stripe color in output)

**Edge Cases**:
- Very narrow sections (< stripeCount × baseOffset): stripes may overlap
- Very fast twist (tight spiral): may need minimum sample density
- Path shorter than one twist period: partial spiral only

**Performance**:
- More expensive than simple offset fills (phase calculation per sample)
- Consider caching envelope evaluations
- Preview mode could use coarser sampling

#### CLI Examples

```bash
# Classic 3-stripe barber pole with inverse twist
node process-svg.js input.svg output.svg \
  --fill-mode barber-pole \
  --stripe-count 3 \
  --twist-frequency 0.2 \
  --twist-rate-mode inverse \
  --occlusion-mode smooth

# Tight candy cane spiral (5 stripes, fast twist)
node process-svg.js input.svg output.svg \
  --fill-mode barber-pole \
  --stripe-count 5 \
  --twist-frequency 0.4 \
  --offset 0.15

# Gentle flowing spiral with tapered envelope
node process-svg.js input.svg output.svg \
  --fill-mode barber-pole \
  --envelope sinTaperBoth \
  --stripe-count 3 \
  --twist-frequency 0.15 \
  --twist-rate-mode inverse

# Hard occlusion (stripes pop in/out sharply)
node process-svg.js input.svg output.svg \
  --fill-mode barber-pole \
  --stripe-count 4 \
  --occlusion-mode hard \
  --min-occlusion 0.2

# No occlusion (flat 2D spiral, no hiding)
node process-svg.js input.svg output.svg \
  --fill-mode barber-pole \
  --stripe-count 3 \
  --occlusion-mode none
```

#### Web UI Integration

**Location**: Fills tab, new section when Barber Pole mode selected

**UI Structure**:
```
Fill Mode: [Barber Pole ▼]

Barber Pole Controls
  Stripe Count:    [3] ────────────── 2-8
                   (Number of spiral lanes)

  Twist Frequency: [0.2] ──────────── 0.05-1.0
                   (Rotations per mm)

  Twist Rate Mode: [Inverse ▼]
                   Options: Constant | Inverse | Proportional
                   (How twist responds to taper)

  Occlusion:       [Smooth ▼]
                   Options: None | Smooth | Hard
                   (Stripe hiding at back)

  Min Extension:   [0.0] ──────────── 0.0-0.5
                   (Minimum stripe length at back)
                   (Only shown when Occlusion ≠ None)

  Fill Density:    [0.25mm] ─────────── 0.1-0.5mm
                   (Spacing within stripes)

Envelope:          [sinTaperBoth ▼]
                   (All existing envelope presets)
```

**Visual Aids**:
- Mini preview showing stripe spiral pattern
- Twist rate diagram (how fast/slow spiral changes with taper)
- Occlusion curve visualization

#### Testing & Validation

**Unit Tests**:
- [ ] Twist accumulation integrates correctly along path
- [ ] Phase calculation produces correct 0.0-1.0 cycle
- [ ] Inverse twist rate correctly speeds up when narrow
- [ ] Occlusion curves produce expected extension values
- [ ] Stripe width scales proportionally with envelope

**Visual Tests**:
- [ ] Stripes appear to spiral around ribbon convincingly
- [ ] Occlusion creates 3D cylindrical illusion at 2-3mm scale
- [ ] Inverse twist mode creates breathing/flowing motion
- [ ] Stripe widths stay proportional to envelope width
- [ ] Works with all envelope presets (flat, sinTaper, easeInOut, etc.)
- [ ] Hard occlusion vs smooth shows distinct visual character

**Regression Tests**:
- [ ] Other fill modes unaffected
- [ ] Existing spiral/twisted mode can be deprecated after validation
- [ ] CLI backward compatibility maintained

**Performance Tests**:
- [ ] Large files with many paths process efficiently
- [ ] Twist integration doesn't bottleneck on long paths
- [ ] Preview renders smoothly (consider coarser sampling)

#### Use Cases

- **Dynamic motion**: Breathing, flowing spiral creates sense of energy
- **3D illusion**: Occlusion effect suggests cylindrical form
- **Decorative patterns**: Candy cane, barber pole, twisted rope aesthetics
- **Organic variation**: Envelope-responsive behavior avoids mechanical stiffness
- **Scale adaptation**: Tight spirals on thin paths, relaxed on thick paths
- **Visual rhythm**: Twist rate variation creates musical, pulsing quality

#### Comparison to Existing Spiral Mode

**Current spiral/twisted mode** (broken):
- Stripes don't hide/shorten when wrapping
- Looks flat, lacks 3D illusion
- No envelope responsiveness
- Geometric, stiff appearance

**New dynamic barber pole**:
- Occlusion creates convincing wrap effect
- Twist rate and stripe width respond to taper
- Natural flowing motion quality
- Works correctly at small plotter scale

**Migration**: Mark old spiral mode as deprecated, suggest barber-pole with `occlusionMode = none` for similar flat effect.

#### Future Enhancements

**Variable stripe spacing** (Phase 5+):
- Irregular lane widths (e.g., thin-thick-thin pattern)
- Random jitter in stripe positions
- Breaks perfect geometric division

**Organic stripe edges**:
- Wiggle/undulate stripe boundaries
- Noise modulation along stripe edges
- Hand-drawn, painterly quality

**Multi-directional twists**:
- Some stripes spiral clockwise, others counterclockwise
- Creates chevron or herringbone patterns
- Mix of twist frequencies per stripe

**Attractor integration**:
- Twist frequency influenced by attractors
- Stripe visibility (filled vs outline) based on influence
- Local twist direction changes

**Custom twist curves**:
- User-defined twist rate function (not just constant/inverse/proportional)
- Bezier curve editor for twist acceleration
- Step functions for abrupt twist changes
