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
 * Legacy perpendicular offset implementation
 * Preserved for backward compatibility
 *
 * @param {string} pathData - Original SVG path
 * @param {number} offset - Offset distance (positive = right, negative = left)
 * @param {number} noise - Noise amount to add (0 = no noise)
 * @param {number} seed - Seed for deterministic noise
 * @param {number} sampleRate - Sample interval in mm (default: 2)
 * @returns {string} Offset path data
 */
function offsetPathLegacy(pathData, offset, noise = 0, seed = 0, sampleRate = 2) {
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

    // Resample path at regular intervals
    // Use configurable sampleRate (default 2mm) instead of fixed 1mm
    // Cap at 200 samples (reduced from 500) for better performance
    const sampleInterval = Math.min(sampleRate, totalLength / 50);
    const numSamples = Math.min(200, Math.ceil(totalLength / sampleInterval));
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
 * Normal-based perpendicular offset with envelope support
 * Uses uniform arc-length sampling for accurate offsets
 *
 * @param {string} pathData - Original SVG path
 * @param {number} offset - Base offset distance
 * @param {number} noise - Noise amount to add (0 = no noise)
 * @param {number} seed - Seed for deterministic noise
 * @param {string} pathId - Path identifier for envelope calculation
 * @param {Function} offsetEnvelope - Optional envelope function (pathId, t) => multiplier (default: 1.0)
 * @param {number} noiseFrequency - Noise wavelength in mm (default: 50 for smooth variation)
 * @param {number} sampleRate - Sample interval in mm (default: 2)
 * @returns {string} Offset path data
 */
function offsetPathNormal(pathData, offset, noise = 0, seed = 0, pathId = '', offsetEnvelope = null, noiseFrequency = 50, sampleRate = 2) {
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

    // Sample points uniformly by arc length
    // Use configurable sampleRate (default 2mm) instead of fixed 1mm
    // Cap at 200 samples (reduced from 500) for better performance
    const sampleInterval = Math.min(sampleRate, totalLength / 100);
    const numSamples = Math.min(200, Math.ceil(totalLength / sampleInterval));
    const offsetPoints = [];

    for (let i = 0; i <= numSamples; i++) {
      const arcLength = (i / numSamples) * totalLength;
      const t = i / numSamples; // Normalized parameter [0, 1]

      const point = getPointAtLength(absolutePath, arcLength);
      if (!point || isNaN(point.x) || isNaN(point.y)) continue;

      // Calculate tangent from adjacent samples
      const delta = Math.min(0.1, totalLength * 0.01);
      const t1 = Math.max(0, arcLength - delta);
      const t2 = Math.min(totalLength, arcLength + delta);

      const p1 = getPointAtLength(absolutePath, t1);
      const p2 = getPointAtLength(absolutePath, t2);

      if (!p1 || !p2) continue;

      // Tangent vector
      const tx = p2.x - p1.x;
      const ty = p2.y - p1.y;
      const tLen = Math.sqrt(tx * tx + ty * ty);

      if (tLen === 0) continue;

      // Unit normal (perpendicular to tangent, pointing "right")
      const nx = -ty / tLen;
      const ny = tx / tLen;

      // Apply envelope function
      const envelopeMultiplier = offsetEnvelope ? offsetEnvelope(pathId, t) : 1.0;

      // Apply noise modulated along the normal
      // Lower frequency = smoother (50mm+), higher = more texture (5-10mm)
      const noiseValue = noise > 0 ? simpleNoise(arcLength / noiseFrequency, seed) * noise : 0;
      const totalOffset = (offset + noiseValue) * envelopeMultiplier;

      // Offset point along normal
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
    console.warn('Failed to offset path (normal mode):', error.message);
    return pathData; // Return original on failure
  }
}

/**
 * Generate proper perpendicular offset of a path
 * Dispatcher function that routes to legacy or normal implementation
 *
 * @param {string} pathData - Original SVG path
 * @param {number} offset - Offset distance (positive = right, negative = left)
 * @param {number} noise - Noise amount to add (0 = no noise)
 * @param {number} seed - Seed for deterministic noise
 * @param {string} pathId - Path identifier for envelope (normal mode only)
 * @param {Function} offsetEnvelope - Envelope function (normal mode only)
 * @param {boolean} useNormalMode - Use normal-based offset (default: false for backward compat)
 * @param {number} noiseFrequency - Noise wavelength in mm (normal mode only, default: 50)
 * @param {number} sampleRate - Sample interval in mm (default: 2)
 * @returns {string} Offset path data
 */
function offsetPath(pathData, offset, noise = 0, seed = 0, pathId = '', offsetEnvelope = null, useNormalMode = false, noiseFrequency = 50, sampleRate = 2) {
  if (useNormalMode) {
    return offsetPathNormal(pathData, offset, noise, seed, pathId, offsetEnvelope, noiseFrequency, sampleRate);
  } else {
    return offsetPathLegacy(pathData, offset, noise, seed, sampleRate);
  }
}

/**
 * Generate multiple offset passes of a path with centered distribution
 * @param {string} pathData - Original SVG path
 * @param {number} passes - Number of times to duplicate
 * @param {number} baseOffset - Base offset distance per pass
 * @param {number} noise - Noise amount to add
 * @param {number} seed - Seed for deterministic noise (defaults to hash of pathData)
 * @param {string} pathId - Path identifier for envelope (normal mode only)
 * @param {Function} offsetEnvelope - Envelope function (normal mode only)
 * @param {boolean} useNormalMode - Use normal-based offset (default: false)
 * @param {number} noiseFrequency - Noise wavelength in mm (normal mode only, default: 50)
 * @param {number} sampleRate - Sample interval in mm (default: 2)
 * @param {string} fillMode - Fill mode: 'offset' or 'crosshatch' (default: 'offset')
 * @param {Object} crosshatchOptions - Options for crosshatch mode: {angles: Array, spacing: number}
 * @param {boolean} extractOutline - Return outline paths separately (default: false)
 * @returns {Array<string>|Object} Array of path strings, or {fills: Array, outlines: Array} if extractOutline=true
 */
function generatePasses(pathData, passes, baseOffset, noise, seed = null, pathId = '', offsetEnvelope = null, useNormalMode = false, noiseFrequency = 50, sampleRate = 2, fillMode = 'offset', crosshatchOptions = null, extractOutline = false) {
  // Generate deterministic seed from path data if not provided
  if (seed === null) {
    seed = hashString(pathData);
  }

  // Route to crosshatch fill if requested
  if (fillMode === 'crosshatch' && crosshatchOptions) {
    const { angles = [90], spacing = 1, organic = {} } = crosshatchOptions;
    // For crosshatch, baseOffset controls the ribbon width
    // passes parameter is ignored (crosshatch generates its own segments)
    const baseWidth = baseOffset * Math.max(1, passes);
    return generateCrosshatchFill(pathData, baseWidth, angles, spacing, noise, seed, pathId, offsetEnvelope, noiseFrequency, sampleRate, organic, extractOutline);
  }

  // Route to stippling fill if requested
  if (fillMode === 'stippling' && crosshatchOptions) {
    const { dotSpacing = 1.5, dotSize = 0.3 } = crosshatchOptions;
    // For stippling, baseOffset controls the ribbon width
    const baseWidth = baseOffset * Math.max(1, passes);
    return generateStipplingFill(pathData, baseWidth, dotSpacing, dotSize, seed, pathId, offsetEnvelope, sampleRate, extractOutline);
  }

  // Default: offset fill mode
  const paths = [];
  let leftOutline = null;
  let rightOutline = null;

  // Center the ribbon by alternating normals
  // Passes 0,2,4... go right (+), 1,3,5... go left (-)
  for (let i = 0; i < passes; i++) {
    const passIndex = Math.floor(i / 2); // How far from center
    const isRight = i % 2 === 0; // Alternate sides
    const direction = isRight ? 1 : -1;

    const offsetDistance = direction * passIndex * baseOffset;
    const passSeed = seed + i; // Unique seed per pass

    const offsetPathData = offsetPath(pathData, offsetDistance, noise, passSeed, pathId, offsetEnvelope, useNormalMode, noiseFrequency, sampleRate);
    paths.push(offsetPathData);

    // Track outermost offsets for outline extraction
    if (extractOutline && passes > 0) {
      // Last pass on each side is the outline
      const isLastRight = isRight && passIndex === Math.floor((passes - 1) / 2);
      const isLastLeft = !isRight && passIndex === Math.floor((passes - 2) / 2) + 1;

      if (passes === 1 || isLastRight) {
        rightOutline = offsetPathData;
      }
      if (passes > 1 && isLastLeft) {
        leftOutline = offsetPathData;
      }
    }
  }

  // Return with or without outlines
  if (extractOutline) {
    const outlines = [];
    if (rightOutline) outlines.push(rightOutline);
    if (leftOutline) outlines.push(leftOutline);
    return { fills: paths, outlines };
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
 * Envelope preset functions
 * Each function takes (pathId, t) and returns a multiplier in [0, 1]
 */
const EnvelopePresets = {
  /**
   * Flat envelope - no taper (default)
   */
  flat: (pathId, t) => 1.0,

  /**
   * Linear taper - starts full, ends at zero
   */
  linearTaper: (pathId, t) => 1.0 - t,

  /**
   * Linear taper both ends - zero at both ends, full in middle
   */
  linearTaperBoth: (pathId, t) => 1.0 - Math.abs(2 * t - 1),

  /**
   * Sin taper - smooth taper from start to end
   */
  sinTaper: (pathId, t) => Math.sin(Math.PI * t),

  /**
   * Sin taper both ends - smooth bulge in middle
   */
  sinTaperBoth: (pathId, t) => Math.sin(Math.PI * t),

  /**
   * Exponential taper - slow start, fast end
   */
  exponentialTaper: (pathId, t) => Math.pow(1.0 - t, 2),

  /**
   * Ease in-out taper - smooth both ends
   */
  easeInOut: (pathId, t) => {
    const x = 2 * t - 1; // Map to [-1, 1]
    return 1.0 - x * x; // Parabola
  }
};

/**
 * Get envelope function by preset name
 * @param {string} presetName - Name of the preset
 * @returns {Function} Envelope function (pathId, t) => multiplier
 */
function getEnvelopePreset(presetName) {
  return EnvelopePresets[presetName] || EnvelopePresets.flat;
}

/**
 * Generate a wiggly/hand-drawn line between two points
 * @param {Object} p1 - Start point {x, y}
 * @param {Object} p2 - End point {x, y}
 * @param {number} wiggle - Amplitude of wiggle perpendicular to line (mm)
 * @param {number} frequency - Wavelength of wiggle along line (mm)
 * @param {number} seed - Random seed for deterministic wiggle
 * @returns {Array} Array of points forming the wiggly line
 */
function generateWigglyLine(p1, p2, wiggle, frequency, seed) {
  if (wiggle === 0 || frequency === 0) {
    return [p1, p2]; // No wiggle - return straight line
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lineLength = Math.sqrt(dx * dx + dy * dy);

  if (lineLength < 0.1) {
    return [p1, p2]; // Too short to wiggle
  }

  // Unit vector along line
  const ux = dx / lineLength;
  const uy = dy / lineLength;

  // Perpendicular unit vector (for wiggle direction)
  const px = -uy;
  const py = ux;

  // Generate wiggle points
  const numSegments = Math.max(3, Math.ceil(lineLength / (frequency / 2)));
  const points = [];

  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const alongDistance = t * lineLength;

    // Base position along the line
    const baseX = p1.x + ux * alongDistance;
    const baseY = p1.y + uy * alongDistance;

    // Sinusoidal wiggle with noise for variation
    const phase = (alongDistance / frequency) * Math.PI * 2;
    const noiseOffset = simpleNoise(alongDistance / 10 + seed * 100, seed) * 0.3; // Add some randomness
    const wiggleAmount = Math.sin(phase + noiseOffset) * wiggle;

    // Apply wiggle perpendicular to line
    points.push({
      x: baseX + px * wiggleAmount,
      y: baseY + py * wiggleAmount
    });
  }

  return points;
}

/**
 * Compute line-polyline intersection
 * Returns the intersection point where a line segment intersects a polyline
 * @param {Object} lineStart - {x, y} start point of line
 * @param {Object} lineEnd - {x, y} end point of line
 * @param {Array} polyline - Array of {x, y} points
 * @returns {Object|null} Intersection point {x, y} or null if no intersection
 */
function linePolylineIntersection(lineStart, lineEnd, polyline) {
  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];

    const intersection = lineSegmentIntersection(lineStart, lineEnd, p1, p2);
    if (intersection) {
      return intersection;
    }
  }
  return null;
}

/**
 * Compute line segment intersection
 * @param {Object} a1 - First line start {x, y}
 * @param {Object} a2 - First line end {x, y}
 * @param {Object} b1 - Second line start {x, y}
 * @param {Object} b2 - Second line end {x, y}
 * @returns {Object|null} Intersection point {x, y} or null
 */
function lineSegmentIntersection(a1, a2, b1, b2) {
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null; // Parallel

  const t1 = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  const t2 = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;

  if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
    return {
      x: a1.x + t1 * dx1,
      y: a1.y + t1 * dy1
    };
  }

  return null;
}

/**
 * Generate crosshatch fill for a path
 * Fills the path's ribbon with angled hatch lines instead of parallel offsets
 * @param {string} pathData - Original SVG path
 * @param {number} baseWidth - Base width of the ribbon (half-width on each side)
 * @param {Array<number>} hatchAngles - Array of hatch angles in degrees (e.g., [45, -45])
 * @param {number} hatchSpacing - Base spacing between hatch lines (mm)
 * @param {number} noise - Noise amount to add to spacing
 * @param {number} seed - Seed for deterministic noise
 * @param {string} pathId - Path identifier for envelope
 * @param {Function} offsetEnvelope - Envelope function for width taper
 * @param {number} noiseFrequency - Noise wavelength in mm
 * @param {number} sampleRate - Sample interval in mm
 * @param {Object} organicOptions - Organic/hand-drawn options: {enabled, wiggle, wiggleFreq, angleJitter, lengthJitter, positionJitter, spacingJitter}
 * @param {boolean} extractOutline - Return outline paths separately (default: false)
 * @returns {Array<string>|Object} Array of hatch line path strings, or {fills: Array, outlines: Array} if extractOutline=true
 */
function generateCrosshatchFill(pathData, baseWidth, hatchAngles, hatchSpacing, noise = 0, seed = 0, pathId = '', offsetEnvelope = null, noiseFrequency = 50, sampleRate = 2, organicOptions = {}, extractOutline = false) {
  // Extract organic options with defaults
  const {
    enabled: organicEnabled = false,
    wiggle: hatchWiggle = 0,
    wiggleFreq: wiggleFrequency = 20,
    angleJitter = 0,
    lengthJitter = 0,
    positionJitter = 0,
    spacingJitter = 0
  } = organicOptions;
  try {
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return [];
    }

    // Sample centerline and compute offset boundaries
    const sampleInterval = Math.min(sampleRate, totalLength / 100);
    const numSamples = Math.min(200, Math.ceil(totalLength / sampleInterval));

    // Build centerline and offset boundaries
    const centerline = [];
    const leftBoundary = [];
    const rightBoundary = [];

    for (let i = 0; i <= numSamples; i++) {
      const arcLength = (i / numSamples) * totalLength;
      const t = i / numSamples;

      const point = getPointAtLength(absolutePath, arcLength);
      if (!point || isNaN(point.x) || isNaN(point.y)) continue;

      // Calculate tangent
      const delta = Math.min(0.1, totalLength * 0.01);
      const t1 = Math.max(0, arcLength - delta);
      const t2 = Math.min(totalLength, arcLength + delta);

      const p1 = getPointAtLength(absolutePath, t1);
      const p2 = getPointAtLength(absolutePath, t2);

      if (!p1 || !p2) continue;

      const tx = p2.x - p1.x;
      const ty = p2.y - p1.y;
      const tLen = Math.sqrt(tx * tx + ty * ty);

      if (tLen === 0) continue;

      // Unit normal
      const nx = -ty / tLen;
      const ny = tx / tLen;

      // Apply envelope
      const envelopeMultiplier = offsetEnvelope ? offsetEnvelope(pathId, t) : 1.0;
      const halfWidth = baseWidth * envelopeMultiplier;

      // Store centerline with metadata
      centerline.push({
        x: point.x,
        y: point.y,
        nx, ny,
        tx, ty,
        arcLength,
        t,
        halfWidth
      });

      // Build boundaries
      leftBoundary.push({
        x: point.x - nx * halfWidth,
        y: point.y - ny * halfWidth
      });

      rightBoundary.push({
        x: point.x + nx * halfWidth,
        y: point.y + ny * halfWidth
      });
    }

    if (centerline.length === 0) return [];

    // Generate hatch lines
    const hatchPaths = [];
    let hatchIndex = 0; // For unique seeds per hatch

    for (const angleInDegrees of hatchAngles) {
      // Apply angle jitter if organic mode enabled
      const actualAngle = organicEnabled && angleJitter > 0
        ? angleInDegrees + (simpleNoise(seed * 1000 + hatchIndex * 100, seed) * angleJitter * 2 - angleJitter)
        : angleInDegrees;

      const angleRad = (actualAngle * Math.PI) / 180;

      // March along centerline at spacing intervals
      let currentArcLength = 0;

      while (currentArcLength <= totalLength) {
        // Find closest centerline sample
        const sample = centerline.reduce((closest, pt) =>
          Math.abs(pt.arcLength - currentArcLength) < Math.abs(closest.arcLength - currentArcLength) ? pt : closest
        );

        // Apply position jitter if organic mode enabled
        let sampleX = sample.x;
        let sampleY = sample.y;
        if (organicEnabled && positionJitter > 0) {
          const jitterAmount = simpleNoise(currentArcLength / 20 + seed * 500, seed + hatchIndex) * positionJitter;
          sampleX += sample.nx * jitterAmount;
          sampleY += sample.ny * jitterAmount;
        }

        // Rotate normal by hatch angle to get hatch direction
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        const hatchDx = sample.nx * cos - sample.ny * sin;
        const hatchDy = sample.nx * sin + sample.ny * cos;

        // Cast ray in both directions from center
        const rayLength = sample.halfWidth * 2; // Ensure we hit boundaries
        const p1 = { x: sampleX - hatchDx * rayLength, y: sampleY - hatchDy * rayLength };
        const p2 = { x: sampleX + hatchDx * rayLength, y: sampleY + hatchDy * rayLength };

        // Intersect with boundaries
        let leftHit = linePolylineIntersection(p1, p2, leftBoundary);
        let rightHit = linePolylineIntersection(p1, p2, rightBoundary);

        if (leftHit && rightHit) {
          // Apply length randomization if organic mode enabled
          if (organicEnabled && lengthJitter > 0) {
            const shrinkFactor = 1 - (Math.abs(simpleNoise(hatchIndex * 50 + seed * 200, seed)) * lengthJitter);
            const centerX = (leftHit.x + rightHit.x) / 2;
            const centerY = (leftHit.y + rightHit.y) / 2;
            leftHit = {
              x: centerX + (leftHit.x - centerX) * shrinkFactor,
              y: centerY + (leftHit.y - centerY) * shrinkFactor
            };
            rightHit = {
              x: centerX + (rightHit.x - centerX) * shrinkFactor,
              y: centerY + (rightHit.y - centerY) * shrinkFactor
            };
          }

          // Generate wiggly or straight line
          if (organicEnabled && hatchWiggle > 0) {
            const wigglySeed = seed + hatchIndex;
            const points = generateWigglyLine(leftHit, rightHit, hatchWiggle, wiggleFrequency, wigglySeed);

            // Build path string from wiggly points
            if (points.length > 0) {
              let pathStr = `M ${points[0].x.toFixed(3)} ${points[0].y.toFixed(3)}`;
              for (let i = 1; i < points.length; i++) {
                pathStr += ` L ${points[i].x.toFixed(3)} ${points[i].y.toFixed(3)}`;
              }
              hatchPaths.push(pathStr);
            }
          } else {
            // Straight line (fast path)
            hatchPaths.push(`M ${leftHit.x.toFixed(3)} ${leftHit.y.toFixed(3)} L ${rightHit.x.toFixed(3)} ${rightHit.y.toFixed(3)}`);
          }
        }

        hatchIndex++;

        // Advance with noise and optional spacing jitter
        let noiseValue = noise > 0 ? simpleNoise(currentArcLength / noiseFrequency, seed) * noise : 0;

        // Add random spacing jitter if organic mode enabled
        if (organicEnabled && spacingJitter > 0) {
          const randomJitter = (simpleNoise(hatchIndex * 30 + seed * 300, seed) - 0.5) * 2; // -1 to 1
          noiseValue += randomJitter * spacingJitter * hatchSpacing;
        }

        const spacing = Math.max(0.1, hatchSpacing + noiseValue);
        currentArcLength += spacing;
      }
    }

    // Extract outline if requested
    if (extractOutline && leftBoundary.length > 0 && rightBoundary.length > 0) {
      const outlines = [];

      // Convert left boundary to path string
      const leftPathParts = leftBoundary.map((pt, i) => {
        const cmd = i === 0 ? 'M' : 'L';
        return `${cmd}${pt.x},${pt.y}`;
      });
      outlines.push(leftPathParts.join(' '));

      // Convert right boundary to path string
      const rightPathParts = rightBoundary.map((pt, i) => {
        const cmd = i === 0 ? 'M' : 'L';
        return `${cmd}${pt.x},${pt.y}`;
      });
      outlines.push(rightPathParts.join(' '));

      return { fills: hatchPaths, outlines };
    }

    return hatchPaths;
  } catch (error) {
    console.warn('Failed to generate crosshatch fill:', error.message);
    if (extractOutline) {
      return { fills: [], outlines: [] };
    }
    return [];
  }
}

/**
 * Generate stippling fill (dots placed along arc normals)
 * @param {string} pathData - SVG path data
 * @param {number} baseWidth - Width of the stippling ribbon
 * @param {number} dotSpacing - Distance between dots in mm
 * @param {number} dotSize - Radius of each dot in mm
 * @param {number} seed - Random seed
 * @param {string} pathId - Path identifier for envelope
 * @param {Function} offsetEnvelope - Optional envelope function (pathId, t) => multiplier
 * @param {number} sampleRate - Sample interval in mm (default: 2)
 * @param {boolean} extractOutline - Return outline paths separately (default: false)
 * @returns {Array<Object>|Object} Array of dot objects {x, y, r}, or {fills: Array, outlines: Array} if extractOutline=true
 */
function generateStipplingFill(pathData, baseWidth, dotSpacing, dotSize, seed = 0, pathId = '', offsetEnvelope = null, sampleRate = 2, extractOutline = false) {
  try {
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return [];
    }

    // Sample centerline and compute offset boundaries
    const sampleInterval = Math.min(sampleRate, totalLength / 100);
    const numSamples = Math.min(200, Math.ceil(totalLength / sampleInterval));

    // Build centerline and offset boundaries
    const centerline = [];
    const leftBoundary = [];
    const rightBoundary = [];

    for (let i = 0; i <= numSamples; i++) {
      const arcLength = (i / numSamples) * totalLength;
      const t = i / numSamples;

      const point = getPointAtLength(absolutePath, arcLength);
      if (!point || isNaN(point.x) || isNaN(point.y)) continue;

      // Calculate tangent
      const delta = Math.min(0.1, totalLength * 0.01);
      const t1 = Math.max(0, arcLength - delta);
      const t2 = Math.min(totalLength, arcLength + delta);

      const p1 = getPointAtLength(absolutePath, t1);
      const p2 = getPointAtLength(absolutePath, t2);

      if (!p1 || !p2) continue;

      const tx = p2.x - p1.x;
      const ty = p2.y - p1.y;
      const tLen = Math.sqrt(tx * tx + ty * ty);

      if (tLen === 0) continue;

      // Unit normal
      const nx = -ty / tLen;
      const ny = tx / tLen;

      // Apply envelope
      const envelopeMultiplier = offsetEnvelope ? offsetEnvelope(pathId, t) : 1.0;
      const halfWidth = baseWidth * envelopeMultiplier;

      // Store centerline with metadata
      centerline.push({
        x: point.x,
        y: point.y,
        nx, ny,
        arcLength,
        t,
        halfWidth
      });

      // Build boundaries
      leftBoundary.push({
        x: point.x - nx * halfWidth,
        y: point.y - ny * halfWidth
      });

      rightBoundary.push({
        x: point.x + nx * halfWidth,
        y: point.y + ny * halfWidth
      });
    }

    if (centerline.length === 0) return [];

    // Generate dots along the centerline
    const dots = [];
    let currentArcLength = 0;

    while (currentArcLength <= totalLength) {
      // Find closest centerline sample
      const sample = centerline.reduce((closest, pt) =>
        Math.abs(pt.arcLength - currentArcLength) < Math.abs(closest.arcLength - currentArcLength) ? pt : closest
      );

      // Calculate number of dots across the width at this position
      const numDotsAcross = Math.max(1, Math.floor((sample.halfWidth * 2) / dotSpacing));

      // Place dots symmetrically around the centerline
      for (let i = 0; i < numDotsAcross; i++) {
        let offsetDist;
        if (numDotsAcross === 1) {
          offsetDist = 0;
        } else {
          const step = (sample.halfWidth * 2) / (numDotsAcross - 1);
          offsetDist = -sample.halfWidth + i * step;
        }

        const dotX = sample.x + sample.nx * offsetDist;
        const dotY = sample.y + sample.ny * offsetDist;

        dots.push({
          x: dotX,
          y: dotY,
          r: dotSize
        });
      }

      currentArcLength += dotSpacing;
    }

    // Extract outline if requested
    if (extractOutline && leftBoundary.length > 0 && rightBoundary.length > 0) {
      const outlines = [];

      const leftPathParts = leftBoundary.map((pt, i) => {
        const cmd = i === 0 ? 'M' : 'L';
        return `${cmd}${pt.x},${pt.y}`;
      });
      outlines.push(leftPathParts.join(' '));

      const rightPathParts = rightBoundary.map((pt, i) => {
        const cmd = i === 0 ? 'M' : 'L';
        return `${cmd}${pt.x},${pt.y}`;
      });
      outlines.push(rightPathParts.join(' '));

      return { fills: dots, outlines };
    }

    return dots;
  } catch (error) {
    console.warn('Failed to generate stippling fill:', error.message);
    if (extractOutline) {
      return { fills: [], outlines: [] };
    }
    return [];
  }
}

module.exports = {
  measurePathLength,
  offsetPath,
  generatePasses,
  lengthToWeight,
  getEnvelopePreset,
  EnvelopePresets,
  generateCrosshatchFill,
  generateStipplingFill,
};
