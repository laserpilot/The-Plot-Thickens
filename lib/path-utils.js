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
 * Generate offset version of a path (perpendicular offset)
 * Note: This is a simplified approach. For complex paths, consider using
 * more sophisticated offsetting algorithms or libraries.
 *
 * @param {string} pathData - Original SVG path
 * @param {number} offset - Offset distance (can be negative)
 * @param {number} noise - Random noise to add (0 = no noise)
 * @returns {string} Offset path data
 */
function offsetPath(pathData, offset, noise = 0) {
  try {
    const absolutePath = pathToAbsolute(pathData);
    const normalized = normalizePath(absolutePath);

    // For simple offset, we'll apply a transform-like offset
    // This is a placeholder - real perpendicular offset is complex
    // For now, just add small random variations to each coordinate
    const pathString = pathToString(normalized);

    // Simple approach: extract coordinates and add noise
    const noiseAmount = noise > 0 ? (Math.random() - 0.5) * noise * 2 : 0;
    const offsetWithNoise = offset + noiseAmount;

    // Apply very basic offset (this is simplified - real offset needs proper normal calculation)
    const offsetPattern = /([0-9.-]+)/g;
    let coordinateIndex = 0;
    const offsetPathString = pathString.replace(offsetPattern, (match) => {
      const num = parseFloat(match);
      // Alternate between x and y offsets
      const isX = coordinateIndex % 2 === 0;
      coordinateIndex++;

      // Add small perpendicular offset
      const variation = (Math.random() - 0.5) * noise;
      return (num + (isX ? offsetWithNoise * 0.5 : offsetWithNoise * 0.5) + variation).toFixed(3);
    });

    return offsetPathString;
  } catch (error) {
    console.warn('Failed to offset path:', error.message);
    return pathData; // Return original on failure
  }
}

/**
 * Generate multiple offset passes of a path
 * @param {string} pathData - Original SVG path
 * @param {number} passes - Number of times to duplicate
 * @param {number} baseOffset - Base offset distance per pass
 * @param {number} noise - Noise amount to add
 * @returns {Array<string>} Array of path data strings
 */
function generatePasses(pathData, passes, baseOffset, noise) {
  const paths = [];

  for (let i = 0; i < passes; i++) {
    const offsetDistance = i * baseOffset * 0.1; // Small incremental offset
    const offsetPathData = offsetPath(pathData, offsetDistance, noise);
    paths.push(offsetPathData);
  }

  return paths;
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

module.exports = {
  measurePathLength,
  offsetPath,
  generatePasses,
  lengthToWeight,
};
