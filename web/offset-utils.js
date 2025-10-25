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
 * @param {Object} organicOptions - Organic/hand-drawn options: {enabled, wiggle, wiggleFreq, angleJitter, lengthJitter, positionJitter, spacingJitter}
 * @param {boolean} extractOutline - Return outline paths separately (default: false)
 * @returns {Array<string>|Object} Array of hatch line path strings, or {fills: Array, outlines: Array} if extractOutline=true
 */
function generateCrosshatchFill(pathData, baseWidth, hatchAngles, hatchSpacing, noise = 0, seed = 0, pathId = '', offsetEnvelope = null, noiseFrequency = 50, organicOptions = {}, extractOutline = false) {
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

  if (!pathData || typeof pathData !== 'string') {
    return [];
  }

  try {
    // Convert to absolute commands
    const absolutePath = SVGPathCommander.pathToAbsolute(pathData);
    const totalLength = SVGPathCommander.getTotalLength(absolutePath);

    if (totalLength === 0) {
      return [];
    }

    // Get sample rate from UI if available, otherwise use 2mm default
    const sampleRateInput = typeof document !== 'undefined' ? document.getElementById('sample-rate') : null;
    const sampleRate = sampleRateInput ? parseFloat(sampleRateInput.value) : 2;

    // Sample centerline and compute offset boundaries
    const sampleInterval = Math.min(sampleRate, totalLength / 100);
    const numSamples = Math.max(2, Math.min(200, Math.ceil(totalLength / sampleInterval)));

    // Build centerline and offset boundaries
    const centerline = [];
    const leftBoundary = [];
    const rightBoundary = [];

    for (let i = 0; i <= numSamples; i++) {
      const arcLength = (i / numSamples) * totalLength;
      const t = i / numSamples;

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
          continue;
        }

        nx = -dy / dLen;
        ny = dx / dLen;
      } else {
        // Unit normal (perpendicular to tangent, pointing "right")
        nx = -ty / tLen;
        ny = tx / tLen;
      }

      // Apply envelope function
      let envelopeMultiplier = offsetEnvelope ? offsetEnvelope(pathId, t) : 1.0;

      // If path is short (< 2x sample rate) and envelope would zero it out, apply floor
      if (totalLength < sampleRate * 2 && envelopeMultiplier < 0.1) {
        envelopeMultiplier = 0.1;
      }

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
 * FAST curvature calculation using pre-sampled points
 * Uses simple dot product proxy instead of expensive atan2
 *
 * @param {Array} points - Array of {x, y} points (already sampled)
 * @param {number} sampleStride - Process every Nth point (default: 5 for speed)
 * @returns {number} Raw curvature score (max angle difference), or 0 if insufficient points
 */
function calculatePathCurvatureFast(points, sampleStride = 5) {
  if (!points || points.length < sampleStride * 2) {
    return 0; // Need at least 2 segments
  }

  let maxCurvature = 0;
  let sumCurvature = 0;
  let sampleCount = 0;

  // Sample every Nth point for speed
  for (let i = sampleStride; i < points.length - sampleStride; i += sampleStride) {
    const p0 = points[i - sampleStride];
    const p1 = points[i];
    const p2 = points[i + sampleStride];

    // Skip move commands
    if (p0.move || p1.move || p2.move) continue;

    // Tangent vectors (no normalization needed for dot product!)
    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p1.x;
    const dy2 = p2.y - p1.y;

    // Squared lengths
    const len1Sq = dx1 * dx1 + dy1 * dy1;
    const len2Sq = dx2 * dx2 + dy2 * dy2;

    if (len1Sq < 0.001 || len2Sq < 0.001) continue;

    // Dot product of tangents (normalized by lengths)
    const dot = (dx1 * dx2 + dy1 * dy2) / Math.sqrt(len1Sq * len2Sq);

    // Curvature proxy: 1 - dot
    // dot = 1 (parallel) → curvature = 0 (straight)
    // dot = 0 (perpendicular) → curvature = 1 (90° turn)
    // dot = -1 (opposite) → curvature = 2 (180° turn)
    const curvature = Math.max(0, 1 - dot);

    maxCurvature = Math.max(maxCurvature, curvature);
    sumCurvature += curvature;
    sampleCount++;
  }

  // Return max curvature as the representative score
  // (max is more robust than average for detecting tight curves)
  return maxCurvature;
}

/**
 * DEPRECATED: Old slow curvature calculation using path data strings
 * Kept for backwards compatibility but not recommended
 * Use calculatePathCurvatureFast() instead for 100x better performance
 */
function calculatePathCurvature(pathData, sampleRate = 2, normalizationMode = 'percentile', percentile = 95) {
  if (!pathData || typeof pathData !== 'string') {
    return 0;
  }

  try {
    // Convert to absolute commands
    const absolutePath = SVGPathCommander.pathToAbsolute(pathData);
    const totalLength = SVGPathCommander.getTotalLength(absolutePath);

    if (totalLength === 0) {
      return 0;
    }

    // Sample points uniformly by arc length
    // Limit samples for performance - curvature doesn't need super high resolution
    const sampleInterval = Math.min(sampleRate, totalLength / 50);
    const numSamples = Math.max(3, Math.min(50, Math.ceil(totalLength / sampleInterval)));

    // Calculate curvature at each sample point
    const curvatures = [];

    for (let i = 1; i < numSamples - 1; i++) {
      const arcLength = (i / numSamples) * totalLength;

      // Get three consecutive points
      const delta = Math.min(0.5, totalLength * 0.01);
      const t0 = Math.max(0, arcLength - delta);
      const t1 = arcLength;
      const t2 = Math.min(totalLength, arcLength + delta);

      const p0 = SVGPathCommander.getPointAtLength(absolutePath, t0);
      const p1 = SVGPathCommander.getPointAtLength(absolutePath, t1);
      const p2 = SVGPathCommander.getPointAtLength(absolutePath, t2);

      if (!p0 || !p1 || !p2) continue;

      // Calculate tangent vectors
      const tx1 = p1.x - p0.x;
      const ty1 = p1.y - p0.y;
      const tLen1 = Math.sqrt(tx1 * tx1 + ty1 * ty1);

      const tx2 = p2.x - p1.x;
      const ty2 = p2.y - p1.y;
      const tLen2 = Math.sqrt(tx2 * tx2 + ty2 * ty2);

      if (tLen1 < 0.001 || tLen2 < 0.001) continue;

      // Normalize tangent vectors
      const ux1 = tx1 / tLen1;
      const uy1 = ty1 / tLen1;
      const ux2 = tx2 / tLen2;
      const uy2 = ty2 / tLen2;

      // Calculate angle change using dot product and cross product
      const dot = ux1 * ux2 + uy1 * uy2;
      const cross = ux1 * uy2 - uy1 * ux2;
      const angleChange = Math.atan2(cross, dot);

      // Curvature κ = |dθ/ds|
      const ds = (tLen1 + tLen2) / 2; // Average segment length
      const curvature = Math.abs(angleChange) / ds;

      curvatures.push(curvature);
    }

    if (curvatures.length === 0) {
      return 0;
    }

    // Calculate average curvature for this path
    const avgCurvature = curvatures.reduce((sum, k) => sum + k, 0) / curvatures.length;

    // Store raw curvature (normalization will happen globally across all paths)
    return avgCurvature;

  } catch (error) {
    console.warn('Failed to calculate curvature:', error.message);
    return 0;
  }
}

/**
 * Normalize curvature scores across multiple paths (OPTIMIZED single-pass)
 * @param {Array} paths - Array of path objects with curvatureRaw property
 * @param {string} mode - 'minmax' or 'percentile'
 * @param {number} percentile - Percentile threshold (e.g., 95 for top 5% rejection)
 * @returns {void} Updates paths in place with normalized curvatureScore
 */
function normalizeCurvatureScores(paths, mode = 'percentile', percentile = 95) {
  // First pass: collect curvatures and find min/max
  const curvatures = [];
  let minCurvature = Infinity;
  let maxCurvature = -Infinity;

  for (let i = 0; i < paths.length; i++) {
    const curv = paths[i].curvatureRaw || 0;
    if (curv > 0) {
      curvatures.push(curv);
      minCurvature = Math.min(minCurvature, curv);
      maxCurvature = Math.max(maxCurvature, curv);
    }
  }

  if (curvatures.length === 0) {
    // No curvature data - set all to 0
    for (let i = 0; i < paths.length; i++) {
      paths[i].curvatureScore = 0;
    }
    return;
  }

  // Apply percentile clamping if requested
  if (mode === 'percentile' && percentile < 100) {
    // Only sort for percentile mode
    curvatures.sort((a, b) => a - b);
    const percentileIndex = Math.floor((percentile / 100) * (curvatures.length - 1));
    maxCurvature = curvatures[percentileIndex];
  }

  // Avoid division by zero
  const range = maxCurvature - minCurvature;
  if (range < 1e-10) {
    for (let i = 0; i < paths.length; i++) {
      paths[i].curvatureScore = 0;
    }
    return;
  }

  // Second pass: normalize
  for (let i = 0; i < paths.length; i++) {
    const curv = paths[i].curvatureRaw;
    if (!curv || curv <= 0) {
      paths[i].curvatureScore = 0;
    } else {
      const clamped = Math.max(minCurvature, Math.min(maxCurvature, curv));
      paths[i].curvatureScore = (clamped - minCurvature) / range;
    }
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
  if (!pathData || typeof pathData !== 'string') {
    return [];
  }

  try {
    // Convert to absolute commands
    const absolutePath = SVGPathCommander.pathToAbsolute(pathData);
    const totalLength = SVGPathCommander.getTotalLength(absolutePath);

    if (totalLength === 0) {
      return [];
    }

    // Sample centerline and compute offset boundaries
    const sampleInterval = Math.min(sampleRate, totalLength / 100);
    const numSamples = Math.max(2, Math.min(200, Math.ceil(totalLength / sampleInterval)));

    // Build centerline with metadata
    const centerline = [];
    const leftBoundary = [];
    const rightBoundary = [];

    for (let i = 0; i <= numSamples; i++) {
      const arcLength = (i / numSamples) * totalLength;
      const t = i / numSamples;

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
          continue;
        }

        nx = -dy / dLen;
        ny = dx / dLen;
      } else {
        // Unit normal (perpendicular to tangent, pointing "right")
        nx = -ty / tLen;
        ny = tx / tLen;
      }

      // Apply envelope function
      let envelopeMultiplier = offsetEnvelope ? offsetEnvelope(pathId, t) : 1.0;

      // If path is short and envelope would zero it out, apply floor
      if (totalLength < sampleRate * 2 && envelopeMultiplier < 0.1) {
        envelopeMultiplier = 0.1;
      }

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

      // Build boundaries for outline extraction
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
      // Spacing them evenly perpendicular to the path
      const numDotsAcross = Math.max(1, Math.floor((sample.halfWidth * 2) / dotSpacing));

      // Place dots symmetrically around the centerline
      for (let i = 0; i < numDotsAcross; i++) {
        // Map i to offset distance from center
        // For odd counts: center dot at 0, then symmetrical pairs
        // For even counts: no center dot, symmetrical pairs
        let offsetDist;
        if (numDotsAcross === 1) {
          offsetDist = 0; // Single dot on centerline
        } else {
          // Distribute evenly across the width
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

      // Advance to next position along arc
      currentArcLength += dotSpacing;
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

/**
 * Smoothstep easing function for smooth transitions
 */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Generate light-based gradient hatching fill
 * Creates directional shading by varying hatch density based on light direction
 */
function generateHatchGradientFill(
  pathData,
  baseWidth,
  hatchAngles,
  baseSpacing,
  lightAngle,
  lightStrength = 0.8,
  baseWeight = 0.2,
  shadowSoftness = 0.5,
  noise = 0,
  seed = 0,
  pathId = '',
  offsetEnvelope = null,
  noiseFrequency = 50,
  organicOptions = {},
  extractOutline = false
) {
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
    const absolutePath = SVGPathCommander.pathToAbsolute(pathData);
    const totalLength = SVGPathCommander.getTotalLength(absolutePath);

    if (totalLength === 0) {
      return extractOutline ? { fills: [], outlines: [] } : [];
    }

    // Sample centerline and compute offset boundaries
    const sampleInterval = Math.min(2, totalLength / 100);
    const numSamples = Math.min(200, Math.ceil(totalLength / sampleInterval));

    // Build centerline and offset boundaries
    const centerline = [];
    const leftBoundary = [];
    const rightBoundary = [];

    for (let i = 0; i <= numSamples; i++) {
      const arcLength = (i / numSamples) * totalLength;
      const t = i / numSamples;

      const point = SVGPathCommander.getPointAtLength(absolutePath, arcLength);
      if (!point || isNaN(point.x) || isNaN(point.y)) continue;

      // Calculate tangent
      const delta = Math.min(0.1, totalLength * 0.01);
      const t1 = Math.max(0, arcLength - delta);
      const t2 = Math.min(totalLength, arcLength + delta);

      const p1 = SVGPathCommander.getPointAtLength(absolutePath, t1);
      const p2 = SVGPathCommander.getPointAtLength(absolutePath, t2);

      if (!p1 || !p2) continue;

      const tx = p2.x - p1.x;
      const ty = p2.y - p1.y;
      const tLen = Math.sqrt(tx * tx + ty * ty);

      if (tLen === 0) continue;

      // Unit normal and tangent
      const nx = -ty / tLen;
      const ny = tx / tLen;
      const ux = tx / tLen;
      const uy = ty / tLen;

      // Apply envelope
      const envelopeMultiplier = offsetEnvelope ? offsetEnvelope(pathId, t) : 1.0;
      const halfWidth = baseWidth * envelopeMultiplier;

      // Store centerline with metadata
      centerline.push({
        x: point.x,
        y: point.y,
        nx, ny,
        ux, uy,
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

    if (centerline.length === 0) {
      return extractOutline ? { fills: [], outlines: [] } : [];
    }

    // Convert light angle to direction vector
    const lightAngleRad = (lightAngle * Math.PI) / 180;
    const lightDirX = Math.cos(lightAngleRad);
    const lightDirY = Math.sin(lightAngleRad);

    // Generate hatch lines for each angle with density based on light
    const hatchPaths = [];
    let hatchIndex = 0;

    // Sort angles by average weight (lighter hatches first, darker last)
    const angleWeights = hatchAngles.map(angle => {
      const angleRad = (angle * Math.PI) / 180;
      const angleDirX = Math.cos(angleRad);
      const angleDirY = Math.sin(angleRad);
      const dotProduct = angleDirX * lightDirX + angleDirY * lightDirY;
      return { angle, avgWeight: Math.abs(dotProduct) };
    });
    angleWeights.sort((a, b) => a.avgWeight - b.avgWeight);

    for (const { angle: angleInDegrees } of angleWeights) {
      // Apply angle jitter if organic mode enabled
      const actualAngle = organicEnabled && angleJitter > 0
        ? angleInDegrees + (simpleNoise(seed * 1000 + hatchIndex * 100, seed) * angleJitter * 2 - angleJitter)
        : angleInDegrees;

      const angleRad = (actualAngle * Math.PI) / 180;

      // Direction of this hatch angle
      const hatchDirX = Math.cos(angleRad);
      const hatchDirY = Math.sin(angleRad);

      // March along centerline with variable spacing based on light
      let currentArcLength = 0;

      while (currentArcLength <= totalLength) {
        // Find closest centerline sample
        const sample = centerline.reduce((closest, pt) =>
          Math.abs(pt.arcLength - currentArcLength) < Math.abs(closest.arcLength - currentArcLength) ? pt : closest
        );

        // Calculate weight for this position based on LOCAL SURFACE ORIENTATION
        // dot(surfaceNormal, lightDir) determines if this point faces toward/away from light
        const dotProduct = sample.nx * lightDirX + sample.ny * lightDirY;

        // Map dot product to weight
        // Positive dot (facing light) = low weight = sparse (light area)
        // Negative dot (facing away) = high weight = dense (shadow area)
        let rawWeight = (1 - Math.abs(dotProduct)) * lightStrength + baseWeight;

        // Apply shadow softness (easing)
        if (shadowSoftness > 0) {
          rawWeight = smoothstep(baseWeight, 1.0, rawWeight);
        }

        // Clamp weight
        const weight = Math.max(0, Math.min(1, rawWeight));

        // Skip if weight is too low
        const epsilon = 0.05;
        if (weight < epsilon) {
          currentArcLength += baseSpacing * 2;
          continue;
        }

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
        const rayLength = sample.halfWidth * 2;
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

        // Calculate spacing based on weight: higher weight = denser = smaller spacing
        const densityFactor = 1.0 / Math.max(weight, epsilon);
        let spacing = baseSpacing * densityFactor;

        // Add noise variation
        if (noise > 0) {
          const noiseValue = simpleNoise(currentArcLength / noiseFrequency, seed + angleInDegrees) * noise;
          spacing += noiseValue;
        }

        // Add random spacing jitter if organic mode enabled
        if (organicEnabled && spacingJitter > 0) {
          const randomJitter = (simpleNoise(hatchIndex * 30 + seed * 300, seed) - 0.5) * 2;
          spacing += randomJitter * spacingJitter * baseSpacing;
        }

        // Ensure minimum spacing
        spacing = Math.max(0.1, spacing);
        currentArcLength += spacing;
      }
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

      return { fills: hatchPaths, outlines };
    }

    return hatchPaths;
  } catch (error) {
    console.warn('Failed to generate hatch gradient fill:', error.message);
    return extractOutline ? { fills: [], outlines: [] } : [];
  }
}
