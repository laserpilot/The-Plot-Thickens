# The Plot Thickens

SVG line weight utility with attractor-based thickness control for pen plotters.

## Overview

This tool manipulates SVG line weights by duplicating and offsetting paths with noise, creating the illusion of variable thickness when plotted with a single-width pen.

## Project Status

- ✅ **Phase 1**: Test Pattern Generator (complete)
- ✅ **Phase 2**: Path Length-Based Weight (complete)
- ✅ **Phase 3**: Attractor-Based Weight System (complete)
- ✅ **Phase 4**: Normal-Based Offsets with Taper (complete)
- ✅ **Crosshatch Fill**: Alternative fill mode with angled hatches (complete)
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

## Phase 5: Coming Soon

- Combined length + attractor weighting system
- Batch processing with saved configurations
- Additional attractor shapes (line, polygon)
- Curvature-based width modulation

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
