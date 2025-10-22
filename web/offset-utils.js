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
 * Legacy point-based offset implementation
 * Preserved for backward compatibility
 */
function generateOffsetPathLegacy(pathPoints, offset, noise, seed) {
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
 * Normal-based offset using svg-path-commander for accurate arc-length sampling
 * @param {string} pathData - SVG path d attribute
 * @param {number} offset - Base offset distance
 * @param {number} noise - Noise amount
 * @param {number} seed - Random seed
 * @param {string} pathId - Path identifier for envelope calculation
 * @param {Function} offsetEnvelope - Optional envelope function (pathId, t) => multiplier (default: 1.0)
 * @param {number} noiseFrequency - Noise wavelength in mm (default: 50 for smooth variation)
 * @returns {Array} Array of offset points
 */
function generateOffsetPathNormal(pathData, offset, noise, seed, pathId = '', offsetEnvelope = null, noiseFrequency = 50) {
  if (!pathData || typeof pathData !== 'string') {
    return null;
  }

  // Skip expensive processing if offset and noise are both zero
  if (offset === 0 && noise === 0) {
    return null;
  }

  try {
    // Convert to absolute commands
    const absolutePath = SVGPathCommander.pathToAbsolute(pathData);
    const totalLength = SVGPathCommander.getTotalLength(absolutePath);

    if (totalLength === 0) {
      return null;
    }

    // Sample points uniformly by arc length
    // Get sample rate from UI if available, otherwise use 2mm default
    const sampleRateInput = typeof document !== 'undefined' ? document.getElementById('sample-rate') : null;
    const sampleRate = sampleRateInput ? parseFloat(sampleRateInput.value) : 2;

    const sampleInterval = Math.min(sampleRate, totalLength / 100);
    // Always generate at least 2 samples (start and end) to prevent single-point paths
    const numSamples = Math.max(2, Math.min(200, Math.ceil(totalLength / sampleInterval)));
    const offsetPoints = [];

    for (let i = 0; i <= numSamples; i++) {
      const arcLength = (i / numSamples) * totalLength;
      const t = i / numSamples; // Normalized parameter [0, 1]

      const point = SVGPathCommander.getPointAtLength(absolutePath, arcLength);
      if (!point || isNaN(point.x) || isNaN(point.y)) continue;

      // Calculate tangent from adjacent samples
      const delta = Math.min(0.1, totalLength * 0.01);
      const t1 = Math.max(0, arcLength - delta);
      const t2 = Math.min(totalLength, arcLength + delta);

      const p1 = SVGPathCommander.getPointAtLength(absolutePath, t1);
      const p2 = SVGPathCommander.getPointAtLength(absolutePath, t2);

      if (!p1 || !p2) continue;

      // Tangent vector
      const tx = p2.x - p1.x;
      const ty = p2.y - p1.y;
      const tLen = Math.sqrt(tx * tx + ty * ty);

      let nx, ny;

      if (tLen < 0.001) {
        // Tangent collapsed - use overall path direction as fallback
        const startPt = SVGPathCommander.getPointAtLength(absolutePath, 0);
        const endPt = SVGPathCommander.getPointAtLength(absolutePath, totalLength);
        const dx = endPt.x - startPt.x;
        const dy = endPt.y - startPt.y;
        const dLen = Math.sqrt(dx * dx + dy * dy);

        if (dLen < 0.001) {
          // Path is essentially a point - skip offset (can't compute normal)
          continue;
        }

        // Use overall direction as normal
        nx = -dy / dLen;
        ny = dx / dLen;
      } else {
        // Unit normal (perpendicular to tangent, pointing "right")
        nx = -ty / tLen;
        ny = tx / tLen;
      }

      // Apply envelope function
      // For very short paths, maintain minimum envelope multiplier to prevent complete disappearance
      let envelopeMultiplier = offsetEnvelope ? offsetEnvelope(pathId, t) : 1.0;

      // If path is short (< 2x sample rate) and envelope would zero it out, apply floor
      if (totalLength < sampleRate * 2 && envelopeMultiplier < 0.1) {
        envelopeMultiplier = 0.1; // Minimum 10% offset for visibility
      }

      // Apply noise modulated along the normal
      // Lower frequency = smoother (50mm+), higher = more texture (5-10mm)
      const noiseValue = noise > 0 ? simpleNoise(arcLength / noiseFrequency, seed) * noise : 0;
      const totalOffset = (offset + noiseValue) * envelopeMultiplier;

      // Offset point along normal
      offsetPoints.push({
        x: point.x + nx * totalOffset,
        y: point.y + ny * totalOffset,
        move: i === 0 // Mark first point as move
      });
    }

    return offsetPoints;
  } catch (error) {
    console.warn('Failed to generate normal-based offset:', error.message);
    return null;
  }
}

/**
 * Generate proper perpendicular offset
 * Dispatcher function that routes to legacy or normal implementation
 * @param {Array|string} pathPointsOrData - Either point array (legacy) or path d string (normal)
 * @param {number} offset - Offset distance
 * @param {number} noise - Noise amount
 * @param {number} seed - Random seed
 * @param {string} pathId - Path identifier for envelope (normal mode only)
 * @param {Function} offsetEnvelope - Envelope function (normal mode only)
 * @param {boolean} useNormalMode - Whether to use normal-based offset (default: false for backward compat)
 * @param {number} noiseFrequency - Noise wavelength in mm (normal mode only, default: 50)
 * @returns {Array} Offset points
 */
function generateOffsetPath(pathPointsOrData, offset, noise, seed, pathId = '', offsetEnvelope = null, useNormalMode = false, noiseFrequency = 50) {
  if (useNormalMode && typeof pathPointsOrData === 'string') {
    return generateOffsetPathNormal(pathPointsOrData, offset, noise, seed, pathId, offsetEnvelope, noiseFrequency);
  } else {
    return generateOffsetPathLegacy(pathPointsOrData, offset, noise, seed);
  }
}

/**
 * Convert points array to SVG path string
 */
function pointsToPathString(points) {
  if (!points || points.length === 0) return '';

  // Handle single-point edge case: emit a tiny line segment so it's not invisible
  if (points.length === 1) {
    const pt = points[0];
    // Create a minimal line segment (0.001mm) to ensure visibility
    return `M ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} L ${(pt.x + 0.001).toFixed(3)} ${pt.y.toFixed(3)}`;
  }

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
