/**
 * Shared helper functions for fill modes
 * Re-exports core path utilities that fill generators need
 */

// Re-export from path-utils for fill modules to use
export {
  pathToAbsolute,
  getTotalLength,
  getPointAtLength,
  getEnvelopePreset,
  simpleNoise,
  pointsToPath,
} from '../geometry/path-utils.js';
