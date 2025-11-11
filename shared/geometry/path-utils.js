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
 * @returns {Array<string>|Object} Array of path strings, or {fills: Array, outlines: Array} if extractOutline=true
 */
function generatePasses(pathData, passes, baseOffset, noise, seed = null, pathId = '', offsetEnvelope = null, useNormalMode = false, noiseFrequency = 50, sampleRate = 2, fillMode = 'offset', crosshatchOptions = null, extractOutline = false, stripeFilled = 1, stripeEmpty = 1) {
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
  let leftOutline = null;
  let rightOutline = null;

  // If outlines requested, generate outermost offset paths separately
  // This ensures they're always present regardless of stripe pattern
  if (extractOutline && passes > 0) {
    // Generate right outline (furthest right)
    const rightPassIndex = Math.floor((passes - 1) / 2);
    const rightDistance = rightPassIndex * baseOffset;
    rightOutline = offsetPath(pathData, rightDistance, noise, seed + passes, pathId, offsetEnvelope, useNormalMode, noiseFrequency, sampleRate);

    // Generate left outline (furthest left) if we have multiple passes
    if (passes > 1) {
      const leftPassIndex = Math.floor((passes - 2) / 2) + 1;
      const leftDistance = -leftPassIndex * baseOffset;
      leftOutline = offsetPath(pathData, leftDistance, noise, seed + passes + 1, pathId, offsetEnvelope, useNormalMode, noiseFrequency, sampleRate);
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
      accumulatedTwist,
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
 * Generate smooth sigmoid barber pole fill
 * Creates continuous flowing stripe curves that spiral around the path
 * @param {string} pathData - SVG path data string
 * @param {Object} options - Configuration options
 * @param {number} options.stripeCount - Number of stripes (default: 3)
 * @param {number} options.twistFrequency - Twist rate (default: 0.2)
 * @param {string} options.twistRateMode - 'constant', 'inverse', or 'proportional' (default: 'inverse')
 * @param {string} options.occlusionMode - 'none', 'hard', or 'smooth' (default: 'smooth')
 * @param {number} options.edgeSoftness - Stripe edge smoothness 0-1 (default: 0.15)
 * @param {number} options.baseOffset - Base offset distance in mm (default: 0.25)
 * @param {string} options.envelope - Envelope preset name (default: 'flat')
 * @param {number} options.maxWidth - Maximum envelope width in mm (default: 3.0)
 * @param {number} options.minWidth - Minimum envelope width in mm (default: 0.0)
 * @param {number} options.sampleRate - Sample interval in mm (default: 0.5)
 * @param {string} options.pathId - Optional path identifier
 * @returns {Array<string>} Array of path data strings for stripe curves
 */
function generateBarberPoleSmooth(pathData, options = {}) {
  const {
    stripeCount = 3,
    twistFrequency = 0.2,
    twistRateMode = 'inverse',
    occlusionMode = 'smooth',
    edgeSoftness = 0.15,
    baseOffset = 0.25,
    envelope = 'flat',
    maxWidth = 3.0,
    minWidth = 0.0,
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
      sampleRate
    );

    if (centerlineWithPhase.length === 0) {
      return [];
    }

    // Generate smooth stripe curves
    const stripePaths = [];

    for (let stripeIdx = 0; stripeIdx < stripeCount * 2; stripeIdx++) {
      // Generate both sides of each stripe (positive and negative offset)
      const side = stripeIdx % 2 === 0 ? 1 : -1;
      const actualStripeIdx = Math.floor(stripeIdx / 2);

      const stripePath = generateSmoothStripeCurve(
        centerlineWithPhase,
        actualStripeIdx,
        side,
        {
          stripeCount,
          occlusionMode,
          edgeSoftness,
          baseOffset
        }
      );

      if (stripePath) {
        stripePaths.push(stripePath);
      }
    }

    return stripePaths;

  } catch (error) {
    console.warn('Failed to generate smooth barber pole fill:', error.message);
    return [];
  }
}

/**
 * Generate a single smooth stripe curve
 * @private
 */
function generateSmoothStripeCurve(centerlinePoints, stripeIndex, side, options) {
  const { stripeCount, occlusionMode, edgeSoftness, baseOffset } = options;
  const points = [];
  let hasVisibleSegments = false;

  for (let i = 0; i < centerlinePoints.length; i++) {
    const centerPoint = centerlinePoints[i];

    // Calculate stripe offset distance at this point
    const offsetDist = calculateStripeOffset(
      centerPoint.phase,
      stripeIndex,
      side,
      stripeCount,
      centerPoint.width,
      occlusionMode,
      edgeSoftness,
      baseOffset
    );

    if (offsetDist === null || Math.abs(offsetDist) < 0.01) {
      // Stripe not visible here - continue to create gaps
      if (points.length > 2) {
        // We have a segment, but it's ending - could break into multiple paths
        // For now, continue to allow gaps in stripes
      }
      continue;
    }

    hasVisibleSegments = true;

    // Offset perpendicular to path
    const offsetPoint = {
      x: centerPoint.x + centerPoint.nx * offsetDist,
      y: centerPoint.y + centerPoint.ny * offsetDist
    };

    points.push(offsetPoint);
  }

  if (!hasVisibleSegments || points.length < 2) {
    return null;
  }

  // Convert points to SVG path
  return pointsToSmoothPath(points);
}

/**
 * Calculate stripe offset distance using sigmoid modulation
 * @private
 */
function calculateStripeOffset(phase, stripeIndex, side, stripeCount, envelopeWidth, occlusionMode, edgeSoftness, baseOffset) {
  // Normalize phase to 0-2π
  const normalizedPhase = phase % (2 * Math.PI);

  // Calculate which stripe region we're in
  // Each full rotation divided into stripeCount regions
  const stripePhaseOffset = (stripeIndex / stripeCount) * 2 * Math.PI;
  const localPhase = (normalizedPhase + stripePhaseOffset) % (2 * Math.PI);

  // Determine stripe region (0 to stripeCount-1)
  const regionSize = (2 * Math.PI) / stripeCount;
  const regionIndex = Math.floor(localPhase / regionSize);

  // Only draw every other stripe (alternating filled/empty)
  if (regionIndex % 2 !== 0) {
    return null; // Empty stripe region
  }

  // Position within this stripe region (0-1)
  const regionPhase = (localPhase % regionSize) / regionSize;

  // Apply sigmoid smoothing at edges
  let alpha = 1.0;

  if (edgeSoftness > 0) {
    if (regionPhase < edgeSoftness) {
      // Smooth fade-in at start of stripe
      alpha = smoothstep(0, edgeSoftness, regionPhase);
    } else if (regionPhase > 1 - edgeSoftness) {
      // Smooth fade-out at end of stripe
      alpha = smoothstep(1, 1 - edgeSoftness, regionPhase);
    }
  }

  // Calculate occlusion factor
  const occlusionFactor = calculateOcclusionFactor(normalizedPhase, occlusionMode);

  // Calculate final offset distance
  // Use envelope width to modulate the offset distance
  // side determines if we offset positive or negative direction
  const maxOffsetDist = envelopeWidth / 2;
  const offsetDist = side * maxOffsetDist * alpha * occlusionFactor;

  return offsetDist;
}

/**
 * Calculate occlusion factor based on phase
 * @private
 */
function calculateOcclusionFactor(phase, mode) {
  // Normalize to 0-1
  const normalizedPhase = (phase % (2 * Math.PI)) / (2 * Math.PI);

  if (mode === 'none') {
    return 1.0;
  }

  if (mode === 'hard') {
    // Back half (0.25-0.75) is fully occluded
    return (normalizedPhase < 0.25 || normalizedPhase > 0.75) ? 1.0 : 0.0;
  }

  if (mode === 'smooth') {
    // Smooth cosine falloff - visible at 0/1, hidden at 0.5
    return (Math.cos(2 * Math.PI * normalizedPhase) + 1) / 2;
  }

  return 1.0;
}

/**
 * Convert array of points to smooth SVG path
 * @private
 */
function pointsToSmoothPath(points) {
  if (points.length < 2) return '';

  let pathData = `M ${points[0].x.toFixed(3)},${points[0].y.toFixed(3)}`;

  for (let i = 1; i < points.length; i++) {
    pathData += ` L ${points[i].x.toFixed(3)},${points[i].y.toFixed(3)}`;
  }

  return pathData;
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

export {
  measurePathLength,
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
};
