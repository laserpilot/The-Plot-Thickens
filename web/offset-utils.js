/**
 * Browser-compatible offset utilities
 * Proper perpendicular offset implementation for web interface
 */

/**
 * Simple 1D Perlin-like noise generator for smooth variation
 */
function simpleNoise(x, seed = 0) {
  const n = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/**
 * Simple string hash function
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 100); i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Generate proper perpendicular offset using point sampling
 * This is a browser-compatible version that works with our parsed points
 */
function generateOffsetPath(pathPoints, offset, noise, seed) {
  if (!pathPoints || pathPoints.length < 2) {
    return null;
  }

  const offsetPoints = [];

  for (let i = 0; i < pathPoints.length; i++) {
    const pt = pathPoints[i];

    // Skip move markers
    if (pt.move) {
      offsetPoints.push({ ...pt });
      continue;
    }

    // Calculate tangent from neighboring points
    let p1, p2;

    if (i === 0) {
      p1 = pathPoints[0];
      p2 = pathPoints[Math.min(1, pathPoints.length - 1)];
    } else if (i === pathPoints.length - 1) {
      p1 = pathPoints[Math.max(0, i - 1)];
      p2 = pathPoints[i];
    } else {
      p1 = pathPoints[i - 1];
      p2 = pathPoints[i + 1];
    }

    // Tangent vector
    const tx = p2.x - p1.x;
    const ty = p2.y - p1.y;
    const tLen = Math.sqrt(tx * tx + ty * ty);

    if (tLen === 0) {
      offsetPoints.push({ ...pt });
      continue;
    }

    // Normal vector (perpendicular, pointing "right")
    const nx = -ty / tLen;
    const ny = tx / tLen;

    // Add smooth noise
    const arcLength = i * 10; // Approximate arc length
    const noiseValue = noise > 0 ? simpleNoise(arcLength / 10, seed) * noise : 0;
    const totalOffset = offset + noiseValue;

    // Offset point
    offsetPoints.push({
      x: pt.x + nx * totalOffset,
      y: pt.y + ny * totalOffset,
      move: pt.move
    });
  }

  return offsetPoints;
}

/**
 * Convert points array to SVG path string
 */
function pointsToPathString(points) {
  if (!points || points.length === 0) return '';

  let pathStr = '';
  let firstInSubpath = true;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];

    if (pt.move) {
      pathStr += `M ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
      firstInSubpath = true;
    } else {
      if (firstInSubpath) {
        pathStr += `M ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        firstInSubpath = false;
      } else {
        pathStr += `L ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
      }
    }
  }

  return pathStr.trim();
}

/**
 * Envelope functions - control width variation along path length
 * All functions take normalized position t (0.0 to 1.0) and return width multiplier (0.0 to 1.0)
 */
const envelopeFunctions = {
  flat: (t) => 1.0,

  sinTaper: (t) => Math.sin(t * Math.PI / 2),

  sinTaperBoth: (t) => Math.sin(t * Math.PI),

  linearTaper: (t) => t,

  linearTaperBoth: (t) => (t < 0.5 ? t * 2 : (1 - t) * 2),

  easeInOut: (t) => {
    return 0.5 - Math.cos(t * Math.PI) / 2;
  },

  easeInOutBoth: (t) => {
    if (t < 0.5) {
      return 0.5 - Math.cos(t * 2 * Math.PI) / 2;
    } else {
      return 0.5 - Math.cos((1 - t) * 2 * Math.PI) / 2;
    }
  }
};

/**
 * Get envelope function by name
 */
function getEnvelope(name) {
  return envelopeFunctions[name] || envelopeFunctions.flat;
}

/**
 * Generate a circle path centered at (cx, cy) with given radius
 */
function generateCirclePath(cx, cy, radius) {
  if (radius <= 0) return '';

  return `M ${cx.toFixed(3)},${(cy - radius).toFixed(3)} ` +
         `A ${radius.toFixed(3)},${radius.toFixed(3)} 0 1,0 ${cx.toFixed(3)},${(cy + radius).toFixed(3)} ` +
         `A ${radius.toFixed(3)},${radius.toFixed(3)} 0 1,0 ${cx.toFixed(3)},${(cy - radius).toFixed(3)} Z`;
}

/**
 * Generate filled circle with concentric passes
 */
function generateFilledCircle(cx, cy, radius, baseOffset) {
  const circles = [];
  const numPasses = Math.max(1, Math.round(radius / baseOffset));

  for (let i = 0; i < numPasses; i++) {
    const currentRadius = radius - (i * baseOffset);
    if (currentRadius > 0) {
      circles.push(generateCirclePath(cx, cy, currentRadius));
    }
  }

  return circles;
}

/**
 * Generate shape fill for a path using sequential circle placement
 * Uses the SVGPathCommander library for path operations
 */
function generateShapeFill(pathData, options = {}) {
  const {
    shapeType = 'circle',
    shapeFillMode = 'filled',
    shapeSpacing = 1.0,
    baseOffset = 0.25,
    envelope = 'flat',
    maxWidth = 3.0,
    minWidth = 0.0,
  } = options;

  const shapes = [];

  try {
    // Use SVGPathCommander library (loaded from CDN)
    const absolutePath = SVGPathCommander.pathToAbsolute(pathData);
    const totalLength = SVGPathCommander.getTotalLength(absolutePath);

    if (totalLength === 0) {
      return shapes;
    }

    // Get envelope function
    const envelopeFn = getEnvelope(envelope);

    // Walk along path and place shapes
    let currentDistance = 0;

    while (currentDistance <= totalLength) {
      const t = currentDistance / totalLength;

      // Calculate envelope width at this position
      const envelopeMultiplier = envelopeFn(t);
      const envelopeWidth = minWidth + envelopeMultiplier * (maxWidth - minWidth);

      const diameter = envelopeWidth;
      const radius = diameter / 2;

      // Skip if too small
      const minRadius = shapeFillMode === 'filled' ? baseOffset * 2 : baseOffset * 0.5;
      if (radius < minRadius) {
        const gap = shapeSpacing * envelopeWidth;
        currentDistance += diameter + gap;
        continue;
      }

      // Get position on path
      const point = SVGPathCommander.getPointAtLength(absolutePath, currentDistance);

      if (!point || isNaN(point.x) || isNaN(point.y)) {
        break;
      }

      // Generate circle(s) at this position
      if (shapeType === 'circle') {
        if (shapeFillMode === 'filled') {
          const filledCircles = generateFilledCircle(point.x, point.y, radius, baseOffset);
          shapes.push(...filledCircles);
        } else {
          const circle = generateCirclePath(point.x, point.y, radius);
          if (circle) {
            shapes.push(circle);
          }
        }
      }

      // Advance by diameter + spacing
      const gap = shapeSpacing * envelopeWidth;
      currentDistance += diameter + gap;
    }

  } catch (error) {
    console.warn('Failed to generate shape fill:', error.message);
  }

  return shapes;
}
