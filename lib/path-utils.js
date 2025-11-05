/**
 * Path measurement and manipulation utilities
 */

const { pathToAbsolute, pathToString, getTotalLength, getPointAtLength, normalizePath } = require('svg-path-commander');

/**
 * Calculate the total length of an SVG path
 * @param {string} pathData - SVG path d attribute
 * @returns {number} Total length in user units
 */
function measurePathLength(pathData) {
  try {
    const absolutePath = pathToAbsolute(pathData);
    return getTotalLength(absolutePath);
  } catch (error) {
    console.warn('Failed to measure path:', error.message);
    return 0;
  }
}

/**
 * Simple 1D Perlin-like noise generator for smooth variation
 * @param {number} x - Input value
 * @param {number} seed - Seed for deterministic noise
 * @returns {number} Noise value between -1 and 1
 */
function simpleNoise(x, seed = 0) {
  // Simple deterministic pseudo-random noise
  const n = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1; // Map to -1 to 1
}

/**
 * Generate proper perpendicular offset of a path
 * Uses resampling and normal calculation for clean parallel offset
 *
 * @param {string} pathData - Original SVG path
 * @param {number} offset - Offset distance (positive = right, negative = left)
 * @param {number} noise - Noise amount to add (0 = no noise)
 * @param {number} seed - Seed for deterministic noise
 * @returns {string} Offset path data
 */
function offsetPath(pathData, offset, noise = 0, seed = 0) {
  try {
    // Skip expensive resampling if offset and noise are both zero
    if (offset === 0 && noise === 0) {
      return pathData;
    }

    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return pathData;
    }

    // Resample path at regular intervals (every 1mm or closer for short paths)
    // Cap at 500 samples to prevent slowdown on very long paths
    const sampleInterval = Math.min(1, totalLength / 50);
    const numSamples = Math.min(500, Math.ceil(totalLength / sampleInterval));
    const offsetPoints = [];

    for (let i = 0; i <= numSamples; i++) {
      const t = (i / numSamples) * totalLength;
      const point = getPointAtLength(absolutePath, t);

      if (!point || isNaN(point.x) || isNaN(point.y)) continue;

      // Calculate tangent by looking at nearby points
      const delta = Math.min(0.1, totalLength * 0.01);
      const t1 = Math.max(0, t - delta);
      const t2 = Math.min(totalLength, t + delta);

      const p1 = getPointAtLength(absolutePath, t1);
      const p2 = getPointAtLength(absolutePath, t2);

      if (!p1 || !p2) continue;

      // Tangent vector
      const tx = p2.x - p1.x;
      const ty = p2.y - p1.y;
      const tLen = Math.sqrt(tx * tx + ty * ty);

      if (tLen === 0) continue;

      // Normal vector (perpendicular to tangent, pointing "right")
      const nx = -ty / tLen;
      const ny = tx / tLen;

      // Add smooth noise based on arc length
      const noiseValue = noise > 0 ? simpleNoise(t / 10, seed) * noise : 0;
      const totalOffset = offset + noiseValue;

      // Offset point perpendicular to path
      offsetPoints.push({
        x: point.x + nx * totalOffset,
        y: point.y + ny * totalOffset
      });
    }

    // Build new path from offset points
    if (offsetPoints.length === 0) {
      return pathData;
    }

    let newPath = `M ${offsetPoints[0].x.toFixed(3)} ${offsetPoints[0].y.toFixed(3)}`;
    for (let i = 1; i < offsetPoints.length; i++) {
      newPath += ` L ${offsetPoints[i].x.toFixed(3)} ${offsetPoints[i].y.toFixed(3)}`;
    }

    // Check if original path was closed
    const isClosed = pathData.trim().toLowerCase().endsWith('z');
    if (isClosed) {
      newPath += ' Z';
    }

    return newPath;
  } catch (error) {
    console.warn('Failed to offset path:', error.message);
    return pathData; // Return original on failure
  }
}

/**
 * Generate multiple offset passes of a path with centered distribution
 * @param {string} pathData - Original SVG path
 * @param {number} passes - Number of times to duplicate
 * @param {number} baseOffset - Base offset distance per pass
 * @param {number} noise - Noise amount to add
 * @param {number} seed - Seed for deterministic noise (defaults to hash of pathData)
 * @returns {Array<string>} Array of path data strings
 */
function generatePasses(pathData, passes, baseOffset, noise, seed = null) {
  const paths = [];

  // Generate deterministic seed from path data if not provided
  if (seed === null) {
    seed = hashString(pathData);
  }

  // Center the ribbon by alternating normals
  // Passes 0,2,4... go right (+), 1,3,5... go left (-)
  for (let i = 0; i < passes; i++) {
    const passIndex = Math.floor(i / 2); // How far from center
    const isRight = i % 2 === 0; // Alternate sides
    const direction = isRight ? 1 : -1;

    const offsetDistance = direction * passIndex * baseOffset;
    const passSeed = seed + i; // Unique seed per pass

    const offsetPathData = offsetPath(pathData, offsetDistance, noise, passSeed);
    paths.push(offsetPathData);
  }

  return paths;
}

/**
 * Simple string hash function for generating seeds
 * @param {string} str - String to hash
 * @returns {number} Hash value
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 100); i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Map a path length to a weight (number of passes)
 * @param {number} length - Path length
 * @param {Object} config - Mapping configuration
 * @returns {number} Number of passes
 */
function lengthToWeight(length, config) {
  const {
    minLength = 0,
    maxLength = 100,
    minPasses = 1,
    maxPasses = 20,
    curve = 'linear', // 'linear', 'exponential', 'logarithmic', 'custom'
    exponent = 2, // For exponential curve
    customFn = null, // Custom mapping function
  } = config;

  // Normalize length to 0-1 range
  const normalized = Math.max(0, Math.min(1, (length - minLength) / (maxLength - minLength)));

  let weight;

  switch (curve) {
    case 'exponential':
      weight = Math.pow(normalized, exponent);
      break;

    case 'logarithmic':
      // Logarithmic: slow start, fast end
      weight = Math.log(normalized * (Math.E - 1) + 1);
      break;

    case 'custom':
      if (typeof customFn === 'function') {
        weight = customFn(normalized);
      } else {
        weight = normalized;
      }
      break;

    case 'linear':
    default:
      weight = normalized;
      break;
  }

  // Map to pass range
  const passes = Math.round(minPasses + weight * (maxPasses - minPasses));
  return Math.max(minPasses, Math.min(maxPasses, passes));
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
    // Smooth ease in/out using cosine
    return 0.5 - Math.cos(t * Math.PI) / 2;
  },

  easeInOutBoth: (t) => {
    // Ease in and out at both ends
    if (t < 0.5) {
      return 0.5 - Math.cos(t * 2 * Math.PI) / 2;
    } else {
      return 0.5 - Math.cos((1 - t) * 2 * Math.PI) / 2;
    }
  }
};

/**
 * Get envelope function by name
 * @param {string} name - Envelope type name
 * @returns {Function} Envelope function
 */
function getEnvelope(name) {
  return envelopeFunctions[name] || envelopeFunctions.flat;
}

/**
 * Generate a circle path centered at (cx, cy) with given radius
 * @param {number} cx - Center X coordinate
 * @param {number} cy - Center Y coordinate
 * @param {number} radius - Circle radius
 * @returns {string} SVG path data for circle
 */
function generateCirclePath(cx, cy, radius) {
  if (radius <= 0) return '';

  // Use arc commands to create a perfect circle
  // M cx,cy-r A r,r 0 1,0 cx,cy+r A r,r 0 1,0 cx,cy-r Z
  return `M ${cx.toFixed(3)},${(cy - radius).toFixed(3)} ` +
         `A ${radius.toFixed(3)},${radius.toFixed(3)} 0 1,0 ${cx.toFixed(3)},${(cy + radius).toFixed(3)} ` +
         `A ${radius.toFixed(3)},${radius.toFixed(3)} 0 1,0 ${cx.toFixed(3)},${(cy - radius).toFixed(3)} Z`;
}

/**
 * Generate filled circle with concentric passes
 * @param {number} cx - Center X coordinate
 * @param {number} cy - Center Y coordinate
 * @param {number} radius - Outer radius
 * @param {number} baseOffset - Spacing between concentric passes
 * @returns {Array<string>} Array of circle path data (concentric rings)
 */
function generateFilledCircle(cx, cy, radius, baseOffset) {
  const circles = [];

  // Calculate number of concentric passes
  const numPasses = Math.max(1, Math.round(radius / baseOffset));

  // Generate circles from outside to inside
  for (let i = 0; i < numPasses; i++) {
    const currentRadius = radius - (i * baseOffset);
    if (currentRadius > 0) {
      circles.push(generateCirclePath(cx, cy, currentRadius));
    }
  }

  return circles;
}

/**
 * Generate shape fill for a path using sequential circle placement ("peas in pod")
 * @param {string} pathData - Original SVG path
 * @param {Object} options - Shape fill options
 * @param {string} options.shapeType - Shape type (currently only 'circle')
 * @param {string} options.shapeFillMode - 'hollow' or 'filled'
 * @param {number} options.shapeSpacing - Spacing multiplier relative to envelope width
 * @param {number} options.baseOffset - Spacing between concentric passes (for filled mode)
 * @param {string} options.envelope - Envelope type name
 * @param {number} options.maxWidth - Maximum envelope width in mm
 * @param {number} options.minWidth - Minimum envelope width in mm (default: 0)
 * @returns {Array<string>} Array of path data for all shapes
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
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return shapes;
    }

    // Get envelope function
    const envelopeFn = getEnvelope(envelope);

    // Walk along path and place shapes
    let currentDistance = 0;

    while (currentDistance <= totalLength) {
      // Get normalized position (0 to 1)
      const t = currentDistance / totalLength;

      // Calculate envelope width at this position
      const envelopeMultiplier = envelopeFn(t);
      const envelopeWidth = minWidth + envelopeMultiplier * (maxWidth - minWidth);

      // Circle diameter = envelope width
      const diameter = envelopeWidth;
      const radius = diameter / 2;

      // Skip if too small (minimum 2 * baseOffset for filled mode)
      const minRadius = shapeFillMode === 'filled' ? baseOffset * 2 : baseOffset * 0.5;
      if (radius < minRadius) {
        // Advance and continue
        const gap = shapeSpacing * envelopeWidth;
        currentDistance += diameter + gap;
        continue;
      }

      // Get position on path
      const point = getPointAtLength(absolutePath, currentDistance);

      if (!point || isNaN(point.x) || isNaN(point.y)) {
        break;
      }

      // Generate circle(s) at this position
      if (shapeType === 'circle') {
        if (shapeFillMode === 'filled') {
          // Generate concentric filled circles
          const filledCircles = generateFilledCircle(point.x, point.y, radius, baseOffset);
          shapes.push(...filledCircles);
        } else {
          // Generate single hollow circle
          const circle = generateCirclePath(point.x, point.y, radius);
          if (circle) {
            shapes.push(circle);
          }
        }
      }

      // Advance by diameter + spacing (proportional to envelope width)
      const gap = shapeSpacing * envelopeWidth;
      currentDistance += diameter + gap;
    }

  } catch (error) {
    console.warn('Failed to generate shape fill:', error.message);
  }

  return shapes;
}

module.exports = {
  measurePathLength,
  offsetPath,
  generatePasses,
  lengthToWeight,
  getEnvelope,
  envelopeFunctions,
  generateCirclePath,
  generateFilledCircle,
  generateShapeFill,
};
