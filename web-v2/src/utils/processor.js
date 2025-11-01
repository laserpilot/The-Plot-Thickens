/**
 * SVG path processing using shared engine
 */

import { generatePasses, measurePathLength } from '../../../shared/geometry/path-utils.js';

/**
 * Process SVG paths with offset fills
 * @param {Array} paths - Array of path objects with {d, ...}
 * @param {Object} config - Processing configuration
 * @returns {Array} Processed paths
 */
export function processPaths(paths, config) {
  const processed = [];

  // Measure all path lengths first for relative scaling
  const lengths = paths.map(p => measurePathLength(p.d));
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const length = lengths[i];

    // Generate offset passes for this path
    const passes = generatePasses(
      path.d,
      length,
      {
        baseOffset: config.baseOffset,
        noise: config.noise,
        noiseFrequency: config.noiseFrequency,
        minPasses: config.minPasses,
        maxPasses: config.maxPasses,
        minLength,
        maxLength,
        curve: config.curve,
        sampleRate: config.sampleRate,
        offsetMode: 'normal', // Always use normal mode in v2
        envelope: 'sinTaperBoth'
      }
    );

    // Add each pass as a separate path
    passes.forEach((passData, passIndex) => {
      processed.push({
        id: `${path.id || i}-pass-${passIndex}`,
        d: passData,
        originalIndex: i,
        passIndex
      });
    });
  }

  console.log(`Processed ${paths.length} paths into ${processed.length} offset paths`);
  return processed;
}

/**
 * Get path statistics
 */
export function getPathStats(paths) {
  const lengths = paths.map(p => measurePathLength(p.d));

  return {
    count: paths.length,
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths),
    avgLength: lengths.reduce((a, b) => a + b, 0) / lengths.length,
    totalLength: lengths.reduce((a, b) => a + b, 0)
  };
}
