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
- [ ] Restore calibration / diagnostic panels selectively.
- [ ] Add config import/export for presets.

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
