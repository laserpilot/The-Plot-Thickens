/**
 * Stippling fill mode
 * Creates dot-based patterns
 */

import { generateStipplingFill } from '../geometry/path-utils.js';

/**
 * Default options for stippling fill mode
 */
export const defaults = {
  stipplingDensity: 1.0,          // dots per square mm
  stipplingMinSize: 0.1,          // mm - minimum dot size
  stipplingMaxSize: 0.5,          // mm - maximum dot size
  stipplingRandomness: 0.5,       // 0-1 - position randomness
};

/**
 * Generate stippling fill pattern
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>} Array of SVG path data strings (circles)
 */
export function generate(pathData, options = {}) {
  return generateStipplingFill(pathData, {
    ...defaults,
    ...options,
  });
}

export const schema = {
  stipplingDensity: { type: 'number', min: 0.1, max: 10, step: 0.1, label: 'Density', unit: 'dots/mm²' },
  stipplingMinSize: { type: 'number', min: 0.05, max: 1, step: 0.05, label: 'Min Size', unit: 'mm' },
  stipplingMaxSize: { type: 'number', min: 0.1, max: 2, step: 0.1, label: 'Max Size', unit: 'mm' },
  stipplingRandomness: { type: 'number', min: 0, max: 1, step: 0.1, label: 'Randomness' },
};
