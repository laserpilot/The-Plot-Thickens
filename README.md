# The Plot Thickens

SVG line weight utility with attractor-based thickness control for pen plotters.

## Overview

This tool manipulates SVG line weights by duplicating and offsetting paths with noise, creating the illusion of variable thickness when plotted with a single-width pen.

## Project Status

- ✅ **Phase 1**: Test Pattern Generator (complete)
- ✅ **Phase 2**: Path Length-Based Weight (complete)
- ✅ **Phase 3**: Attractor-Based Weight System (complete)
- ✅ **Phase 4**: Normal-Based Offsets with Taper (complete)
- ✅ **Fill Modes**: Multiple fill strategies (complete)
  - **Offset Fill**: Traditional parallel offset passes
  - **Striped Fill**: Alternating filled/empty pattern
  - **Crosshatch Fill**: Angled hatch fills with envelope support
  - **Hatch Gradient Fill**: Light-responsive directional shading
- ✅ **Hatch Gradient Features**: (complete)
  - Point & Directional lighting modes
  - Global field shading for spatial coherence
  - Per-surface shading for individual control
- ✅ **Organic Crosshatch**: Hand-drawn pen-and-ink style effects (complete)
- ✅ **Performance**: Optimized for large SVG files (200+ paths)
- ⏳ **Phase 5**: Combined System (pending)

---

## Phase 1: Test Pattern Generator

Creates a grid of shapes with varying pass counts and noise amounts to understand how line weight techniques work with pen plotters.

### Usage

```bash
npm run generate-test
# Outputs to: output/test-pattern.svg
```

### Test Pattern Structure

- **X-axis**: Number of passes (1, 2, 3, 5, 10, 20)
- **Y-axis**: Noise offset (0mm, 0.05mm, 0.1mm, 0.2mm, 0.5mm)
- **Each cell**: Contains a circle and square

This pattern helps you understand how different parameters affect perceived line weight on your plotter.

---

## Phase 2: Path Length-Based Weight Processor

CLI tool that processes existing SVG files, making longer paths thicker by duplicating them with offset variations.

### Quick Start

```bash
# Step 1: Flatten SVG (converts all shapes to paths - recommended for complex files)
node flatten-svg.js input.svg
# Output: input-flattened.svg

# Step 2: Process the flattened SVG
node process-svg.js input-flattened.svg

# Or process directly (only works if SVG has only <path> elements)
node process-svg.js input.svg output.svg
```

### When to Flatten First

**Use `flatten-svg.js` if your SVG contains:**
- `<polygon>`, `<polyline>`, `<line>`, `<rect>`, `<circle>`, or `<ellipse>` elements
- Nested groups or layers with transforms
- Files exported from Inkscape or Illustrator with multiple element types

The flattening tool will:
- Convert ALL shapes to `<path>` elements
- Apply group/layer transforms to nested paths
- Ensure consistent path counting (no surprises!)
- Output: `[filename]-flattened.svg`

**Skip flattening if:**
- Your SVG only contains `<path>` elements already
- File was exported specifically for plotters (e.g., from vpype)

### Configuration

#### Generate default config file

```bash
npm run init-config
# Creates: config.json
```

#### Use config file

```bash
node process-svg.js input.svg -c config.json
```

#### Command-line options

```bash
node process-svg.js input.svg output.svg \
  --offset 0.1 \           # Base offset distance (mm)
  --noise 0.05 \           # Noise amount (mm)
  --min-passes 1 \         # Minimum passes
  --max-passes 10 \        # Maximum passes
  --curve exponential \    # Curve type: linear, exponential, logarithmic
  --exponent 2 \           # Exponent for exponential curve
  --bins 4                 # Group output into N length quantile bins (optional)
  --min-length 10 \        # Min path length (auto-detect if omitted)
  --max-length 100 \       # Max path length (auto-detect if omitted)
  --offset-mode normal \   # Offset mode: legacy or normal
  --envelope sinTaper      # Envelope preset (normal mode only)
```

### Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `baseOffset` | 0.25 | Base offset distance per pass (mm) |
| `noise` | 0.05 | Random variation in offset (mm) |
| `noiseFrequency` | 50 | Noise wavelength (mm) - lower = smoother |
| `minPasses` | 1 | Minimum number of path duplicates |
| `maxPasses` | 20 | Maximum number of path duplicates |
| `curve` | linear | Length-to-weight mapping curve |
| `exponent` | 2 | Exponent for exponential curve |
| `minLength` | auto | Minimum path length (auto-detected) |
| `maxLength` | auto | Maximum path length (auto-detected) |
| `offsetMode` | legacy | Offset algorithm: `legacy` or `normal` |
| `envelope` | flat | Taper envelope (normal mode only) |
| `bins` | null | Group output by length quantiles (e.g., 4 for quartiles) |
| `sampleRate` | 2 | Sample interval in mm (lower = smoother, slower) |

### Curve Types

- **`linear`**: Proportional mapping (default)
- **`exponential`**: Emphasizes longer paths more aggressively
- **`logarithmic`**: Emphasizes shorter paths, gradual increase for long paths

### Example

```bash
# Test with sample file
node process-svg.js test-input.svg output/test-output.svg

# Custom settings
node process-svg.js artwork.svg output/artwork-thick.svg \
  --curve exponential \
  --exponent 2.5 \
  --max-passes 30 \
  --noise 0.1
```

### How It Works

1. **Parse SVG**: Extracts all `<path>` elements
2. **Measure lengths**: Calculates total length of each path
3. **Map to weight**: Determines number of passes based on length
4. **Generate duplicates**: Creates offset copies with noise
5. **Export SVG**: Flat structure, plotter-ready

### Length-Based Binning

For large or complex SVGs, you can organize output paths into groups by length:

```bash
# Group paths into 4 quartile bands (0-25%, 25-50%, 50-75%, 75-100%)
node process-svg.js input.svg output.svg --bins 4

# Or use 8 bins for finer control
node process-svg.js input.svg output.svg --bins 8
```

**Benefits:**
- Makes large files manageable in Inkscape or other SVG editors
- Each band wrapped in `<g>` with descriptive IDs (e.g., `length-band-0-25pct`)
- Includes `data-length-range` attributes for easy identification
- Toggle visibility or apply edits band-by-band in your editor

**Output structure:**
```xml
<g id="length-band-0-25pct" data-length-range="10.5-25.3">
  <!-- Shortest paths (0-25 percentile) -->
</g>
<g id="length-band-25-50pct" data-length-range="25.3-42.1">
  <!-- Medium-short paths (25-50 percentile) -->
</g>
<!-- etc... -->
```

### Performance Optimization

For large or complex SVG files, you can significantly improve processing speed by adjusting the sample rate:

```bash
# Faster processing with 3mm sampling (default is 2mm)
node process-svg.js large-file.svg output.svg --sample-rate 3

# Balance between quality and speed
node process-svg.js large-file.svg output.svg --sample-rate 2.5 --max-passes 15

# High quality but slower (1mm sampling)
node process-svg.js large-file.svg output.svg --sample-rate 1 --max-passes 30
```

**Sample Rate Guide:**
- **0.5-1mm**: Highest quality, smoothest curves, ~4x slower
- **2mm** (default): Good balance of quality and speed
- **3-5mm**: Faster processing, slightly more angular curves, ~2-3x faster

**Tips for large files:**
1. Use `--sample-rate 3` for initial tests
2. Reduce `--max-passes` to speed up processing
3. Use `--bins 4` to organize output for easier editing
4. Process on subset of paths first to test settings

---

## Phase 4: Normal-Based Offsets with Taper

The tool now supports two offset algorithms:

### Legacy Mode (Default)

The original point-based offset algorithm that samples paths and calculates normals from neighboring points. Fast and reliable for most use cases.

### Normal Mode (New)

An improved arc-length based offset algorithm with support for taper envelopes and smooth noise:

**Benefits:**
- More accurate offsets using `svg-path-commander` for precise arc-length sampling
- Uniform point distribution along curved paths
- Support for taper envelopes to create variable-width effects
- **Smooth noise control** via `noiseFrequency` parameter for organic variation without jagged edges

**Envelope Presets:**
- `flat` - No taper (default, same as legacy)
- `linearTaper` - Linear taper from start to end
- `linearTaperBoth` - Tapers at both ends, full in middle
- `sinTaper` - Smooth sinusoidal taper
- `sinTaperBoth` - Smooth bulge in middle
- `exponentialTaper` - Slow start, fast end
- `easeInOut` - Smooth parabolic taper at both ends

### Noise Frequency Control

The `noiseFrequency` parameter controls the smoothness of random variation:
- **Low (50-100mm)**: Smooth, calligraphic organic curves
- **Medium (20-40mm)**: Gentle texture
- **High (5-10mm)**: Detailed texture, more jagged

### CLI Examples

```bash
# Legacy mode (backward compatible)
node process-svg.js input.svg output.svg

# Normal mode with flat envelope (no taper)
node process-svg.js input.svg output.svg --offset-mode normal --envelope flat

# Normal mode with sin taper (smooth taper from start to end)
node process-svg.js input.svg output.svg --offset-mode normal --envelope sinTaper

# Normal mode with both-ends taper (creates pointed ends)
node process-svg.js input.svg output.svg --offset-mode normal --envelope linearTaperBoth

# Smooth organic variation with low-frequency noise
node process-svg.js input.svg output.svg \
  --offset-mode normal \
  --noise 0.2 \
  --noise-frequency 80

# Textured effect with high-frequency noise
node process-svg.js input.svg output.svg \
  --offset-mode normal \
  --noise 0.15 \
  --noise-frequency 10
```

### Web Interface

The web interface includes a new **Offset Mode** control panel:
1. Toggle between **Legacy** and **Normal** modes
2. Select envelope preset when in Normal mode
3. **Noise Frequency** slider (5-200mm) - controls smoothness
4. Preview shows the effect in real-time
5. Export includes the selected mode in the SVG comment

---

## Phase 3: Attractor-Based Weight System

Web-based interactive tool for controlling line weight using attractor points. Click on the canvas to place attractors that modulate path thickness based on distance.

### Quick Start

```bash
# Open in browser
open web/index.html
# or serve locally:
python3 -m http.server 8000
# Then visit: http://localhost:8000/web/
```

### Features

**Interactive Canvas**
- Upload SVG files via drag-and-drop or file picker
- Click to place attractor points on the canvas
- Live preview with color-coded thickness visualization
- Real-time influence field display

**Attractor Controls**
- **Mode**: Attract (closer = thicker) or Repel (closer = thinner)
- **Strength**: Intensity of attractor effect (0-2x)
- **Falloff Radius**: Distance at which influence drops to zero
- **Falloff Curve**: Linear, Exponential, or Inverse-Square
- **Multiple Attractor Mode**: Additive, Strongest Only, or Average

**Line Weight Settings**
- Base offset distance (0.01-0.5mm)
- Noise amount for natural variation
- Min/Max passes (1-50)

**Display Options**
- Toggle attractor visibility
- Show/hide influence field heatmap
- Preview mode with color-coded thickness

**Export & Presets**
- Export processed SVG (plotter-ready)
- Save attractor configurations as JSON presets
- Load preset configurations

### How It Works

1. **Upload SVG**: Load your artwork
2. **Place attractors**: Click on canvas to add attractor points
3. **Adjust settings**: Fine-tune falloff, strength, and curves
4. **Preview**: See real-time color-coded weight distribution
   - Green = thin (fewer passes)
   - Red = thick (more passes)
5. **Export**: Download processed SVG for plotting

### Attractor Modes

**Attract Mode** (default)
- Paths closer to attractors get thicker
- Great for emphasis and focal points

**Repel Mode**
- Paths closer to attractors get thinner
- Creates negative space effects

**Multiple Attractors**
- **Additive**: Effects stack (clamped to max)
- **Strongest**: Only strongest attractor affects each point
- **Average**: Average influence from all attractors

### Use Cases

- **Focus attention**: Place attractors at focal points
- **Depth effects**: Use attractors to simulate perspective
- **Selective emphasis**: Highlight specific areas of artwork
- **Organic variation**: Create natural-looking weight variations

---

## Crosshatch Fill Mode

An alternative fill strategy that creates hatched fills instead of parallel offset lines. Perfect for creating shaded areas, texture effects, and traditional pen-and-ink style crosshatching.

### How It Works

Instead of duplicating paths with offsets, crosshatch mode:
1. **Builds a ribbon** around each path using the same envelope/taper system
2. **Fills the ribbon** with angled hatch lines at specified angles
3. **Clips segments** to stay within the tapered boundary
4. **Respects envelopes** - hatches automatically taper at path ends

### CLI Usage

```bash
# Basic crosshatch with 45° angles
node process-svg.js input.svg output.svg \
  --fill-mode crosshatch \
  --hatch-angles "45,-45" \
  --hatch-spacing 2

# Perpendicular hatching (90° to path direction)
node process-svg.js input.svg output.svg \
  --fill-mode crosshatch \
  --hatch-angles "90" \
  --hatch-spacing 1.5

# Triple hatch with taper
node process-svg.js input.svg output.svg \
  --fill-mode crosshatch \
  --hatch-angles "30,90,150" \
  --hatch-spacing 1 \
  --offset-mode normal \
  --envelope sinTaperBoth

# Combine with noise for organic variation
node process-svg.js input.svg output.svg \
  --fill-mode crosshatch \
  --hatch-angles "45,-45" \
  --hatch-spacing 1.5 \
  --noise 0.2 \
  --noise-frequency 80
```

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `--fill-mode` | `offset` or `crosshatch` | `offset` |
| `--hatch-angles` | Comma-separated angles in degrees (e.g., "45,-45") | `90` |
| `--hatch-spacing` | Distance between hatch lines in mm | `1` |
| `--offset` | Controls ribbon width (baseWidth = offset × passes) | `0.25` |

**Note:** In crosshatch mode, the `--offset` parameter controls the width of the ribbon being filled, while `--max-passes` influences the total ribbon width (width = offset × passes).

### Web Interface

The web interface includes crosshatch controls:
1. **Fill Mode** toggle: Switch between Offset and Crosshatch
2. **Hatch Preset** dropdown:
   - Perpendicular (90°)
   - Cross 45° (±45°) - classic crosshatch
   - Cross 60° (±60°)
   - Parallel (0°) - parallel to path
   - Triple (30°/90°/150°)
   - Custom (enter your own angles)
3. **Hatch Spacing** slider (0.1-5mm)
4. **Live preview** in offset mode

### Use Cases

- **Shading effects** - Variable density hatching based on path length or attractors
- **Textured fills** - Create pen-and-ink style shading
- **Technical drawings** - Section marks, material indicators
- **Artistic effects** - Combine with envelopes for tapered hatches
- **Dense fills** - Fill wide paths efficiently

### Technical Details

- Hatches are clipped to the ribbon boundary using line-polyline intersection
- Envelope functions apply to both ribbon width and hatch length
- Noise affects hatch spacing (creates organic variation in density)
- Each angle pass generates separate hatch segments
- Compatible with attractor-based weighting (ribbon width varies by influence)

---

## Striped Fill Mode

A simple fill mode that creates alternating patterns of filled and empty passes, perfect for creating striped textures or reducing ink usage while maintaining visual weight.

### What It Does

Instead of drawing all offset passes, striped mode draws N consecutive passes, then skips M passes, repeating this pattern. This creates a striped appearance while using less ink than full offset fills.

### CLI Usage

```bash
# Basic striped pattern (1 filled, 1 empty)
node process-svg.js input.svg output.svg \
  --fill-mode striped \
  --stripe-filled 1 \
  --stripe-empty 1

# Heavy stripes (2 filled, 1 empty)
node process-svg.js input.svg output.svg \
  --fill-mode striped \
  --stripe-filled 2 \
  --stripe-empty 1

# Sparse stripes (1 filled, 3 empty)
node process-svg.js input.svg output.svg \
  --fill-mode striped \
  --stripe-filled 1 \
  --stripe-empty 3
```

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `--fill-mode striped` | Enable striped fill | - |
| `--stripe-filled` | Number of consecutive passes to draw | `1` |
| `--stripe-empty` | Number of consecutive passes to skip | `1` |
| `--add-outline` | Add outline strokes (works with striped mode) | `false` |

### Web Interface

The web UI includes striped fill controls:
1. **Fill Mode**: Select "Striped" from dropdown
2. **Filled Passes** slider (1-5)
3. **Empty Passes** slider (1-5)
4. **Pattern Preview**: Shows pattern description (e.g., "2 filled, 1 empty (repeating pattern)")
5. **Add Outline Stroke**: Works with striped mode to add boundary paths

### Use Cases

- **Textured fills** - Create striped patterns instead of solid fills
- **Ink saving** - Reduce plotting time and ink usage
- **Visual weight** - Maintain visual presence with less actual ink
- **Striped effects** - Intentional stripe patterns for artistic effect

---

## Hatch Gradient Fill Mode

Create **directional shading** effects with light-responsive hatch density. Perfect for creating the illusion of depth, volume, and lighting in pen plotter artwork.

### What It Does

Hatch gradient mode fills paths with angled hatches where the density (spacing between lines) varies based on simulated lighting. This creates shading effects similar to traditional pen-and-ink techniques.

**Key Features:**
- **Directional & Point Lighting** - Choose between directional light (like sunlight) or point light (like a lamp)
- **Shadow-Side Density** - Hatches become denser on surfaces facing away from light (shadows), sparse on lit surfaces (highlights)
- **Spatial Coherence** - Global field mode ensures consistent light-to-shadow transitions across all paths
- **Per-Surface Mode** - Each path calculates lighting independently for precise surface-level control
- **Multiple Hatch Angles** - Combine multiple angles (single, cross, triple) for rich crosshatching

### Lighting Modes

**Directional Light** (default)
- Simulates parallel light rays (like sunlight)
- Set light angle in degrees (0° = from right, 90° = from bottom, etc.)
- Consistent direction across entire image
- Great for: outdoor scenes, general shading, architectural drawings

**Point Light**
- Simulates radial light from a specific position
- Set light position as X/Y percentage of canvas
- Adjustable falloff radius controls how far light spreads
- Great for: focal effects, dramatic lighting, simulating a lamp or spotlight

### Shading Modes

**Per-Surface Shading**
- Each path calculates lighting based on its own surface normal
- Surface normals face perpendicular to path direction
- Surfaces facing light = sparse hatches (highlight)
- Surfaces facing away = dense hatches (shadow)
- Shadow bias shifts hatch lines toward shadow edge for enhanced gradient
- Best for: individual objects with clear surface orientation

**Global Field Shading** ⭐ (Recommended for scenes)
- Precomputes a global density field across entire viewport
- All paths sample from same underlying gradient
- Creates spatially coherent light-to-shadow transitions
- Paths act as "transparent windows" revealing the same lighting
- Shadow bias disabled (not needed with global coherence)
- Best for: complex scenes, multiple objects, consistent atmospheric lighting

### CLI Usage

```bash
# Basic directional light gradient (45° angle)
node process-svg.js input.svg output.svg \
  --fill-mode hatch-gradient \
  --light-angle 45 \
  --hatch-spacing 1.5

# Point light from top-left corner
node process-svg.js input.svg output.svg \
  --fill-mode hatch-gradient \
  --light-mode point \
  --light-pos-x 25 \
  --light-pos-y 25 \
  --falloff-radius 100 \
  --hatch-spacing 1

# Triple-angle crosshatch with strong light contrast
node process-svg.js input.svg output.svg \
  --fill-mode hatch-gradient \
  --hatch-angles "0,45,90" \
  --light-angle 135 \
  --light-strength 0.9 \
  --base-weight 0.1 \
  --hatch-spacing 1.2

# Soft, subtle shading
node process-svg.js input.svg output.svg \
  --fill-mode hatch-gradient \
  --light-angle 90 \
  --light-strength 0.5 \
  --base-weight 0.4 \
  --shadow-softness 0.8 \
  --hatch-spacing 2
```

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `--fill-mode hatch-gradient` | Enable hatch gradient fill | - |
| `--light-mode` | `directional` or `point` | `directional` |
| `--light-angle` | Light direction in degrees (directional mode) | `45` |
| `--light-pos-x` | Light X position in % (point mode) | `25` |
| `--light-pos-y` | Light Y position in % (point mode) | `25` |
| `--falloff-radius` | Distance where light drops to 50% (point mode, mm) | `100` |
| `--light-strength` | Light influence strength (0-1) | `0.8` |
| `--base-weight` | Minimum density in highlights (0-0.5) | `0.2` |
| `--shadow-softness` | Transition smoothness (0-1) | `0.5` |
| `--shadow-bias` | Shift hatches toward shadow (0-1, per-surface only) | `0.5` |
| `--hatch-angles` | Comma-separated angles (e.g., "0,45,90") | `"0,45,90"` |
| `--hatch-spacing` | Base spacing between hatches (mm) | `1` |

### Web Interface

The web UI includes comprehensive hatch gradient controls:

1. **Fill Mode**: Select "Hatch Gradient" from dropdown
2. **Light Mode**: Toggle between Directional and Point light
3. **Directional Controls** (when directional):
   - Light Angle slider (0-360°)
4. **Point Light Controls** (when point):
   - Light Position X/Y sliders (percentage of canvas)
   - Falloff Radius slider
   - Visual overlay showing light position and falloff radius
5. **Shading Settings**:
   - Light Strength (0-1)
   - Base Density (minimum in highlights)
   - Shadow Softness (transition smoothness)
6. **Shading Mode** ⭐:
   - **Per-Surface**: Independent calculation per path
   - **Global Field**: Spatially coherent scene-level lighting
7. **Shadow Bias** (per-surface mode only):
   - Shifts hatch origin toward shadow edge
8. **Debug Mode**:
   - Per-Surface: Shows highlight (blue) and shadow (red) edges
   - Global Field: Displays density field overlay with color ramp
9. **Hatch Preset**: Single, Cross, Triple, or Custom angles
10. **Hatch Spacing** slider

### Style Examples

**Classic Crosshatch Shading:**
```
--fill-mode hatch-gradient --hatch-angles "45,-45"
--light-angle 45 --light-strength 0.8 --hatch-spacing 1.5
```

**Soft Atmospheric Lighting:**
```
--fill-mode hatch-gradient --light-mode point
--light-pos-x 30 --light-pos-y 30 --falloff-radius 150
--light-strength 0.6 --shadow-softness 0.9 --base-weight 0.3
```

**High Contrast Dramatic Lighting:**
```
--fill-mode hatch-gradient --light-angle 90
--light-strength 1.0 --base-weight 0.05 --shadow-softness 0.2
```

**Perpendicular Hatching (Woodcut Style):**
```
--fill-mode hatch-gradient --hatch-angles "90"
--light-angle 45 --hatch-spacing 1 --light-strength 0.9
```

### Use Cases

- **Volume & Form** - Create illusion of 3D form on 2D paths
- **Atmospheric Perspective** - Suggest depth with consistent lighting
- **Focal Points** - Use point light to draw attention
- **Technical Illustration** - Show surface orientation and form
- **Artistic Shading** - Traditional pen-and-ink rendering techniques

### Technical Details

**Per-Surface Mode:**
- Calculates surface normal for each point along path centerline
- Dot product between surface normal and light direction determines density
- Shadow bias offsets hatch starting point toward shadow edge
- Each path shaded independently

**Global Field Mode:**
- Precomputes 128×128 density grid across viewport
- Bilinear interpolation for smooth sampling
- All paths sample same field = spatial coherence
- Updates automatically when light settings change
- Visualize with debug mode (blue=highlight, yellow, red=shadow)

**Performance:**
- Global field computation: ~1-2ms for 128×128 grid
- Field cached and reused until lighting changes
- Negligible overhead compared to hatch generation

---

## Light-Based Focus/Blur Effect

Create **depth of field** and **atmospheric blur** effects by spatially varying stroke spacing, noise amplitude, and noise frequency based on global lighting.

### What It Does

When enabled, the focus/blur effect modulates three parameters based on the global density field:
- **Stroke Spacing**: Distance between offset passes (tight in light, wide in shadow)
- **Noise Amplitude**: Amount of random variation (low in light, high in shadow)
- **Noise Frequency**: Smoothness of variation (calm in light, chaotic in shadow)

This creates a depth-of-field-like effect where lit areas appear sharp and in-focus, while shadowed areas appear soft and blurry.

### Requirements

- Must use **Offset Fill** or **Striped Fill** mode
- Must enable **Global Field** shading mode in Hatch Gradient controls
- Requires a light source (directional or point)

### How It Works

**Centerline Sampling:**
- Samples the global density field along the original path centerline (20 points)
- Averages field values to get a single scalar per path (0 = lit, 1 = shadow)
- Maps this value to spacing multiplier: `baseOffset × multiplier`
- All offset passes for that path get uniformly adjusted spacing

**Position-Dependent Noise:**
- Each point along every offset path samples the field individually
- Interpolates noise amplitude and frequency based on local field value
- Creates smooth spatial variation within and between strokes

### Web Interface

1. **Enable Global Field** shading mode in Hatch Gradient controls
2. Set up your light source (directional or point)
3. Check **"Enable Light-Based Focus/Blur"**
4. Adjust parameters:
   - **Noise Amplitude Min/Max**: Controls jitter in lit vs shadow areas (default: 0.05 → 0.5mm)
   - **Noise Frequency Min/Max**: Controls smoothness in lit vs shadow (default: 80 → 10mm wavelength)
   - **Stroke Spacing Min/Max**: Controls density in lit vs shadow (default: 1.0x → 2.0x)

### Style Presets

**Dramatic Depth of Field:**
```
Min noise: 0, Max noise: 0.8
Min freq: 120, Max freq: 5
Min spacing: 0.8x, Max spacing: 2.5x
```

**Subtle Atmospheric:**
```
Min noise: 0.05, Max noise: 0.3
Min freq: 80, Max freq: 20
Min spacing: 1.0x, Max spacing: 1.5x
```

**Extreme Blur (Impressionistic):**
```
Min noise: 0.1, Max noise: 1.5
Min freq: 50, Max freq: 5
Min spacing: 1.0x, Max spacing: 3.0x
```

### Use Cases

- **Depth of Field**: Simulate camera focus effects in illustrations
- **Atmospheric Perspective**: Objects in shadow appear softer/further away
- **Focal Attention**: Sharp focus on lit areas draws viewer's eye
- **Dreamy Effects**: High blur in shadows creates ethereal, soft quality
- **Motion Blur**: Combine with directional light for sense of movement

### Technical Details

- Lit areas (low density value): tight spacing, minimal noise, high frequency = sharp/crisp
- Shadow areas (high density value): wide spacing, heavy noise, low frequency = loose/blurry
- Zero overhead when disabled - only activates when checkbox enabled
- Backward compatible - existing modes unaffected
- Works with Normal offset mode only (Legacy mode ignores noise field)

**Performance:**
- ~20 field samples per path for spacing calculation
- Noise modulation same cost as regular noise
- Total overhead: negligible (~1-2% additional processing time)

---

## Organic Crosshatch Mode

Add **hand-drawn, Maurice Sendak-style** pen-and-ink quality to crosshatching with wiggly lines, angle variation, and irregular spacing.

### What It Does

When organic mode is enabled, crosshatch lines become:
- **Wiggly** - Sinusoidal perturbation creates hand-drawn waviness
- **Varied angles** - Each line varies slightly from target angle
- **Irregular spacing** - Random jitter creates organic density variation
- **Random lengths** - Some lines are shorter, like sketchy pen strokes
- **Position shifted** - Lines don't all start from exact centerline

### Master Toggle

**IMPORTANT:** Organic mode has a **master on/off toggle**. When disabled (default), all wiggle/jitter is bypassed and you get clean, mechanical crosshatch with zero overhead.

### CLI Usage

```bash
# Enable organic mode with defaults
node process-svg.js input.svg output.svg \
  --fill-mode crosshatch \
  --organic-hatch

# Full Sendak-style organic crosshatch
node process-svg.js input.svg output.svg \
  --fill-mode crosshatch \
  --hatch-angles "45,-45" \
  --hatch-spacing 1.5 \
  --organic-hatch \
  --hatch-wiggle 0.8 \
  --wiggle-frequency 20 \
  --angle-jitter 8 \
  --length-jitter 0.2 \
  --position-jitter 0.3 \
  --spacing-jitter 0.3

# Light hand-drawn effect
node process-svg.js input.svg output.svg \
  --fill-mode crosshatch \
  --organic-hatch \
  --hatch-wiggle 0.3 \
  --angle-jitter 3

# Mechanical crosshatch (organic mode OFF - fast)
node process-svg.js input.svg output.svg \
  --fill-mode crosshatch \
  --hatch-angles "45,-45"
```

### Organic Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `--organic-hatch` | flag | off | **Master toggle** - enables all organic effects |
| `--hatch-wiggle` | 0-2mm | 0 | Line waviness amplitude. 0=straight, 2=very wobbly |
| `--wiggle-frequency` | 5-50mm | 20 | Wiggle wavelength. Lower=tight curves, higher=gentle waves |
| `--angle-jitter` | 0-15° | 0 | Random angle variation per line. 0=uniform, 15=chaotic |
| `--length-jitter` | 0-0.5 | 0 | Randomly shorten lines. 0=full length, 0.5=up to 50% shorter |
| `--position-jitter` | 0-2mm | 0 | Shift line position perpendicular to path |
| `--spacing-jitter` | 0-1 | 0 | Randomize spacing between lines. 0=uniform, 1=highly irregular |

### Web Interface

The web UI includes:
1. **"Enable Organic Mode"** checkbox (master toggle)
2. **Organic Texture Controls** panel (appears when enabled):
   - Line Wiggle slider (0-2mm)
   - Wiggle Frequency slider (5-50mm)
   - Angle Variation slider (0-15°)
   - Length Randomization slider (0-0.5)
   - Position Jitter slider (0-2mm)
   - Spacing Randomization slider (0-1)

### Style Presets (Suggested Values)

**Sendak-Style (Classic Pen & Ink):**
```
--organic-hatch --hatch-wiggle 0.8 --wiggle-frequency 20
--angle-jitter 8 --length-jitter 0.2 --spacing-jitter 0.3
```

**Light Hand-Drawn:**
```
--organic-hatch --hatch-wiggle 0.3 --angle-jitter 3 --spacing-jitter 0.1
```

**Sketchy/Gestural:**
```
--organic-hatch --hatch-wiggle 1.2 --wiggle-frequency 15
--angle-jitter 12 --length-jitter 0.3 --spacing-jitter 0.4
```

**Gentle Organic (Subtle):**
```
--organic-hatch --hatch-wiggle 0.2 --wiggle-frequency 30
--angle-jitter 2 --spacing-jitter 0.15
```

### Performance Notes

- **Organic OFF**: Zero overhead, generates straight lines (2 points per line)
- **Organic ON**: ~5-10x more path data (5-10 points per wiggly line)
- File size increases proportionally to wiggle detail
- Preview can disable organic for speed even when export uses it
- All effects use deterministic seeded randomness (reproducible results)

### Technical Implementation

- **Wiggle**: Sinusoidal perturbation + noise perpendicular to line direction
- **Spacing Jitter**: Combines smooth noise with random variation
- **Angle Jitter**: Per-line rotation applied before casting ray
- **Length Jitter**: Scales intersection points toward line center
- **Position Jitter**: Offsets sample point along path normal
- **Deterministic**: Each line gets unique sub-seed for reproducibility

---

## Shape Fill Mode ("Peas in Pod")

Create **sequential filled or hollow shapes** along paths for unique organic textures. Perfect for creating decorative fills with circles that follow envelope tapers.

### What It Does

Shape fill mode places shapes (currently circles) sequentially along the path centerline. Shapes auto-size based on the envelope width, creating a "peas in a pod" effect where circles naturally taper with the path.

**Key Features:**
- **Auto-sizing**: Circle diameters follow envelope taper (sinTaperBoth, linearTaper, etc.)
- **Sequential placement**: Shapes placed along centerline with proportional spacing
- **Fill modes**: Hollow (outline only) or Filled (concentric passes)
- **Configurable spacing**: Control gap between shapes (1.0 = touching)
- **Width range**: Set min/max circle diameters for envelope modulation

### CLI Usage

```bash
# Basic shape fill with circles
node process-svg.js input.svg output.svg \
  --fill-mode shape-fill \
  --shape-fill-mode filled \
  --shape-spacing 1.0 \
  --shape-max-width 3.0

# Hollow circles with taper
node process-svg.js input.svg output.svg \
  --fill-mode shape-fill \
  --shape-fill-mode hollow \
  --envelope sinTaperBoth \
  --shape-max-width 2.5 \
  --shape-min-width 0.5

# Filled circles with tight spacing
node process-svg.js input.svg output.svg \
  --fill-mode shape-fill \
  --shape-fill-mode filled \
  --shape-spacing 0.8 \
  --shape-max-width 3.0 \
  --offset 0.38
```

### Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `--fill-mode shape-fill` | Enable shape fill mode | - |
| `--shape-type` | Shape type (currently only `circle`) | `circle` |
| `--shape-fill-mode` | `filled` (concentric passes) or `hollow` (outline) | `filled` |
| `--shape-spacing` | Gap multiplier (0-2, where 1.0 = shapes touch) | `1.0` |
| `--shape-max-width` | Maximum diameter at widest envelope point (mm) | `3.0` |
| `--shape-min-width` | Minimum diameter at narrowest envelope point (mm) | `0.0` |
| `--offset` | Base offset for concentric passes (filled mode) | `0.25` |

### Web Interface

The web UI includes comprehensive shape fill controls:
1. **Fill Mode**: Select "Shape Fill" from dropdown
2. **Fill Mode**: Toggle between Filled (concentric) and Hollow (outline only)
3. **Shape Spacing** slider (0-2.0)
4. **Max/Min Width** controls for envelope range
5. **Envelope Preset**: Choose taper (sinTaperBoth recommended)
6. **Base Offset**: Controls spacing between concentric circles in filled mode

### Use Cases

- **Decorative borders**: Create pearl-like borders along path edges
- **Organic textures**: Natural-looking dotted patterns that respond to path width
- **Beaded effects**: Simulated bead strings with realistic tapering
- **Dotted fills**: Alternative to solid offset fills with unique character
- **Expressive strokes**: Calligraphic effects where dots follow stroke variation

### Technical Details

- Circles placed sequentially along path using arc-length sampling
- Envelope determines circle radius at each position (radius = envelope × (maxWidth - minWidth) + minWidth)
- Spacing calculated proportionally to current envelope width
- Filled mode generates concentric circles with baseOffset spacing
- Compatible with all envelope presets (sinTaperBoth, linearTaper, etc.)

---

## Configuration & Presets System

The tool now includes a comprehensive **configuration management system** for saving, loading, and sharing settings across projects.

### Config Embedding in SVG Exports

**Every SVG exported from the web interface** automatically includes the complete configuration in its metadata. This enables perfect reproducibility and easy round-tripping.

**SVG Structure:**
```xml
<svg width="420mm" height="297mm" viewBox="0 0 420 297" xmlns="http://www.w3.org/2000/svg">
  <metadata id="plotter-config">
    <config xmlns="https://github.com/laserpilot/The-Plot-Thickens">
      {
        "baseOffset": 0.25,
        "fillMode": "shape-fill",
        "envelope": "sinTaperBoth",
        ...entire config...
      }
    </config>
  </metadata>
  <!-- Human-readable comments -->
  <g id="fill-paths">...</g>
</svg>
```

**Benefits:**
- **Perfect reproducibility**: Know exactly what settings created any output
- **Version tracking**: Compare configs between different versions
- **Debugging**: Easily identify what parameters were used
- **Round-tripping**: Load config back from previously exported SVGs

### Preset Management (Web Interface)

The **Advanced Options** section includes a complete preset management system:

**Built-in Presets:**
- **Organic Fill**: Smooth tapered offsets with sinTaperBoth envelope
- **Technical Crosshatch**: Clean mechanical hatches with outlines
- **Sketchy Focus/Blur**: Depth of field effect with noise variation
- **Peas in Pod**: Shape fill circles with tapered sizing
- **Striped Texture**: Alternating pattern with outline strokes
- **Hatch Gradient Shading**: Light-based density modulation

**User Presets:**
- **Export Config** (💾): Save current settings as timestamped JSON file
- **Import Config** (📂): Load settings from a JSON file
- **Load from SVG** (📋): Extract config from previously exported SVG

**LocalStorage Autosave:**
- Configuration automatically saved on every change
- Last session restored when page reloads
- Survives browser restarts and tab closures

### Typical Workflows

**Save Favorite Settings:**
```
1. Dial in your perfect settings (shape-fill, sinTaperBoth, etc.)
2. Click "Export Config" → saves plotter-config-2025-11-06.json
3. Later: Click "Import Config" → load that JSON → all settings restored
```

**Reproduce Past Work:**
```
1. You have an SVG you love: my-artwork-shape-fill-2025-10-31.svg
2. Click "Load from SVG" → select that SVG
3. All settings that created it are now loaded
4. Load a different source SVG and process with those settings
```

**Quick Style Switching:**
```
1. Select "Peas in Pod" from Built-in Presets dropdown
2. Process your artwork with shape-fill circles
3. Select "Technical Crosshatch" preset
4. Instantly switch to mechanical hatch style
```

### Creating Custom Presets

You can create your own preset library by:

1. **Export configs** as you work: Click "Export Config" after dialing in settings
2. **Organize presets** in a folder: `my-presets/vintage-crosshatch.json`
3. **Share with team**: Send JSON files to collaborators
4. **Add to built-ins** (optional): Place in `shared/config/presets/` to appear in dropdown

**Preset JSON Structure:**
```json
{
  "baseOffset": 0.25,
  "fillMode": "crosshatch",
  "envelope": "sinTaperBoth",
  "crosshatchAngles": [45, -45],
  "crosshatchSpacing": 1.5,
  "minPasses": 2,
  "maxPasses": 10,
  ...all configuration parameters...
}
```

### Adding Custom Built-in Presets

To add your own presets to the dropdown:

1. Create a JSON file in `shared/config/presets/my-preset.json`
2. Add an option to the dropdown in `web-v2/index.html`:
```html
<option value="my-preset">My Custom Preset - Description here</option>
```
3. Preset will automatically load when selected

---

## Web Interface v2

The modern web interface (`web-v2/`) provides a streamlined experience with improved performance and organization.

### Quick Start

```bash
# Serve locally (recommended)
python3 -m http.server 8000
# Visit: http://localhost:8000/web-v2/

# Or use Node.js
npx http-server -p 8000
# Visit: http://localhost:8000/web-v2/
```

### Key Features

**Accordion Layout:**
- Collapsible sections keep interface clean
- Focus on the controls you need
- Default expanded: File Upload, Fill Mode, Export

**Fill Modes:**
- Offset (traditional parallel offsets)
- Crosshatch (angled hatch fills)
- Striped (alternating filled/empty pattern)
- Spiral (twisted offset with rotation)
- Focus Blur (depth of field effects)
- Hatch Gradient (light-responsive shading)
- **Shape Fill** (sequential circles "peas in pod")

**Effects:**
- Envelope/Taper: Control width variation along paths
- Noise & Variation: Organic texture and smoothness
- Noise Gradient: Per-pass texture transitions
- Length Thresholding: Override auto-detected ranges

**Advanced Options:**
- Outline Extraction: Add boundary strokes with configurable thickness
- Length Binning: Organize output by path length
- **Configuration Presets**: Save/load/share complete settings
- **Built-in Preset Library**: Quick access to curated styles

**Performance:**
- **Chunked Processing**: Handles 10,000+ path files without freezing
- **Progress Meter**: Real-time updates during processing
- **Fast Preview Mode**: Color-coded stroke width approximation
- **Live Preview**: Auto-update on parameter changes (toggle)

**Export Options:**
- Quick Export: Direct download from browser
- Server Export: Backend processing for large files
- CLI Command: Copy equivalent command-line invocation
- **Output Size**: Default to A3 Landscape (420×297mm) or keep original dimensions
- **Config Embedding**: All exports include complete metadata

### UI Improvements Over Legacy Version

**Better Organization:**
- Grouped controls by category (Fill Mode, Effects, Advanced)
- Collapsible sections reduce visual clutter
- Logical flow from input → settings → export

**Enhanced Preview:**
- Zoom in/out/reset view controls
- Color-coded thickness visualization
- Fast preview mode for instant feedback
- Real-time attractor field overlay

**Smarter Defaults:**
- A3 Landscape output (prevents accidental huge canvases)
- Sensible envelope (sinTaperBoth) for organic results
- Reasonable pass counts (1-10) for typical 0.38mm pens

**Professional Features:**
- Outline thickness controls with dual sliders
- Sample shape tester for quick parameter tuning
- Comprehensive CLI command generator
- Built-in preset library with curated examples

---

## Phase 5: Coming Soon

- Combined length + attractor weighting system
- Additional attractor shapes (line, polygon)
- Curvature-based width modulation
- Additional shape types (squares, triangles, custom)
- Community preset library sharing

---

## Performance

### CLI Performance (Phase 2)

Optimized for very large SVG files:

- **Streaming output**: No memory limits, handles 500k+ paths
- **Smart sampling**: Caps at 500 samples per path (prevents slowdown on very long paths)
- **Zero-offset skip**: Skips resampling when offset=0 and noise=0
- **Progress logging**: Reports every 1000 paths instead of spamming console

**Example:** AG_stroke_length_combine_6_3.svg (93,137 paths, longest 11,377mm)
- Flattens in ~2 seconds
- Processes in ~10 minutes
- Generates 483,828 output paths
- Output streams directly to disk (no memory issues)

**Performance tips:**
- Use `--max-length` to cap very long paths (e.g., `--max-length 50`)
- Run `flatten-svg.js` first for consistent performance
- For files with 100k+ paths, expect ~10-20 minutes processing time

### Web Interface Performance (Phase 3)

Optimized for interactive editing:

- **Adaptive sampling:** Automatically adjusts point density based on path length
- **Efficient parsing:** Handles 200+ paths without UI freezing
- **Smart caching:** Reuses calculated data to avoid duplicate work
- **Optimized rendering:** Cap of ~800 points per path for smooth preview

**Example:** topographical_merged.svg (254 paths, longest path 125m)
- Parses in <1 second
- Preview renders smoothly at 60fps
- Uses ~200k points total (vs 15M+ without optimization)

See [VERIFICATION.md](VERIFICATION.md) for technical details.

---

## Output Format

All generated SVGs are **plotter-ready**:

- Flat structure (no transforms or groups)
- Separate `<path>` elements for each line
- Maintains original viewBox and dimensions
- Uses `stroke` (not `fill`) for pen plotting

---

## Testing

Start with the Phase 1 test pattern to calibrate your plotter and understand how parameters affect real-world output.

For parser testing, use `test-parser.html` to verify SVG parsing performance.

---

## Dependencies

- `svg-path-commander`: SVG path parsing and manipulation
- `commander`: CLI argument parsing
- `svgson`: SVG parsing and tree traversal (for flattening)

## License

MIT
