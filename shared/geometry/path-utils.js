/**
 * Path measurement and manipulation utilities
 */

import { pathToAbsolute, pathToString, getTotalLength, getPointAtLength, normalizePath } from 'svg-path-commander';
import { DensityField } from '../fields/density-field.js';

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
 * Sample points along an SVG path at regular intervals
 * @param {string} pathData - SVG path d attribute
 * @param {number} sampleInterval - Distance between samples (default 5mm)
 * @returns {Array<{x: number, y: number}>} Array of sampled points
 */
function samplePathPoints(pathData, sampleInterval = 5) {
  try {
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength <= 0) return [];

    const points = [];
    const numSamples = Math.max(2, Math.ceil(totalLength / sampleInterval));

    for (let i = 0; i <= numSamples; i++) {
      const t = (i / numSamples) * totalLength;
      const point = getPointAtLength(absolutePath, t);

      if (point && !isNaN(point.x) && !isNaN(point.y)) {
        points.push({ x: point.x, y: point.y });
      }
    }

    return points;
  } catch (error) {
    console.warn('Failed to sample path:', error.message);
    return [];
  }
}

/**
 * Smooth 1D noise generator using cubic interpolation
 * Produces genuinely smooth, continuous noise without discontinuities
 * @param {number} x - Input value
 * @param {number} seed - Seed for deterministic noise
 * @returns {number} Noise value between -1 and 1
 */
function simpleNoise(x, seed = 0) {
  // Deterministic hash function for grid points
  function hash(n) {
    const nn = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
    return (nn - Math.floor(nn)) * 2 - 1; // -1 to 1
  }

  // Cubic interpolation for smoothness
  function fade(t) {
    // Smoothstep: 3t² - 2t³
    return t * t * (3 - 2 * t);
  }

  // Get integer and fractional parts
  const xi = Math.floor(x);
  const xf = x - xi;

  // Get noise values at integer grid points
  const v0 = hash(xi);
  const v1 = hash(xi + 1);

  // Cubic interpolation between grid points
  const t = fade(xf);
  return v0 * (1 - t) + v1 * t;
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
 * Normal-based perpendicular offset with spiral twist
 * The normal vector rotates progressively along the path length, creating a spiral/candy cane effect
 *
 * @param {string} pathData - Original SVG path
 * @param {number} offset - Base offset distance
 * @param {number} noise - Noise amount to add (0 = no noise)
 * @param {number} seed - Seed for deterministic noise
 * @param {string} pathId - Path identifier for envelope calculation
 * @param {Function} offsetEnvelope - Optional envelope function (pathId, t) => multiplier (default: 1.0)
 * @param {number} noiseFrequency - Noise wavelength in mm
 * @param {number} sampleRate - Sample interval in mm (default: 2)
 * @param {number} twistRate - Rotation in radians per mm of path length
 * @param {number} twistOffset - Starting angle offset in radians
 * @returns {string} Offset path data
 */
function offsetPathSpiral(pathData, offset, noise = 0, seed = 0, pathId = '', offsetEnvelope = null, noiseFrequency = 50, sampleRate = 2, twistRate = 0.01, twistOffset = 0) {
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
    const sampleInterval = Math.min(sampleRate, totalLength / 100);
    const numSamples = Math.min(200, Math.ceil(totalLength / sampleInterval));

    const points = [];

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
      let nx = -ty / tLen;
      let ny = tx / tLen;

      // Apply spiral twist: rotate normal based on arc length
      const twistAngle = twistOffset + (arcLength * twistRate);

      // Calculate rotated normal (no visibility culling)
      const cosTheta = Math.cos(twistAngle);
      const sinTheta = Math.sin(twistAngle);
      const nxTwisted = nx * cosTheta - ny * sinTheta;
      const nyTwisted = nx * sinTheta + ny * cosTheta;

      // Apply envelope function
      const envelopeMultiplier = offsetEnvelope ? offsetEnvelope(pathId, t) : 1.0;

      // Offset modulation: shrink toward center when "behind", expand when "front"
      // This creates a weaving/pulsing barber pole effect
      const visibilityFactor = Math.abs(Math.cos(twistAngle));
      const effectiveOffset = offset * visibilityFactor;

      // Apply noise modulated along the twisted normal
      const noiseValue = noise > 0 ? simpleNoise(arcLength / noiseFrequency, seed) * noise : 0;
      const totalOffset = (effectiveOffset + noiseValue) * envelopeMultiplier;

      points.push({
        x: point.x + nxTwisted * totalOffset,
        y: point.y + nyTwisted * totalOffset
      });
    }

    // Build single continuous path
    if (points.length === 0) {
      return pathData;
    }

    let pathStr = `M ${points[0].x.toFixed(3)} ${points[0].y.toFixed(3)}`;
    for (let i = 1; i < points.length; i++) {
      pathStr += ` L ${points[i].x.toFixed(3)} ${points[i].y.toFixed(3)}`;
    }

    return pathStr;
  } catch (error) {
    console.warn('Failed to offset path (spiral mode):', error.message);
    return pathData; // Return original on failure
  }
}

/**
 * Normal-based perpendicular offset with noise field modulation
 * Each point along the path samples the density field to modulate noise amplitude and frequency
 *
 * @param {string} pathData - Original SVG path
 * @param {number} offset - Base offset distance
 * @param {number} seed - Seed for deterministic noise
 * @param {string} pathId - Path identifier for envelope calculation
 * @param {Function} offsetEnvelope - Optional envelope function (pathId, t) => multiplier (default: 1.0)
 * @param {number} sampleRate - Sample interval in mm (default: 2)
 * @param {Object} noiseField - Density field for sampling (must have sample(x, y) method)
 * @param {Object} noiseFieldParams - Noise modulation params: {minAmp, maxAmp, minFreq, maxFreq}
 * @returns {string} Offset path data
 */
function offsetPathWithNoiseField(pathData, offset, seed = 0, pathId = '', offsetEnvelope = null, sampleRate = 2, noiseField = null, noiseFieldParams = null) {
  try {
    // Skip if offset is zero
    if (offset === 0) {
      return pathData;
    }

    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return pathData;
    }

    // Sample points uniformly by arc length
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

      // Apply noise modulated by density field
      let effectiveNoise = 0;
      let effectiveFrequency = 50;

      // If noise field is provided, modulate based on position
      if (noiseField && noiseFieldParams) {
        const fieldValue = noiseField.sample(point.x, point.y); // 0-1 (0=focus, 1=blur)
        effectiveNoise = noiseFieldParams.minAmp + fieldValue * (noiseFieldParams.maxAmp - noiseFieldParams.minAmp);
        effectiveFrequency = noiseFieldParams.minFreq + fieldValue * (noiseFieldParams.maxFreq - noiseFieldParams.minFreq);
      }

      const noiseValue = effectiveNoise > 0 ? simpleNoise(arcLength / effectiveFrequency, seed) * effectiveNoise : 0;
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
    console.warn('Failed to offset path with noise field:', error.message);
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
 * Calculate noise parameters for a pass based on gradient mode
 * @param {number} passIndex - Pass index (0 = center)
 * @param {number} totalPasses - Total number of passes
 * @param {string} gradientMode - 'flat', 'fuzzy-crisp', 'crisp-fuzzy'
 * @param {number} noiseMin - Minimum noise amplitude (crisp end)
 * @param {number} noiseMax - Maximum noise amplitude (fuzzy end)
 * @param {number} freqMin - Minimum noise frequency (crisp end, higher = tighter)
 * @param {number} freqMax - Maximum noise frequency (fuzzy end, lower = smoother)
 * @param {string} curve - Gradient curve: 'linear', 'exponential', 'inverse', 'smoothstep'
 * @param {number} baseNoise - Base noise value (used when gradientMode = 'flat')
 * @param {number} baseFreq - Base frequency value (used when gradientMode = 'flat')
 * @returns {Object} {amplitude, frequency} - Noise parameters for this pass
 */
function calculatePassNoise(passIndex, totalPasses, gradientMode, noiseMin, noiseMax, freqMin, freqMax, curve, baseNoise, baseFreq) {
  // Flat mode: use base values for all passes (backward compatible)
  if (gradientMode === 'flat' || totalPasses <= 1) {
    return { amplitude: baseNoise, frequency: baseFreq };
  }

  // Calculate normalized position (0 = centerline, 1 = outermost)
  // Pass 0 is centerline, passes 1+ are offsets
  const t = totalPasses > 1 ? passIndex / (totalPasses - 1) : 0;

  // Apply curve transform
  let curvedT;
  switch (curve) {
    case 'exponential':
      curvedT = Math.pow(t, 2);
      break;
    case 'inverse':
      curvedT = 1 - Math.pow(1 - t, 2);
      break;
    case 'smoothstep':
      curvedT = t * t * (3 - 2 * t);
      break;
    case 'linear':
    default:
      curvedT = t;
      break;
  }

  let amplitude, frequency;

  // Map to noise range based on gradient direction
  // Note: passIndex 0 = centerline, higher passIndex = outer passes
  if (gradientMode === 'fuzzy-crisp') {
    // Outer passes (high index/t) = fuzzy (high amp, low freq)
    // Inner passes (low index/t) = crisp (low amp, high freq)
    amplitude = noiseMin + curvedT * (noiseMax - noiseMin);
    frequency = freqMax - curvedT * (freqMax - freqMin);
  } else if (gradientMode === 'crisp-fuzzy') {
    // Outer passes (high index/t) = crisp (low amp, high freq)
    // Inner passes (low index/t) = fuzzy (high amp, low freq)
    amplitude = noiseMin + (1 - curvedT) * (noiseMax - noiseMin);
    frequency = freqMin + curvedT * (freqMax - freqMin);
  } else {
    amplitude = baseNoise;
    frequency = baseFreq;
  }

  return { amplitude, frequency };
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
 * @param {number} stripeFilled - Number of filled stripes in pattern (default: 1)
 * @param {number} stripeEmpty - Number of empty stripes in pattern (default: 1)
 * @param {number} outlineOffset - Distance between outline passes (default: 0.25)
 * @param {number} outlinePasses - Number of outline passes to generate (default: 1)
 * @returns {Array<string>|Object} Array of path strings, or {fills: Array, outlines: Array} if extractOutline=true
 */
function generatePasses(pathData, passes, baseOffset, noise, seed = null, pathId = '', offsetEnvelope = null, useNormalMode = false, noiseFrequency = 50, sampleRate = 2, fillMode = 'offset', crosshatchOptions = null, extractOutline = false, stripeFilled = 1, stripeEmpty = 1, outlineOffset = 0.25, outlinePasses = 1) {
  // Generate deterministic seed from path data if not provided
  if (seed === null) {
    seed = hashString(pathData);
  }

  // Extract noise gradient parameters from crosshatchOptions if present
  const noiseGradientMode = crosshatchOptions?.noiseGradientMode || 'flat';
  const noiseMin = crosshatchOptions?.noiseMin || 0.05;
  const noiseMax = crosshatchOptions?.noiseMax || 0.4;
  const freqMin = crosshatchOptions?.freqMin || 50;   // Crisp end: higher frequency (tighter)
  const freqMax = crosshatchOptions?.freqMax || 10;   // Fuzzy end: lower frequency (smoother)
  const gradientCurve = crosshatchOptions?.gradientCurve || 'linear';

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

  // Route to hatch gradient fill if requested
  if (fillMode === 'hatch-gradient' && crosshatchOptions) {
    const {
      angles = [0, 45, 90],
      spacing = 1,
      lightMode = 'directional',
      lightAngle = 45,
      lightPosX = 0,
      lightPosY = 0,
      falloffRadius = 100,
      lightStrength = 0.8,
      baseWeight = 0.2,
      shadowSoftness = 0.5,
      organic = {}
    } = crosshatchOptions;
    const baseWidth = baseOffset * Math.max(1, passes);
    return generateHatchGradientFill(
      pathData, baseWidth, angles, spacing, lightAngle, lightStrength, baseWeight, shadowSoftness,
      noise, seed, pathId, offsetEnvelope, noiseFrequency, sampleRate, organic, extractOutline,
      lightMode, lightPosX, lightPosY, falloffRadius
    );
  }

  // Route to focus-blur fill if requested
  if (fillMode === 'focus-blur' && crosshatchOptions) {
    const {
      lightMode = 'directional',
      lightAngle = 45,
      lightPosX = 0,
      lightPosY = 0,
      falloffRadius = 150,
      noiseMin = 0.05,
      noiseMax = 0.6,
      freqMin = 100,
      freqMax = 10,
      modulatePasses = false,
      passesMin = 1.0,
      passesMax = 1.5,
      viewBox = { x: 0, y: 0, width: 100, height: 100 }
    } = crosshatchOptions;

    // Initialize density field (static, shared across all paths)
    if (!generatePasses.focusBlurField) {
      const resolution = 128;
      generatePasses.focusBlurField = new DensityField(viewBox.width, viewBox.height, resolution);

      // Compute field based on light mode
      if (lightMode === 'point') {
        generatePasses.focusBlurField.computeFromPointLight(lightPosX, lightPosY, falloffRadius, 0, 1);
      } else {
        generatePasses.focusBlurField.computeFromDirectionalLight(lightAngle, 0, 1);
      }
    }

    const densityField = generatePasses.focusBlurField;

    // Sample field along centerline for blur factor (20 points)
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);
    const numSamples = Math.min(20, Math.max(2, Math.ceil(totalLength / 10)));
    let fieldSum = 0;

    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const pt = getPointAtLength(absolutePath, t * totalLength);
      if (pt) {
        fieldSum += densityField.sample(pt.x, pt.y);
      }
    }
    const avgBlurFactor = fieldSum / numSamples; // 0 = focus, 1 = blur

    // Optional: modulate pass count based on blur factor
    const effectivePasses = modulatePasses ?
      Math.round(passes * (passesMin + avgBlurFactor * (passesMax - passesMin))) :
      passes;

    // Build noise field params
    const noiseFieldParams = {
      minAmp: noiseMin,
      maxAmp: noiseMax,
      minFreq: freqMin,
      maxFreq: freqMax
    };

    // Generate offset paths with noise field modulation
    const paths = [];
    let leftOutline = null;
    let rightOutline = null;

    // If outlines requested, generate outermost offset paths
    if (extractOutline && effectivePasses > 0) {
      const rightPassIndex = Math.floor((effectivePasses - 1) / 2);
      const rightDistance = rightPassIndex * baseOffset;
      rightOutline = offsetPathWithNoiseField(pathData, rightDistance, seed + effectivePasses, pathId, offsetEnvelope, sampleRate, densityField, noiseFieldParams);

      if (effectivePasses > 1) {
        const leftPassIndex = Math.floor((effectivePasses - 2) / 2) + 1;
        const leftDistance = -leftPassIndex * baseOffset;
        leftOutline = offsetPathWithNoiseField(pathData, leftDistance, seed + effectivePasses + 1, pathId, offsetEnvelope, sampleRate, densityField, noiseFieldParams);
      }
    }

    // Generate fill passes
    for (let i = 0; i < effectivePasses; i++) {
      const passIndex = Math.floor(i / 2);
      const isRight = i % 2 === 0;
      const direction = isRight ? 1 : -1;
      const offsetDistance = direction * passIndex * baseOffset;
      const passSeed = seed + i;

      const offsetPathData = offsetPathWithNoiseField(pathData, offsetDistance, passSeed, pathId, offsetEnvelope, sampleRate, densityField, noiseFieldParams);
      paths.push(offsetPathData);
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

  // Default: offset fill mode
  const paths = [];
  const outlinePathsArray = [];

  // If outlines requested, generate multiple outline passes at increasing offset distances
  // Each outline pass creates a pair (left and right) at outlineOffset spacing
  if (extractOutline && passes > 0) {
    // Calculate the base distance from center (edge of fill ribbon)
    const rightPassIndex = Math.floor((passes - 1) / 2);
    const baseRightDistance = rightPassIndex * baseOffset;
    const leftPassIndex = passes > 1 ? Math.floor((passes - 2) / 2) + 1 : 0;
    const baseLeftDistance = leftPassIndex * baseOffset;

    // Generate multiple outline passes
    for (let outlinePass = 0; outlinePass < outlinePasses; outlinePass++) {
      const additionalOffset = outlinePass * outlineOffset;

      // Right outline at increasing distance
      const rightDistance = baseRightDistance + additionalOffset;
      const rightOutline = offsetPath(pathData, rightDistance, noise, seed + passes + outlinePass * 2, pathId, offsetEnvelope, useNormalMode, noiseFrequency, sampleRate);
      outlinePathsArray.push(rightOutline);

      // Left outline at increasing distance (if we have room for left side)
      if (passes > 1 || outlinePass > 0) {
        const leftDistance = -(baseLeftDistance + additionalOffset);
        const leftOutline = offsetPath(pathData, leftDistance, noise, seed + passes + outlinePass * 2 + 1, pathId, offsetEnvelope, useNormalMode, noiseFrequency, sampleRate);
        outlinePathsArray.push(leftOutline);
      }
    }
  }

  // For striped mode, use sequential offsets (all in same direction)
  // For spiral mode, use sequential offsets with progressive twist
  // For normal mode, center the ribbon by alternating normals (0,2,4 right, 1,3,5 left)
  if (fillMode === 'striped') {
    // Sequential offsets for clean striping
    let pathCount = 0;
    for (let i = 0; i < passes; i++) {
      const patternLength = stripeFilled + stripeEmpty;
      const positionInPattern = i % patternLength;

      // Skip if we're in the "empty" portion of the pattern
      if (positionInPattern >= stripeFilled) {
        continue;
      }

      // All paths go in positive direction sequentially
      const offsetDistance = i * baseOffset;
      const passSeed = seed + i;

      // Calculate per-pass noise parameters based on gradient mode
      const noiseParams = calculatePassNoise(i, passes, noiseGradientMode, noiseMin, noiseMax, freqMin, freqMax, gradientCurve, noise, noiseFrequency);

      const offsetPathData = offsetPath(pathData, offsetDistance, noiseParams.amplitude, passSeed, pathId, offsetEnvelope, useNormalMode, noiseParams.frequency, sampleRate);
      paths.push(offsetPathData);
      pathCount++;
    }
  } else if (fillMode === 'spiral') {
    // Spiral/twisted mode: sequential offsets with rotating normals
    // Extract spiral parameters from crosshatchOptions (reusing this mechanism)
    const twistRate = crosshatchOptions?.twistRate || 0.01; // radians per mm
    const twistOffset = crosshatchOptions?.twistOffset || 0; // starting angle in radians

    let pathCount = 0;
    for (let i = 0; i < passes; i++) {
      const patternLength = stripeFilled + stripeEmpty;
      const positionInPattern = i % patternLength;

      // Skip if we're in the "empty" portion of the pattern
      if (positionInPattern >= stripeFilled) {
        continue;
      }

      // All paths go in positive direction sequentially
      const offsetDistance = i * baseOffset;
      const passSeed = seed + i;

      // Phase shift per pass: advance twist based on radial position
      // This creates the helical/barber pole effect where stripes spiral outward
      const passPhaseOffset = twistOffset + (offsetDistance * twistRate);

      // Calculate per-pass noise parameters based on gradient mode
      const noiseParams = calculatePassNoise(i, passes, noiseGradientMode, noiseMin, noiseMax, freqMin, freqMax, gradientCurve, noise, noiseFrequency);

      const offsetPathData = offsetPathSpiral(
        pathData,
        offsetDistance,
        noiseParams.amplitude,
        passSeed,
        pathId,
        offsetEnvelope,
        noiseParams.frequency,
        sampleRate,
        twistRate,
        passPhaseOffset
      );

      paths.push(offsetPathData);
      pathCount++;
    }
  } else {
    // Normal mode: alternate left-right to center the ribbon
    for (let i = 0; i < passes; i++) {
      const passIndex = Math.floor(i / 2); // How far from center
      const isRight = i % 2 === 0; // Alternate sides
      const direction = isRight ? 1 : -1;

      const offsetDistance = direction * passIndex * baseOffset;
      const passSeed = seed + i; // Unique seed per pass

      // Calculate per-pass noise parameters based on gradient mode
      const noiseParams = calculatePassNoise(i, passes, noiseGradientMode, noiseMin, noiseMax, freqMin, freqMax, gradientCurve, noise, noiseFrequency);

      const offsetPathData = offsetPath(pathData, offsetDistance, noiseParams.amplitude, passSeed, pathId, offsetEnvelope, useNormalMode, noiseParams.frequency, sampleRate);
      paths.push(offsetPathData);
    }
  }

  // Return with or without outlines
  if (extractOutline) {
    return { fills: paths, outlines: outlinePathsArray };
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

/**
 * Smoothstep easing function for smooth transitions
 * @param {number} edge0 - Lower edge
 * @param {number} edge1 - Upper edge
 * @param {number} x - Input value
 * @returns {number} Smoothed value [0, 1]
 */
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Generate light-based gradient hatching fill
 * Creates directional shading by varying hatch density based on light direction or position
 *
 * @param {string} pathData - Original SVG path
 * @param {number} baseWidth - Base width of the ribbon
 * @param {Array<number>} hatchAngles - Array of hatch angles in degrees (e.g., [0, 45, 90])
 * @param {number} baseSpacing - Base spacing between hatch lines (mm)
 * @param {number} lightAngle - Light direction in degrees (0 = right, 90 = down) - for directional mode
 * @param {number} lightStrength - Light influence strength [0, 1]
 * @param {number} baseWeight - Minimum density weight [0, 1]
 * @param {number} shadowSoftness - Easing factor for smooth transitions [0, 1]
 * @param {number} noise - Noise amount for natural variation
 * @param {number} seed - Random seed
 * @param {string} pathId - Path identifier for envelope
 * @param {Function} offsetEnvelope - Envelope function for width taper
 * @param {number} noiseFrequency - Noise wavelength in mm
 * @param {number} sampleRate - Sample interval in mm
 * @param {Object} organicOptions - Organic/hand-drawn options (same as crosshatch)
 * @param {boolean} extractOutline - Return outline paths separately
 * @param {string} lightMode - 'directional' or 'point' (default: 'directional')
 * @param {number} lightPosX - X position of point light (user units) - for point mode
 * @param {number} lightPosY - Y position of point light (user units) - for point mode
 * @param {number} falloffRadius - Distance where light drops to 50% (user units) - for point mode
 * @returns {Array<string>|Object} Array of hatch line path strings with metadata, or {fills: Array, outlines: Array}
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
  sampleRate = 2,
  organicOptions = {},
  extractOutline = false,
  lightMode = 'directional',
  lightPosX = 0,
  lightPosY = 0,
  falloffRadius = 100
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
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return extractOutline ? { fills: [], outlines: [] } : [];
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
        ux, uy,  // Store unit tangent for angle calculations
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

    // Prepare light parameters based on mode
    let globalLightDirX, globalLightDirY;
    if (lightMode === 'directional') {
      const lightAngleRad = (lightAngle * Math.PI) / 180;
      globalLightDirX = Math.cos(lightAngleRad);
      globalLightDirY = Math.sin(lightAngleRad);
    }

    // Generate hatch lines for each angle with density based on light
    const hatchPaths = [];
    let hatchIndex = 0;

    // Sort angles by average weight (lighter hatches first, darker last)
    // For directional mode, we can pre-sort by angle alignment with light
    // For point mode, sorting is less meaningful (light direction varies), so just use input order
    const angleWeights = lightMode === 'directional'
      ? hatchAngles.map(angle => {
          const angleRad = (angle * Math.PI) / 180;
          const angleDirX = Math.cos(angleRad);
          const angleDirY = Math.sin(angleRad);
          const dotProduct = angleDirX * globalLightDirX + angleDirY * globalLightDirY;
          return { angle, avgWeight: Math.abs(dotProduct) };
        }).sort((a, b) => a.avgWeight - b.avgWeight)
      : hatchAngles.map(angle => ({ angle, avgWeight: 0 })); // Point mode: use input order

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

        // Calculate weight based on lighting mode
        let rawWeight;

        if (lightMode === 'point') {
          // POINT LIGHT MODE: Calculate direction and distance from sample to light
          const toLightX = lightPosX - sample.x;
          const toLightY = lightPosY - sample.y;
          const dist = Math.sqrt(toLightX * toLightX + toLightY * toLightY);

          // Avoid division by zero for point exactly at light
          if (dist < 0.001) {
            rawWeight = baseWeight; // Minimum density at light position
          } else {
            // Normalize direction to light
            const lightDirX = toLightX / dist;
            const lightDirY = toLightY / dist;

            // Surface orientation: does this point face toward the light?
            // Positive = facing light, negative = facing away
            const orientDot = sample.nx * lightDirX + sample.ny * lightDirY;

            // Remap signed dot to [0,1]: +1 (facing) → 0 (sparse), -1 (away) → 1 (dense)
            const orientWeight = (1 - orientDot) / 2;

            // Distance falloff: further from light = denser
            // Falloff radius is where light intensity drops to 50%
            const distanceFalloff = 1 / (1 + dist / falloffRadius);
            const distWeight = 1 - distanceFalloff; // 0 at light, 1 at infinity

            // Combine with separate strengths
            const orientStrength = 0.7; // How much surface orientation matters
            const distStrength = 0.3;   // How much distance matters
            rawWeight = (orientWeight * orientStrength + distWeight * distStrength) * lightStrength + baseWeight;
          }
        } else {
          // DIRECTIONAL MODE: Global light direction
          // dot(surfaceNormal, lightDir) determines if this point faces toward/away from light
          const dotProduct = sample.nx * globalLightDirX + sample.ny * globalLightDirY;

          // Map dot product [-1, 1] to weight [0, 1]
          // +1 (facing light) → 0 (low weight = sparse = bright)
          // -1 (facing away) → 1 (high weight = dense = shadow)
          rawWeight = ((1 - dotProduct) / 2) * lightStrength + baseWeight;
        }

        // Apply shadow softness (easing)
        if (shadowSoftness > 0) {
          rawWeight = smoothstep(baseWeight, 1.0, rawWeight);
        }

        // Clamp weight
        const weight = Math.max(0, Math.min(1, rawWeight));

        // Skip if weight is too low (avoids rendering nearly invisible hatches)
        const epsilon = 0.05;
        if (weight < epsilon) {
          currentArcLength += baseSpacing * 2; // Large skip for invisible areas
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
        // spacing = baseSpacing / max(weight, epsilon)
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
 * @param {string} options.pathId - Optional path identifier for envelope functions
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
    pathId = '',
  } = options;

  const shapes = [];

  try {
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return shapes;
    }

    // Get envelope function
    const envelopeFn = getEnvelopePreset(envelope);

    // Walk along path and place shapes
    let currentDistance = 0;
    let iterationCount = 0;
    const MAX_ITERATIONS = 10000;
    const MIN_ENVELOPE_WIDTH = 0.1; // Minimum viable envelope width (mm)

    while (currentDistance <= totalLength) {
      // Safety: prevent infinite loops
      iterationCount++;
      if (iterationCount > MAX_ITERATIONS) {
        console.warn(`Shape fill exceeded max iterations (${MAX_ITERATIONS}) for path ${pathId}`);
        break;
      }

      // Get normalized position (0 to 1)
      const t = currentDistance / totalLength;

      // Calculate envelope width at this position
      const envelopeMultiplier = envelopeFn(pathId, t);
      const envelopeWidth = minWidth + envelopeMultiplier * (maxWidth - minWidth);

      // If envelope collapses to very small width (e.g., tapered ends), skip forward to avoid infinite loop
      if (envelopeWidth < MIN_ENVELOPE_WIDTH) {
        const fallbackStep = Math.max(baseOffset * 2, 0.5);
        currentDistance += fallbackStep;
        continue;
      }

      // Circle diameter = envelope width
      const diameter = envelopeWidth;
      const radius = diameter / 2;

      // Skip if too small (minimum 2 * baseOffset for filled mode)
      const minRadius = shapeFillMode === 'filled' ? baseOffset * 2 : baseOffset * 0.5;
      if (radius < minRadius) {
        // Advance with minimum step to avoid tiny increments
        const gap = shapeSpacing * envelopeWidth;
        const advancement = Math.max(diameter + gap, baseOffset);
        currentDistance += advancement;
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

/**
 * Generate barber pole spiral fill with dynamic twist and occlusion
 * @param {string} pathData - Original SVG path
 * @param {Object} options - Barber pole options
 * @param {number} options.stripeCount - Number of spiral lanes (2-8)
 * @param {number} options.twistFrequency - Rotations per mm (0.05-1.0)
 * @param {string} options.twistRateMode - 'constant', 'inverse', or 'proportional'
 * @param {string} options.occlusionMode - 'none', 'smooth', or 'hard'
 * @param {number} options.minOcclusion - Minimum extension at back (0.0-0.5)
 * @param {number} options.baseOffset - Fill line spacing within stripes
 * @param {string} options.envelope - Envelope type name
 * @param {number} options.maxWidth - Maximum envelope width in mm
 * @param {number} options.minWidth - Minimum envelope width in mm (default: 0)
 * @param {number} options.noise - Noise amount for stripe fills
 * @param {number} options.seed - Random seed
 * @param {number} options.sampleRate - Sample interval in mm
 * @param {string} options.pathId - Optional path identifier
 * @returns {Array<string>} Array of path data for all stripe fills
 */
/**
 * Generate pixelated barber pole fill (experimental discrete stripe regions)
 * Creates rectangular stripe regions with gaps - produces a mosaic/tiled effect
 */
function generateBarberPolePixelated(pathData, options = {}) {
  const {
    stripeCount = 3,
    twistFrequency = 0.2,
    twistRateMode = 'inverse',
    occlusionMode = 'smooth',
    minOcclusion = 0.0,
    baseOffset = 0.25,
    envelope = 'flat',
    maxWidth = 3.0,
    minWidth = 0.0,
    noise = 0,
    seed = 0,
    sampleRate = 0.5,
    pathId = '',
  } = options;

  try {
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return [];
    }

    // Get envelope function
    const envelopeFn = getEnvelopePreset(envelope);

    // Step 1: Sample path with twist phase accumulation
    const centerlineWithPhase = samplePathWithTwist(
      absolutePath,
      totalLength,
      envelopeFn,
      pathId,
      maxWidth,
      minWidth,
      twistFrequency,
      twistRateMode,
      sampleRate
    );

    if (centerlineWithPhase.length === 0) {
      return [];
    }

    // Step 2: Generate stripe boundaries
    const stripeBoundaries = generateStripeBoundaries(
      centerlineWithPhase,
      stripeCount,
      occlusionMode,
      minOcclusion
    );

    // Debug: Check segments
    let totalSegments = 0;
    stripeBoundaries.forEach(stripe => {
      totalSegments += stripe.segments.length;
    });

    if (totalSegments === 0) {
      const maxTwist = centerlineWithPhase[centerlineWithPhase.length - 1]?.accumulatedTwist || 0;
      console.warn(`Pixelated barber pole: 0 segments. Path ${pathId}, length ${totalLength.toFixed(2)}mm, samples ${centerlineWithPhase.length}, twist ${maxTwist.toFixed(3)} rotations`);
    }

    // Step 3: Fill each stripe
    const paths = fillStripeBoundaries(
      stripeBoundaries,
      baseOffset,
      noise,
      seed
    );

    return paths;

  } catch (error) {
    console.warn('Failed to generate barber pole fill:', error.message);
    return [];
  }
}

/**
 * Sample path and accumulate twist phase
 * @private
 */
function samplePathWithTwist(
  absolutePath,
  totalLength,
  envelopeFn,
  pathId,
  maxWidth,
  minWidth,
  twistFrequency,
  twistRateMode,
  sampleRate
) {
  const sampleInterval = Math.min(sampleRate, totalLength / 100);
  const numSamples = Math.min(500, Math.ceil(totalLength / sampleInterval));
  const centerlineWithPhase = [];
  let accumulatedTwist = 0;

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const arcLength = t * totalLength;

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

    // Unit normal (perpendicular to tangent)
    const nx = -ty / tLen;
    const ny = tx / tLen;

    // Get envelope width at this position
    const envelopeMultiplier = envelopeFn(pathId, t);
    const localWidth = minWidth + envelopeMultiplier * (maxWidth - minWidth);

    // Calculate local twist rate based on mode
    let localTwistRate;
    switch (twistRateMode) {
      case 'constant':
        localTwistRate = twistFrequency;
        break;
      case 'inverse':
        // Faster twist when narrow, slower when wide
        localTwistRate = twistFrequency * (maxWidth / Math.max(localWidth, 0.1));
        break;
      case 'proportional':
        // Faster when wide, slower when narrow
        localTwistRate = twistFrequency * (localWidth / maxWidth);
        break;
      default:
        localTwistRate = twistFrequency;
    }

    // Integrate twist over step distance
    if (i > 0) {
      const prevArcLength = centerlineWithPhase[centerlineWithPhase.length - 1].arcLength;
      const stepDistance = arcLength - prevArcLength;
      accumulatedTwist += localTwistRate * stepDistance;
    }

    // Store sample with phase
    centerlineWithPhase.push({
      x: point.x,
      y: point.y,
      nx,
      ny,
      localWidth,
      width: localWidth, // Alias for smooth barber pole compatibility
      accumulatedTwist,
      phase: accumulatedTwist, // Alias for smooth barber pole compatibility
      t,
      arcLength
    });
  }

  return centerlineWithPhase;
}

/**
 * Calculate extension factor based on phase and occlusion mode
 * @private
 */
function calculateExtension(phase, occlusionMode, minOcclusion) {
  // Normalize phase to 0.0-1.0 range
  const normalizedPhase = ((phase % 1.0) + 1.0) % 1.0;

  switch (occlusionMode) {
    case 'none':
      return 1.0;

    case 'smooth':
      // Linear occlusion: full at front (0), minimum at back (0.5)
      if (normalizedPhase < 0.5) {
        // Front half: 1.0 -> minOcclusion
        return 1.0 - (1.0 - minOcclusion) * (normalizedPhase * 2);
      } else {
        // Back half: minOcclusion -> 1.0
        return minOcclusion + (1.0 - minOcclusion) * ((normalizedPhase - 0.5) * 2);
      }

    case 'hard':
      // Sharp cutoff at quarter points
      if (normalizedPhase < 0.25 || normalizedPhase > 0.75) {
        return 1.0;
      } else {
        return minOcclusion;
      }

    default:
      return 1.0;
  }
}

/**
 * Calculate visibility for three-strand braid occlusion.
 * Creates proper over/under weave pattern where each family leads in sequence.
 *
 * @param {number} phaseWithOffset - Phase including family offset
 * @param {number} cycleWidth - Width of one complete cycle
 * @param {number} familyIdx - Current family index (0, 1, or 2)
 * @param {number} familyCount - Total number of families (should be 3)
 * @returns {number} Visibility weight from 0.0 (hidden) to 1.0 (fully visible)
 */
function calculateThreeStrandVisibility(phaseWithOffset, cycleWidth, familyIdx, familyCount) {
  // Normalize phase to 0.0-1.0 range
  const normalizedPhase = ((phaseWithOffset / cycleWidth) % 1.0 + 1.0) % 1.0;

  // Divide cycle into zones (one per family)
  // Zone 0: Family 0 leads
  // Zone 1: Family 1 leads
  // Zone 2: Family 2 leads
  const zoneIndex = Math.floor(normalizedPhase * familyCount);
  const leadFamily = zoneIndex;

  // Calculate base visibility
  let visibility;

  if (familyIdx === leadFamily) {
    // This family is on top
    visibility = 1.0;
  } else {
    // Determine over/under relationship
    // The lead family occludes the next family in sequence
    // This creates pattern: Family 0 over 1, Family 1 over 2, Family 2 over 0
    const occludedFamily = (leadFamily + 1) % familyCount;

    if (familyIdx === occludedFamily) {
      // This family is directly behind the lead (mostly hidden)
      visibility = 0.1;
    } else {
      // This family is the middle strand (partially visible)
      visibility = 0.6;
    }
  }

  // Apply smooth transition at zone boundaries
  const fadeWidth = 0.05; // 5% fade zone at each boundary
  const zoneProgress = (normalizedPhase * familyCount) % 1.0;

  // Determine which families are adjacent at this boundary
  const nextZone = (zoneIndex + 1) % familyCount;

  if (zoneProgress < fadeWidth) {
    // Fading in from previous zone
    const prevZone = (zoneIndex - 1 + familyCount) % familyCount;
    const prevOccludedFamily = (prevZone + 1) % familyCount;
    const prevVisibility = (familyIdx === prevZone) ? 1.0 :
                          (familyIdx === prevOccludedFamily) ? 0.1 : 0.6;

    // Smooth transition using cosine
    const t = zoneProgress / fadeWidth;
    const smoothT = (1 - Math.cos(t * Math.PI)) / 2;
    visibility = prevVisibility * (1 - smoothT) + visibility * smoothT;

  } else if (zoneProgress > (1.0 - fadeWidth)) {
    // Fading out to next zone
    const nextOccludedFamily = (nextZone + 1) % familyCount;
    const nextVisibility = (familyIdx === nextZone) ? 1.0 :
                          (familyIdx === nextOccludedFamily) ? 0.1 : 0.6;

    // Smooth transition using cosine
    const t = (zoneProgress - (1.0 - fadeWidth)) / fadeWidth;
    const smoothT = (1 - Math.cos(t * Math.PI)) / 2;
    visibility = visibility * (1 - smoothT) + nextVisibility * smoothT;
  }

  return visibility;
}

/**
 * Generate stripe boundaries for each lane
 * Creates discrete S-shaped regions for each stripe
 * @private
 */
function generateStripeBoundaries(centerlineWithPhase, stripeCount, occlusionMode, minOcclusion) {
  const stripeBoundaries = [];
  const laneWidth = 1.0 / stripeCount; // Each lane is 1/N of total width

  for (let lane = 0; lane < stripeCount; lane++) {
    const laneOffset = lane / stripeCount;
    const segments = []; // Array of discrete stripe segments
    let currentSegment = null;

    for (let i = 0; i < centerlineWithPhase.length; i++) {
      const sample = centerlineWithPhase[i];

      // Calculate phase for this stripe
      const phase = sample.accumulatedTwist + laneOffset;
      const extension = calculateExtension(phase, occlusionMode, minOcclusion);

      // Check if stripe is visible at this position
      const isVisible = extension > 0.01;

      if (isVisible) {
        // Calculate lane boundaries (discrete lanes, not overlapping)
        // Lane occupies a fixed fraction of the total ribbon width
        const laneStart = lane * laneWidth; // 0.0 to 1.0 (fraction of total width)
        const laneEnd = (lane + 1) * laneWidth;

        // Convert to actual distances from centerline
        const halfWidth = sample.localWidth / 2;
        const leftEdge = -halfWidth + (laneStart * sample.localWidth);
        const rightEdge = -halfWidth + (laneEnd * sample.localWidth);

        // Apply extension (occlusion) to shrink stripe within its lane
        // When extension = 1.0, stripe fills entire lane
        // When extension = 0.0, stripe pinches to nothing
        const laneCenter = (leftEdge + rightEdge) / 2;
        const laneHalfWidth = (rightEdge - leftEdge) / 2;
        const shrunkLeftEdge = laneCenter - (laneHalfWidth * extension);
        const shrunkRightEdge = laneCenter + (laneHalfWidth * extension);

        // Calculate actual positions
        const leftPoint = {
          x: sample.x + sample.nx * shrunkLeftEdge,
          y: sample.y + sample.ny * shrunkLeftEdge
        };
        const rightPoint = {
          x: sample.x + sample.nx * shrunkRightEdge,
          y: sample.y + sample.ny * shrunkRightEdge
        };

        // Start new segment if needed
        if (!currentSegment) {
          currentSegment = {
            leftEdge: [],
            rightEdge: []
          };
        }

        currentSegment.leftEdge.push(leftPoint);
        currentSegment.rightEdge.push(rightPoint);
      } else {
        // Stripe is not visible - end current segment if exists
        if (currentSegment && currentSegment.leftEdge.length > 0) {
          segments.push(currentSegment);
          currentSegment = null;
        }
      }
    }

    // Push final segment if exists
    if (currentSegment && currentSegment.leftEdge.length > 0) {
      segments.push(currentSegment);
    }

    stripeBoundaries.push({ lane, segments });
  }

  return stripeBoundaries;
}

/**
 * Fill stripe boundaries with parallel lines
 * @private
 */
function fillStripeBoundaries(stripeBoundaries, baseOffset, noise, seed) {
  const allPaths = [];

  for (const stripe of stripeBoundaries) {
    // Process each discrete segment
    for (const segment of stripe.segments) {
      if (segment.leftEdge.length < 2) continue; // Need at least 2 points

      // Create a closed polygon from the segment boundaries
      // Left edge forward, right edge backward
      const polygonPoints = [
        ...segment.leftEdge,
        ...segment.rightEdge.slice().reverse()
      ];

      // Convert to path string (closed polygon)
      if (polygonPoints.length > 0) {
        let pathData = `M ${polygonPoints[0].x} ${polygonPoints[0].y}`;
        for (let i = 1; i < polygonPoints.length; i++) {
          pathData += ` L ${polygonPoints[i].x} ${polygonPoints[i].y}`;
        }
        pathData += ' Z'; // Close the path

        // For now, just add the outline of the stripe region
        // TODO: Fill with parallel lines at baseOffset spacing
        allPaths.push(pathData);

        // Also fill the interior with simple cross-strokes
        // Draw lines connecting left edge to right edge at regular intervals
        const numFillLines = Math.max(2, Math.floor(segment.leftEdge.length / 3));
        for (let i = 0; i < numFillLines; i++) {
          const t = i / (numFillLines - 1);
          const idx = Math.floor(t * (segment.leftEdge.length - 1));
          const leftPt = segment.leftEdge[idx];
          const rightPt = segment.rightEdge[idx];

          const fillLine = `M ${leftPt.x} ${leftPt.y} L ${rightPt.x} ${rightPt.y}`;
          allPaths.push(fillLine);
        }
      }
    }
  }

  return allPaths;
}

/**
 * Generate smooth barber pole fill with perpendicular stripes
 * Creates stripe bands that cross perpendicular to the path, like painted rings around a cylinder
 * As you move along the path, the "cylinder" rotates, creating alternating stripe-gap-stripe pattern
 * @param {string} pathData - SVG path data string
 * @param {Object} options - Configuration options
 * @param {number} options.stripeCount - Number of stripe regions around the virtual cylinder (default: 3)
 * @param {number} options.twistFrequency - Rotation rate of the cylinder (default: 0.2)
 * @param {string} options.twistRateMode - 'constant', 'inverse', or 'proportional' (default: 'inverse')
 * @param {string} options.occlusionMode - Not used in perpendicular mode (reserved for future)
 * @param {number} options.edgeSoftness - Stripe edge smoothness 0-1 (default: 0.15)
 * @param {number} options.baseOffset - Not used in perpendicular mode (reserved for future)
 * @param {string} options.envelope - Envelope preset name to control path width (default: 'flat')
 * @param {number} options.maxWidth - Maximum path width in mm (default: 3.0)
 * @param {number} options.minWidth - Minimum path width in mm (default: 0.0)
 * @param {number} options.sampleRate - Sample interval in mm (default: 0.5)
 * @param {string} options.pathId - Optional path identifier
 * @returns {Array<string>} Array of path data strings for perpendicular stripe bands
 */
function generateBarberPoleSmooth(pathData, options = {}) {
  const {
    stripeCount = 3,             // UNUSED - kept for API compatibility
    twistFrequency = 0.2,
    twistRateMode = 'inverse',
    occlusionMode = 'smooth',    // 'smooth' | 'hard' | 'none' | 'braid'
    edgeSoftness = 0.15,
    baseOffset = 0.25,
    envelope = 'flat',
    maxWidth = 3.0,
    minWidth = 0.0,
    sampleRate = 0.5,
    pathId = '',
    stripeHeight = null,         // mm - perpendicular thickness of stripe band (if null, auto-scale with path length)
    stripeGapRatio = 1.0,        // ratio of gap width to stripe width
    lineSpacing = 0.3,           // mm - spacing between lines within stripe (perpendicular)
    stripeTaperEdgeSharpness = 1.0,  // 0.1-5.0 - controls pointiness at stripe edges (1.0=default, higher=sharper pinch)
    stripeTaperMiddleAngle = 1.0,    // 0.1-3.0 - controls diagonal slope in middle (1.0=default, higher=steeper angle)
    showGapOutlines = false,     // whether to draw boundary lines at gap edges
    gapPhaseOffset = 0,          // -1.0 to 1.0 - phase offset for gap stripes (adjusts where gap stripes start relative to main stripes)
    stripeRotation = 0,          // degrees - rotation of stripe pattern around path normal (-10 to +10)
    tipAngle = 0,                // degrees - rotation of stripe tips relative to stripe flow (-15 to +15)
    // NEW: Multi-strand braid and profile parameters
    braidVariant = 'two-strand', // 'two-strand' | 'three-strand' - number of stripe families
    profile = 'sigmoid',         // 'sigmoid' | 'flat-candy' | 'cylindrical' - stripe shape profile
    braidTightness = 1.0,        // 0.0-1.0 - controls stripe overlap/interlocking (0=no overlap, 1=full interlock)
    braidOcclusionThreshold = 0.0, // 0.0-0.5 - visibility threshold for braid occlusion mode
    visibleFamilies = null,      // [1,2,3] - which families to render (null = auto-set based on braidVariant)
  } = options;

  try {
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return [];
    }

    // Get envelope function
    const envelopeFn = getEnvelopePreset(envelope);

    // Use finer sample rate for smooth curves (barber pole needs dense sampling)
    // User's sampleRate might be coarse (2mm+), but we need ~0.5mm for smooth sigmoids
    const effectiveSampleRate = Math.min(sampleRate, 0.5);

    // Sample path with twist phase accumulation
    const centerlineWithPhase = samplePathWithTwist(
      absolutePath,
      totalLength,
      envelopeFn,
      pathId,
      maxWidth,
      minWidth,
      twistFrequency,
      twistRateMode,
      effectiveSampleRate
    );

    if (centerlineWithPhase.length === 0) {
      return [];
    }

    // Auto-scale stripe height based on path length if not specified
    // Short paths (< 50mm): 2-3mm stripes
    // Medium paths (50-200mm): 3-6mm stripes
    // Long paths (> 200mm): 6-10mm stripes
    const effectiveStripeHeight = stripeHeight !== null
      ? stripeHeight
      : Math.max(2.0, Math.min(10.0, 2.0 + (totalLength / 50)));

    const gapHeight = effectiveStripeHeight * stripeGapRatio;

    // Calculate lines per stripe based on height and line spacing
    const linesPerStripe = Math.max(3, Math.ceil(effectiveStripeHeight / lineSpacing));
    const actualLineSpacing = effectiveStripeHeight / linesPerStripe;

    // Convert stripe/gap heights from mm to radians
    // Use average circumference for conversion
    const avgCircumference = maxWidth * Math.PI;
    const stripeWidthRadians = (effectiveStripeHeight / avgCircumference) * 2 * Math.PI;
    const gapWidthRadians = (gapHeight / avgCircumference) * 2 * Math.PI;
    const cycleWidth = stripeWidthRadians + gapWidthRadians;

    // Convert rotation angles from degrees to radians
    const stripeRotationRad = (stripeRotation * Math.PI) / 180;
    const tipAngleRad = (tipAngle * Math.PI) / 180;

    // Determine number of stripe families and their phase offsets based on braid variant
    const familyCount = braidVariant === 'three-strand' ? 3 : 2;
    const familyPhaseOffsets = [];
    for (let i = 0; i < familyCount; i++) {
      familyPhaseOffsets.push((i * cycleWidth) / familyCount);
    }

    // Auto-set visibleFamilies based on braidVariant if not specified
    const effectiveVisibleFamilies = visibleFamilies !== null
      ? visibleFamilies
      : (braidVariant === 'three-strand' ? [1, 2, 3] : [1, 2]);

    // Smooth sigmoid function for S-curve shape
    const smoothSigmoid = (x) => {
      return Math.tanh(x * 2.5);
    };

    // Storage for each family's stripe paths
    const familyPaths = [[], [], []]; // family1, family2, family3

    // Helper function to generate a single stripe family
    const generateStripeFamily = (phaseOffset, outputArray, familyIdx) => {
      for (let lineIdx = 0; lineIdx < linesPerStripe; lineIdx++) {
        const linePositionInStripe = (lineIdx - (linesPerStripe - 1) / 2) / linesPerStripe;
        let currentLineSegment = [];

        for (let i = 0; i < centerlineWithPhase.length; i++) {
          const centerPoint = centerlineWithPhase[i];
          const phase = centerPoint.accumulatedTwist + phaseOffset;
          const halfWidth = centerPoint.localWidth / 2;
          const t = centerPoint.t;
          const envelopeTaper = envelopeFn(pathId, t);

          // Normalize phase to prevent floating-point jumps
          const phaseNormalized = ((phase / cycleWidth) % 1 + 1) % 1;
          const cyclePhase = phaseNormalized * cycleWidth;

          // Calculate stripe width with overlap allowance
          // braidTightness controls how much stripes extend into gap (0=no overlap, 1=full interlock)
          // If gapPhaseOffset is set, use it as the base; otherwise use braidTightness directly
          const baseExtension = gapPhaseOffset !== 0
            ? Math.abs(gapPhaseOffset) * gapWidthRadians
            : gapWidthRadians; // Use full gap width as base when gapPhaseOffset not set
          const effectiveExtension = baseExtension * braidTightness;
          const extendedStripeWidth = stripeWidthRadians + effectiveExtension;

          // Gate: only process samples within this stripe's extended window
          // IMPORTANT: Clamp to cycleWidth to prevent cross-gap connectors
          // Even with full braid tightness, stripes must not bridge to next cycle
          const maxStripeWindow = Math.min(extendedStripeWidth, cycleWidth * 0.99);
          const inStripeWindow = cyclePhase < maxStripeWindow;

          if (inStripeWindow) {
            // Calculate stripe progress for this phase position (-1 to 1 over extended width)
            const stripeProgress = (cyclePhase / extendedStripeWidth) * 2 - 1;

            // Calculate diagonal offset AND width taper based on profile variant
            // Each profile defines its own shape geometry
            let diagonalOffset;
            let stripeWidthFactor;

            if (profile === 'sigmoid') {
              // Original sigmoid S-curve profile with configurable taper
              const smoothOffset = smoothSigmoid(stripeProgress);
              diagonalOffset = smoothOffset * halfWidth;

              // Sigmoid ribbon taper - naturally goes to zero at edges (stripeProgress = ±1)
              const scaledProgress = Math.pow(Math.abs(stripeProgress), stripeTaperMiddleAngle) * Math.sign(stripeProgress);
              stripeWidthFactor = Math.pow(Math.cos(scaledProgress * Math.PI / 2), 1.0 / stripeTaperEdgeSharpness);

            } else if (profile === 'flat-candy') {
              // Sinusoidal wrapping for flat ribbon around cylinder
              const normalizedPhase = phase / cycleWidth;
              const sineOffset = Math.sin(normalizedPhase * 2 * Math.PI);
              diagonalOffset = sineOffset * halfWidth;

              // Constant width for clean flat ribbon appearance
              stripeWidthFactor = 1.0;

            } else if (profile === 'cylindrical') {
              // Constant width band, no diagonal offset - pure visibility masking
              diagonalOffset = 0;
              stripeWidthFactor = 1.0;

            } else {
              // Fallback to sigmoid for unknown profiles
              const smoothOffset = smoothSigmoid(stripeProgress);
              diagonalOffset = smoothOffset * halfWidth;

              const scaledProgress = Math.pow(Math.abs(stripeProgress), stripeTaperMiddleAngle) * Math.sign(stripeProgress);
              stripeWidthFactor = Math.pow(Math.cos(scaledProgress * Math.PI / 2), 1.0 / stripeTaperEdgeSharpness);
            }

            // Fade threshold: break segment cleanly when taper drops below threshold
            // This prevents tiny offset artifacts at stripe edges
            const fadeThreshold = 0.02;
            let isVisible = Math.abs(stripeWidthFactor) > fadeThreshold;

            // Braid occlusion mode: creates over/under pattern for braids
            if (occlusionMode === 'braid' && isVisible) {
              let visibility;

              if (braidVariant === 'three-strand' && familyCount === 3) {
                // Three-strand braid: proper over/under weave
                // Family 0 over 1, Family 1 over 2, Family 2 over 0
                visibility = calculateThreeStrandVisibility(
                  phase,          // Already includes familyPhaseOffset
                  cycleWidth,
                  familyIdx,
                  familyCount
                );
              } else {
                // Two-strand or legacy: simple cosine visibility mask
                const normalizedPhase = (phase / cycleWidth) * 2 * Math.PI;
                const rawVisibility = Math.cos(normalizedPhase);
                visibility = (rawVisibility + 1) / 2; // Map -1..1 to 0..1
              }

              // Apply hybrid visibility weighting
              // Calculate weight after threshold (0 if below threshold)
              const visibilityWeight = Math.max(0, visibility - braidOcclusionThreshold);

              // Scale stripe width by visibility (min 5% to prevent full disappearance)
              const visibilityScale = Math.max(0.05, visibilityWeight);
              stripeWidthFactor *= visibilityScale;

              // Apply lateral shift for flat-candy profile based on visibility
              // This creates dovetail pattern by moving strands toward center as they narrow
              if (profile === 'flat-candy') {
                const normalizedPhase = phase / cycleWidth;
                const sineOffset = Math.sin(normalizedPhase * 2 * Math.PI);
                diagonalOffset = sineOffset * halfWidth * visibilityScale;
              }

              // Binary gate: cut polyline when combined weight falls near zero
              // This prevents connector lines across gaps
              isVisible = (Math.abs(stripeWidthFactor) * visibilityScale) > fadeThreshold;
            }

            if (isVisible) {

              const perpOffset = linePositionInStripe * effectiveStripeHeight;
              const ribbonTaperedOffset = perpOffset * stripeWidthFactor;
              const fullyTaperedOffset = ribbonTaperedOffset * envelopeTaper;

              // Tip angle rotation
              const tipRotationAmount = stripeProgress * tipAngleRad;
              const cosTip = Math.cos(tipRotationAmount);
              const sinTip = Math.sin(tipRotationAmount);
              const tipAdjustedPerpOffset = fullyTaperedOffset * cosTip;
              const tipAdjustedDiagOffset = diagonalOffset + fullyTaperedOffset * sinTip;

              const totalOffset = tipAdjustedDiagOffset + tipAdjustedPerpOffset;

              const point = {
                x: centerPoint.x + centerPoint.nx * totalOffset,
                y: centerPoint.y + centerPoint.ny * totalOffset
              };

              currentLineSegment.push(point);
            } else {
              // Stripe taper faded below threshold - emit current segment
              if (currentLineSegment.length > 2) {
                outputArray.push(pointsToPath(currentLineSegment));
              }
              currentLineSegment = [];
            }
          } else {
            // Outside stripe window - emit current segment and reset
            if (currentLineSegment.length > 2) {
              outputArray.push(pointsToPath(currentLineSegment));
            }
            currentLineSegment = [];
          }
        }

        // Emit final segment
        if (currentLineSegment.length > 2) {
          outputArray.push(pointsToPath(currentLineSegment));
        }
      }
    };

    // Generate all stripe families based on braid variant
    // Loop through each family and generate stripes with appropriate phase offset
    for (let familyIdx = 0; familyIdx < familyCount; familyIdx++) {
      const familyNumber = familyIdx + 1; // 1-indexed for visibility check

      // Only generate if this family is visible
      if (effectiveVisibleFamilies.includes(familyNumber)) {
        const phaseOffset = familyPhaseOffsets[familyIdx];
        generateStripeFamily(phaseOffset, familyPaths[familyIdx], familyIdx);
      }
    }

    // Return paths with metadata for styling
    // Always return structured format when we generated multiple families
    // This ensures two-strand mode doesn't lose the second family

    // For two-strand: always return both families if second family has content
    // For three-strand: always return all three families
    // For single-family (if visibleFamilies = [1] only): return just array for backward compat

    const hasSecondFamily = familyPaths[1].length > 0;
    const hasThirdFamily = familyPaths[2].length > 0;

    if (hasSecondFamily || hasThirdFamily) {
      return {
        stripes: familyPaths[0],        // Family 1 (black)
        gapOutlines: familyPaths[1],    // Family 2 (red)
        family3: familyPaths[2]          // Family 3 (blue/green) - new
      };
    }

    // Backward compatibility: just return family 1 paths if only one family generated
    return familyPaths[0];

  } catch (error) {
    console.error('Error generating smooth barber pole:', error);
    return [];
  }
}

/**
 * Normalize angle to 0-2π range
 * @private
 */
function normalizeAngle(angle) {
  const twoPi = 2 * Math.PI;
  return ((angle % twoPi) + twoPi) % twoPi;
}

/**
 * Create a filled band from two edge curves
 * @private
 */
function createBandFromEdges(edge1, edge2) {
  if (edge1.length < 2 || edge2.length < 2) {
    return null;
  }

  // Create a filled polygon by connecting:
  // - Edge 1: all points from first to last
  // - Edge 2: all points from last to first (reversed)

  let pathData = `M ${edge1[0].x.toFixed(3)},${edge1[0].y.toFixed(3)}`;

  // Edge 1 forward
  for (let i = 1; i < edge1.length; i++) {
    pathData += ` L ${edge1[i].x.toFixed(3)},${edge1[i].y.toFixed(3)}`;
  }

  // Connect to edge 2
  if (edge2.length > 0) {
    pathData += ` L ${edge2[edge2.length - 1].x.toFixed(3)},${edge2[edge2.length - 1].y.toFixed(3)}`;
  }

  // Edge 2 backward
  for (let i = edge2.length - 2; i >= 0; i--) {
    pathData += ` L ${edge2[i].x.toFixed(3)},${edge2[i].y.toFixed(3)}`;
  }

  // Close path
  pathData += ' Z';

  return pathData;
}

/**
 * Convert array of points to stroke SVG path (no fill)
 * @private
 */
function pointsToPath(points) {
  if (points.length < 2) return '';

  let pathData = `M ${points[0].x.toFixed(3)},${points[0].y.toFixed(3)}`;

  for (let i = 1; i < points.length; i++) {
    pathData += ` L ${points[i].x.toFixed(3)},${points[i].y.toFixed(3)}`;
  }

  return pathData;
}

/**
 * Alias for pointsToPath
 * @private
 */
function pointsToSmoothPath(points) {
  return pointsToPath(points);
}

/**
 * Main barber pole generator - delegates to smooth or pixelated based on style
 */
function generateBarberPoleFill(pathData, options = {}) {
  const { barberPoleStyle = 'smooth', ...rest } = options;

  if (barberPoleStyle === 'pixelated') {
    return generateBarberPolePixelated(pathData, rest);
  } else {
    return generateBarberPoleSmooth(pathData, rest);
  }
}

/**
 * Generate a continuous curly/spring fill that loops along the path
 * Creates a telephone-cord or spring-like pattern following the centerline
 *
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>} Array of SVG path data strings (one per strand)
 */
function generateCurlyFill(pathData, options = {}) {
  const {
    loopFrequency = 1.0,      // loops per 10mm
    loopAmplitude = 1.0,      // multiplier of envelope width (0.5 = 50%, 1.0 = 100%)
    overlap = 0.3,            // 0-1, controls loop density/overlap (unused for now)
    minWidthThreshold = 0.5,  // mm - below this width, render as centerline
    loopStyle = 'circular',   // 'circular' or 'elliptical' (future)
    strands = 1,              // number of parallel spring strands
    strandPhaseOffset = 0.5,  // 0-1, phase offset between strands
    baseOffset = 0.25,
    envelope = 'flat',
    maxWidth = 3.0,
    minWidth = 0.0,
    sampleRate = 0.5,         // mm between sample points
    noise = 0,
    seed = null,
    pathId = 'path',
    leanMode = 'none',        // 'none', 'inside', 'outside' - lean into/out of turns
    leanStrength = 0.5,       // 0-1, how much to lean
    dynamicModulation = 0,    // 0-1, amplitude/phase variation along path
    slantAngle = 0            // degrees, constant forward/backward tilt (works on straight lines)
  } = options;

  const paths = [];

  try {
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return paths;
    }

    // Get envelope function
    const envelopeFn = getEnvelopePreset(envelope);

    // Sample path to get centerline points with normals
    const centerline = [];

    for (let dist = 0; dist <= totalLength; dist += sampleRate) {
      const point = getPointAtLength(absolutePath, dist);

      if (!point || isNaN(point.x) || isNaN(point.y)) {
        break;
      }

      // Calculate tangent using centered, larger delta for stability
      const delta = Math.min(sampleRate, totalLength * 0.01);
      const prevDist = Math.max(0, dist - delta);
      const nextDist = Math.min(totalLength, dist + delta);
      const prevPt = getPointAtLength(absolutePath, prevDist);
      const nextPt = getPointAtLength(absolutePath, nextDist);

      if (prevPt && nextPt && !isNaN(prevPt.x) && !isNaN(nextPt.x)) {
        const dx = nextPt.x - prevPt.x;
        const dy = nextPt.y - prevPt.y;
        const len = Math.hypot(dx, dy);

        if (len > 1e-6) {
          // Tangent is along the path direction
          point.tx = dx / len;
          point.ty = dy / len;
          // Normal is perpendicular to tangent
          point.nx = -dy / len;
          point.ny = dx / len;
        } else {
          // Keep previous tangent if available
          const prev = centerline[centerline.length - 1];
          point.tx = prev?.tx ?? 1;
          point.ty = prev?.ty ?? 0;
          point.nx = prev?.nx ?? 0;
          point.ny = prev?.ny ?? 1;
        }
      } else {
        const prev = centerline[centerline.length - 1];
        point.tx = prev?.tx ?? 1;
        point.ty = prev?.ty ?? 0;
        point.nx = prev?.nx ?? 0;
        point.ny = prev?.ny ?? 1;
      }

      // Calculate turn signal using wider window for meaningful curvature
      // Per-sample angles are tiny (<1°), so we look 5-10mm ahead/behind
      const turnWindow = Math.max(5, sampleRate * 8);  // mm
      const turnPrevDist = Math.max(0, dist - turnWindow);
      const turnNextDist = Math.min(totalLength, dist + turnWindow);
      const turnPrevPt = getPointAtLength(absolutePath, turnPrevDist);
      const turnNextPt = getPointAtLength(absolutePath, turnNextDist);

      if (turnPrevPt && turnNextPt) {
        const turnDx = turnNextPt.x - turnPrevPt.x;
        const turnDy = turnNextPt.y - turnPrevPt.y;
        const turnLen = Math.hypot(turnDx, turnDy);

        const windowTx = turnLen > 1e-6 ? turnDx / turnLen : point.tx;
        const windowTy = turnLen > 1e-6 ? turnDy / turnLen : point.ty;

        // Compare against previous point's tangent
        const prevPoint = centerline[centerline.length - 1];
        if (prevPoint?.tx !== undefined) {
          const cross = prevPoint.tx * windowTy - prevPoint.ty * windowTx;
          const dot = prevPoint.tx * windowTx + prevPoint.ty * windowTy;
          const angle = Math.atan2(cross, dot);
          point.turn = Math.sign(angle) * Math.min(1, Math.abs(angle) / 0.1);  // 0.1 rad ~ 6°
        } else {
          point.turn = 0;
        }
      } else {
        point.turn = 0;
      }

      // Calculate envelope width at this position
      const t = dist / totalLength;
      const envelopeMultiplier = envelopeFn(pathId, t);
      point.localWidth = minWidth + envelopeMultiplier * (maxWidth - minWidth);
      point.distance = dist;

      centerline.push(point);
    }

    if (centerline.length < 2) {
      return paths;
    }

    // Generate curly paths (one per strand)
    for (let strandIdx = 0; strandIdx < strands; strandIdx++) {
      const strandPhase = strandIdx * strandPhaseOffset * Math.PI * 2;
      const curlyPoints = [];

      for (let i = 0; i < centerline.length; i++) {
        const point = centerline[i];
        const width = point.localWidth;
        const dist = point.distance;

        // If width is below threshold, follow centerline
        if (width < minWidthThreshold) {
          curlyPoints.push({
            x: point.x,
            y: point.y
          });
          continue;
        }

        // Calculate loop phase based on distance traveled
        // loopFrequency is loops per 10mm, so divide by 10 to get loops per mm
        const loopsPerMm = loopFrequency / 10;
        const basePhase = (dist * loopsPerMm * Math.PI * 2) + strandPhase;

        // Dynamic modulation - adds organic variation to amplitude and phase
        let ampMod = 1.0;
        let phaseMod = 0;
        if (dynamicModulation > 0) {
          const modulationScale = 30;  // mm wavelength of modulation
          const noiseSeed = seed !== null ? seed : pathId.length;
          const mod = simpleNoise(dist / modulationScale, noiseSeed + 500);
          ampMod = 1 + dynamicModulation * 0.5 * mod;    // +/- 50% at full strength
          phaseMod = dynamicModulation * 0.6 * mod;      // +/- 0.6 radians
        }

        const phase = basePhase + phaseMod;

        // Calculate loop offset using circular motion (sin + cos)
        // This creates actual loop-de-loops instead of just wiggling
        const loopRadius = width * loopAmplitude * 0.5 * ampMod;
        const normalOffset = Math.sin(phase) * loopRadius;
        const tangentScale = loopStyle === 'elliptical' ? 0.6 : 1.0;

        // Slant: shear tangent by normal for constant tilt (works on straight lines)
        const slant = Math.tan((slantAngle * Math.PI) / 180);
        const tangentOffset = Math.cos(phase) * loopRadius * tangentScale + slant * normalOffset;

        // Lean bias - shifts curls toward inside/outside of turns
        // Scales with loopRadius so lean is proportional to curl size
        let leanBias = 0;
        if (leanMode !== 'none' && leanStrength > 0) {
          const leanDir = leanMode === 'inside' ? 1 : -1;
          leanBias = leanStrength * loopRadius * leanDir * (point.turn || 0);
        }

        // Apply offset in both normal and tangent directions
        const x = point.x + point.nx * (normalOffset + leanBias) + point.tx * tangentOffset;
        const y = point.y + point.ny * (normalOffset + leanBias) + point.ty * tangentOffset;

        // Add noise if specified
        let noiseOffsetX = 0;
        let noiseOffsetY = 0;
        if (noise > 0) {
          const noiseSeed = seed !== null ? seed : pathId.length;
          noiseOffsetX = simpleNoise(dist / 10 + strandIdx * 100, noiseSeed) * noise;
          noiseOffsetY = simpleNoise(dist / 10 + 1000 + strandIdx * 100, noiseSeed + 1) * noise;
        }

        curlyPoints.push({
          x: x + noiseOffsetX,
          y: y + noiseOffsetY
        });
      }

      // Convert points to SVG path
      if (curlyPoints.length > 1) {
        paths.push(pointsToPath(curlyPoints));
      }
    }

  } catch (error) {
    console.error(`Error generating curly fill for path ${pathId}:`, error);
  }

  return paths;
}

/**
 * Generate phase-locked moiré fill pattern
 * Creates two (or more) nearly-parallel stroke families whose phase stays aligned
 * along the path so the interference bands are stable, not chaotic.
 *
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Object} { familyA: Array<string>, familyB: Array<string> } - Two arrays of SVG path data strings
 */
function generateMoireFill(pathData, options = {}) {
  const {
    // Core moiré parameters
    moireMode = 'spacing',       // 'spacing' (classic moiré) or 'phase' (phase drift)
    spacingA = 1.0,              // mm - spacing for family A
    spacingDelta = 0.02,         // ratio - spacing difference for family B (0.02 = 2%)
    phaseDriftWavelength = 80,   // mm - wavelength of phase drift oscillation
    phaseDriftAmplitude = 0.2,   // mm - amplitude of phase drift
    families = 2,                // number of stripe families (2 or 3)
    passesPerFamily = 5,         // number of parallel strokes per family per side
    familyOffset = 0.5,          // mm - perpendicular offset between families (0 = overlapping)
    // Standard envelope/geometry parameters
    baseOffset = 0.25,
    envelope = 'flat',
    maxWidth = 3.0,
    minWidth = 0.0,
    sampleRate = 0.5,            // mm between sample points
    noise = 0,
    seed = null,
    pathId = 'path',
    // Optional sampling drift (alternative phase lock trick)
    samplingDrift = false,       // use sampling origin drift instead of offset drift
    samplingDriftWavelength = 100, // mm
    samplingDriftAmplitude = 0.5,  // mm
  } = options;

  const familyA = [];
  const familyB = [];
  const familyC = [];

  try {
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return { familyA, familyB, familyC };
    }

    // Get envelope function
    const envelopeFn = getEnvelopePreset(envelope);

    // Calculate spacings for each family
    const spacingB = moireMode === 'spacing'
      ? spacingA * (1 + spacingDelta)  // Classic moiré: slight spacing difference
      : spacingA;                       // Phase mode: same spacing

    const spacingC = families >= 3
      ? spacingA * (1 + spacingDelta * 2)  // Third family with 2x delta
      : spacingA;

    // Sample centerline with normals
    function sampleCenterline(sOffset = 0) {
      const centerline = [];

      for (let dist = 0; dist <= totalLength; dist += sampleRate) {
        // Apply sampling drift if enabled
        let effectiveDist = dist;
        if (samplingDrift && sOffset !== 0) {
          const driftPhase = (2 * Math.PI * dist) / samplingDriftWavelength;
          effectiveDist = dist + sOffset * samplingDriftAmplitude * Math.sin(driftPhase);
          effectiveDist = Math.max(0, Math.min(totalLength, effectiveDist));
        }

        const point = getPointAtLength(absolutePath, effectiveDist);

        if (!point || isNaN(point.x) || isNaN(point.y)) {
          break;
        }

        // Calculate tangent using centered delta
        const delta = Math.min(sampleRate, totalLength * 0.01);
        const prevDist = Math.max(0, effectiveDist - delta);
        const nextDist = Math.min(totalLength, effectiveDist + delta);
        const prevPt = getPointAtLength(absolutePath, prevDist);
        const nextPt = getPointAtLength(absolutePath, nextDist);

        if (prevPt && nextPt && !isNaN(prevPt.x) && !isNaN(nextPt.x)) {
          const dx = nextPt.x - prevPt.x;
          const dy = nextPt.y - prevPt.y;
          const len = Math.hypot(dx, dy);

          if (len > 1e-6) {
            point.tx = dx / len;
            point.ty = dy / len;
            point.nx = -dy / len;
            point.ny = dx / len;
          } else {
            const prev = centerline[centerline.length - 1];
            point.tx = prev?.tx ?? 1;
            point.ty = prev?.ty ?? 0;
            point.nx = prev?.nx ?? 0;
            point.ny = prev?.ny ?? 1;
          }
        } else {
          const prev = centerline[centerline.length - 1];
          point.tx = prev?.tx ?? 1;
          point.ty = prev?.ty ?? 0;
          point.nx = prev?.nx ?? 0;
          point.ny = prev?.ny ?? 1;
        }

        // Calculate envelope width at this position
        const t = dist / totalLength;
        const envelopeMultiplier = envelopeFn(pathId, t);
        point.localWidth = minWidth + envelopeMultiplier * (maxWidth - minWidth);
        point.distance = dist;

        centerline.push(point);
      }

      return centerline;
    }

    // Generate offset paths for a family
    function generateFamilyPaths(centerline, spacing, phaseOffset = 0, familyIndex = 0) {
      const paths = [];

      // Calculate base offset for this family (to separate families perpendicular to path)
      // Family A: no offset, Family B: +familyOffset, Family C: -familyOffset
      const familyBaseOffset = familyIndex === 0 ? 0 :
                               familyIndex === 1 ? familyOffset :
                               -familyOffset;

      // Generate passes on both sides of centerline
      for (let k = -passesPerFamily; k <= passesPerFamily; k++) {
        if (k === 0) continue; // Skip centerline itself

        const offsetPoints = [];

        for (let i = 0; i < centerline.length; i++) {
          const point = centerline[i];
          const dist = point.distance;

          // Calculate offset distance (add family base offset to separate families)
          let offsetDist = k * spacing + familyBaseOffset;

          // Apply phase drift in phase mode
          if (moireMode === 'phase' && familyIndex > 0) {
            const driftPhase = (2 * Math.PI * dist) / phaseDriftWavelength;
            const phaseDrift = phaseDriftAmplitude * Math.sin(driftPhase + phaseOffset);
            offsetDist += phaseDrift;
          }

          // Scale by envelope (keep strokes within envelope bounds)
          const halfWidth = point.localWidth / 2;
          const envelopeScale = halfWidth / (passesPerFamily * spacing);
          if (envelopeScale < 1) {
            offsetDist *= envelopeScale;
          }

          // Clamp to envelope bounds
          offsetDist = Math.max(-halfWidth, Math.min(halfWidth, offsetDist));

          // Apply offset along normal
          let x = point.x + point.nx * offsetDist;
          let y = point.y + point.ny * offsetDist;

          // Add noise if specified
          if (noise > 0) {
            const noiseSeed = seed !== null ? seed : pathId.length;
            const noiseX = simpleNoise(dist / 10 + k * 50 + familyIndex * 200, noiseSeed) * noise;
            const noiseY = simpleNoise(dist / 10 + 1000 + k * 50 + familyIndex * 200, noiseSeed + 1) * noise;
            x += noiseX;
            y += noiseY;
          }

          offsetPoints.push({ x, y });
        }

        // Convert to SVG path
        if (offsetPoints.length > 1) {
          paths.push(pointsToPath(offsetPoints));
        }
      }

      return paths;
    }

    // Generate family A (reference family, no drift)
    const centerlineA = sampleCenterline(0);
    if (centerlineA.length >= 2) {
      familyA.push(...generateFamilyPaths(centerlineA, spacingA, 0, 0));
    }

    // Generate family B (with spacing difference or phase drift)
    if (samplingDrift) {
      // Use sampling drift: sample from different origin
      const centerlineB = sampleCenterline(1);  // Offset multiplier
      if (centerlineB.length >= 2) {
        familyB.push(...generateFamilyPaths(centerlineB, spacingB, Math.PI / 4, 1));
      }
    } else {
      // Use same centerline, different spacing/phase
      if (centerlineA.length >= 2) {
        familyB.push(...generateFamilyPaths(centerlineA, spacingB, Math.PI / 4, 1));
      }
    }

    // Generate family C if 3 families requested
    if (families >= 3) {
      if (samplingDrift) {
        const centerlineC = sampleCenterline(2);  // Larger offset multiplier
        if (centerlineC.length >= 2) {
          familyC.push(...generateFamilyPaths(centerlineC, spacingC, Math.PI / 2, 2));
        }
      } else {
        if (centerlineA.length >= 2) {
          familyC.push(...generateFamilyPaths(centerlineA, spacingC, Math.PI / 2, 2));
        }
      }
    }

  } catch (error) {
    console.error(`Error generating moiré fill for path ${pathId}:`, error);
  }

  return { familyA, familyB, familyC };
}

export {
  measurePathLength,
  samplePathPoints,
  offsetPath,
  generatePasses,
  lengthToWeight,
  getEnvelopePreset,
  EnvelopePresets,
  generateCrosshatchFill,
  generateStipplingFill,
  generateHatchGradientFill,
  generateCirclePath,
  generateFilledCircle,
  generateShapeFill,
  generateBarberPoleFill,
  generateBarberPolePixelated,
  generateBarberPoleSmooth,
  generateCurlyFill,
  generateMoireFill,
};
