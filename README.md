# Plotter Line Thickener

SVG line weight utility with attractor-based thickness control for pen plotters.

## Overview

This tool manipulates SVG line weights by duplicating and offsetting paths with noise, creating the illusion of variable thickness when plotted with a single-width pen.

## Project Status

- ✅ **Phase 1**: Test Pattern Generator (complete)
- ✅ **Phase 2**: Path Length-Based Weight (complete)
- ✅ **Phase 3**: Attractor-Based Weight System (complete)
- ⏳ **Phase 4**: Combined System (pending)

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
# Process an SVG with default settings
node process-svg.js input.svg output.svg

# Or use npm script
npm run process -- input.svg output.svg
```

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
  --max-passes 20 \        # Maximum passes
  --curve exponential \    # Curve type: linear, exponential, logarithmic
  --exponent 2 \           # Exponent for exponential curve
  --min-length 10 \        # Min path length (auto-detect if omitted)
  --max-length 100         # Max path length (auto-detect if omitted)
```

### Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `baseOffset` | 0.1 | Base offset distance per pass (mm) |
| `noise` | 0.05 | Random variation in offset (mm) |
| `minPasses` | 1 | Minimum number of path duplicates |
| `maxPasses` | 20 | Maximum number of path duplicates |
| `curve` | linear | Length-to-weight mapping curve |
| `exponent` | 2 | Exponent for exponential curve |
| `minLength` | auto | Minimum path length (auto-detected) |
| `maxLength` | auto | Maximum path length (auto-detected) |

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

## Phase 4: Coming Soon

- Combined length + attractor weighting system
- Batch processing with saved configurations
- Additional attractor shapes (line, polygon)

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

---

## Dependencies

- `svg-path-commander`: SVG path parsing and manipulation
- `commander`: CLI argument parsing

## License

MIT
