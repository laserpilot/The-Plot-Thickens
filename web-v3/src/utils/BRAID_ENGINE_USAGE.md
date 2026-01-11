# Braid Engine Usage Guide

## Overview

The braid engine generates rhombus-based plait patterns with fiber fill curves. It's a pure JavaScript module with no DOM dependencies, suitable for both browser and Node.js environments.

**Location:** `/web-v2/src/utils/braid-engine.js`

## Quick Start

```javascript
import { generateBraid } from './utils/braid-engine.js';

// Define a backbone path
const backbone = {
  getPointAt(t) {
    return { x: 200, y: t * 800 };
  },
  getTangentAt(t) {
    return { x: 0, y: 1 };
  }
};

// Configure parameters
const params = {
  frequency: 2.25,      // Zigzag cycles
  fiberCount: 10,       // Fibers per continuation
  fiberBow: 0.5,        // Curvature strength
  braidLength: 800      // Total length
};

// Generate the braid
const braid = generateBraid(backbone, params);

// Use the results
console.log('Generated:', braid.fibers.length, 'fibers');
console.log('Generated:', braid.outlines.length, 'outlines');
```

## API Reference

### `generateBraid(backbone, params)`

**Parameters:**

- `backbone` (Object|null): Path definition with two methods:
  - `getPointAt(t)`: Returns `{x, y}` at normalized position `t` (0-1)
  - `getTangentAt(t)`: Returns normalized tangent `{x, y}` at position `t`
  - Pass `null` for a straight vertical braid

- `params` (Object): Configuration object with these properties:

#### User-Facing Parameters (exposed in UI)
- `frequency` (number, 0.5-100, default: 2.25): Zigzag cycles along the braid
- `wallFrequency` (number, optional): Wall wave cycles. Defaults to `frequency`. For best results with long paths, use `wallFrequency = frequency / 2`
- `cycleJitter` (number, 0-0.5, default: 0): Random phase shift per cycle
- `zigzagScale` (number, 0-3.0, default: 1.0): Multiplier for center amplitude
- `wallScale` (number, 0-3.0, default: 1.0): Multiplier for wall amplitude
- `tipTaper` (number, 0-1.0, default: 0.0): Pinch factor at tips
- `fiberCount` (integer, 1-30, default: 10): Number of fibers per continuation
- `fiberBias` (number, 0-1.0, default: 0.5): Distribution bias (0=start, 0.5=even, 1=end)
- `fiberLanding` (number, 0-1.0, default: 0.0): Landing position offset
- `fiberBow` (number, 0-1.0, default: 0.5): Fiber curvature strength
- `bowGradient` (number, 0.5-4.0, default: 2.0): Gradient power for fiber curves

#### Internal Parameters (usually hard-coded)
- `zigzagPhase` (number, default: 0): Center zigzag phase offset in degrees
- `leftWallPhase` (number, default: 0): Left wall phase offset in degrees
- `rightWallPhase` (number, default: 0): Right wall phase offset in degrees
- `sampleSpacing` (number, default: adaptive): Spacing between samples in pixels. Automatically calculated based on frequency to ensure 40 samples per wave cycle
- `continuationLength` (number, default: 20): Base length for continuation curves
- `continuationBias` (number, default: 0.7): Continuation curve bias
- `landingSpread` (number, default: 1.0): Landing rail spread factor
- `wallSeparation` (number, default: 100): Distance between left/right walls
- `braidLength` (number, default: 800): Total length of braid

**Returns:** Object with the following structure:

```javascript
{
  outlines: [
    {
      side: 'left' | 'right' | 'center',
      type: 'wall' | 'zigzag' | 'continuation',
      points: [{x, y}, ...],
      index: number
    },
    ...
  ],
  fibers: [
    {
      side: 'left' | 'right',
      points: [{x, y}, ...],
      pairIndex: number,
      targetPairIndex: number,
      fiberIndex: number
    },
    ...
  ],
  metadata: {
    braidLength: number,
    centerExtremaCount: number,
    leftTroughCount: number,
    rightTroughCount: number,
    continuationCount: number,
    fiberCount: number,
    parameters: {...}
  }
}
```

## Common Patterns

### 1. Straight Vertical Braid

```javascript
const braid = generateBraid(null, {
  frequency: 2.0,
  braidLength: 600,
  fiberCount: 8
});
```

### 2. Following a Loaded SVG Path

```javascript
// Assuming you have loaded SVG points
const points = [...]; // Array of {x, y}
const totalLength = calculatePathLength(points);

const backbone = {
  getPointAt(t) {
    return getPointAtLength(points, t * totalLength);
  },
  getTangentAt(t) {
    const delta = 0.001;
    const p0 = this.getPointAt(Math.max(0, t - delta));
    const p1 = this.getPointAt(Math.min(1, t + delta));
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    return { x: dx / len, y: dy / len };
  }
};

const braid = generateBraid(backbone, {
  braidLength: totalLength,
  frequency: 2.5
});
```

### 3. S-Curve Path

```javascript
const sCurveBackbone = {
  getPointAt(t) {
    const y = t * 800;
    const x = 200 + Math.sin(t * Math.PI * 2) * 100;
    return { x, y };
  },
  getTangentAt(t) {
    const delta = 0.001;
    const p0 = this.getPointAt(Math.max(0, t - delta));
    const p1 = this.getPointAt(Math.min(1, t + delta));
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    return { x: dx / len, y: dy / len };
  }
};

const braid = generateBraid(sCurveBackbone, {
  frequency: 3.0,
  braidLength: 800,
  fiberBow: 0.7
});
```

### 4. Tight Dense Braid

```javascript
const braid = generateBraid(backbone, {
  frequency: 4.0,        // More cycles
  fiberCount: 15,        // More fibers
  wallScale: 0.8,        // Narrower walls
  zigzagScale: 0.8,      // Narrower center
  fiberBow: 0.3          // Less curve
});
```

### 5. Loose Artistic Braid

```javascript
const braid = generateBraid(backbone, {
  frequency: 1.5,        // Fewer cycles
  fiberCount: 6,         // Fewer fibers
  wallScale: 1.5,        // Wider walls
  fiberBow: 0.8,         // More curve
  bowGradient: 3.0       // Sharper gradient
});
```

## Rendering to SVG

```javascript
function braidToSVG(braid, width, height) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`;

  // Create layers
  const layers = {
    center: [],
    left: [],
    right: [],
    continuations: [],
    fibers: []
  };

  // Organize outlines by layer
  braid.outlines.forEach(outline => {
    const pathData = 'M ' + outline.points.map(p => `${p.x},${p.y}`).join(' L ');

    if (outline.type === 'zigzag') {
      layers.center.push(`<path d="${pathData}" stroke="#ffcc00" fill="none" stroke-width="2"/>`);
    } else if (outline.type === 'wall' && outline.side === 'left') {
      layers.left.push(`<path d="${pathData}" stroke="#00ccff" fill="none" stroke-width="2"/>`);
    } else if (outline.type === 'wall' && outline.side === 'right') {
      layers.right.push(`<path d="${pathData}" stroke="#ff00cc" fill="none" stroke-width="2"/>`);
    } else if (outline.type === 'continuation') {
      layers.continuations.push(`<path d="${pathData}" stroke="#ff914d" fill="none" stroke-width="2"/>`);
    }
  });

  // Add fibers
  braid.fibers.forEach(fiber => {
    const pathData = 'M ' + fiber.points.map(p => `${p.x},${p.y}`).join(' L ');
    layers.fibers.push(`<path d="${pathData}" stroke="#cccccc" fill="none" stroke-width="1"/>`);
  });

  // Combine layers
  svg += '<g id="braid-outline-center">' + layers.center.join('') + '</g>';
  svg += '<g id="braid-outline-left">' + layers.left.join('') + '</g>';
  svg += '<g id="braid-outline-right">' + layers.right.join('') + '</g>';
  svg += '<g id="braid-continuations">' + layers.continuations.join('') + '</g>';
  svg += '<g id="braid-fibers">' + layers.fibers.join('') + '</g>';
  svg += '</svg>';

  return svg;
}
```

## Testing

Run the test suite:

```bash
cd /web-v2
node src/utils/braid-engine.test.js
```

The test suite validates:
- Straight and wavy backbones
- Output structure integrity
- Parameter variations
- Edge cases

## Wave Functions

The braid engine uses two distinct wave functions:

- **Center zigzag**: Triangle wave for sharp, pointy peaks
- **Wall boundaries**: |sin(x)| (absolute sine) for smooth bounce patterns that push outward from the baseline

This combination creates the classic rhombus braid appearance where the center zigzags sharply while the walls undulate smoothly.

## Performance Notes

- Typical generation time: <10ms for 800px braid with 10 fibers
- Memory usage scales linearly with `braidLength` and `fiberCount`
- Safe to run in browser main thread for real-time parameter tuning
- Consider web worker for very long braids (>2000px) or high fiber counts (>30)

## Next Steps

1. Integrate into web-v2 UI (see Step 5 in integration plan)
2. Add SVG export functionality
3. Create preset configurations ("tight", "loose", "artistic")
4. Add fixture tests with known-good outputs
