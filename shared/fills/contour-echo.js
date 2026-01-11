/**
 * Contour Echo fill mode
 * Creates concentric contour rings with progressive noise
 */

import { generateContourEchoFill } from '../geometry/path-utils.js';

/**
 * Default options for contour-echo fill mode
 */
export const defaults = {
  contourSpacing: 0.5,            // mm - distance between contour rings
  contourMaxPasses: 10,           // maximum number of rings (5-20)
  contourNoiseMax: 0.3,           // mm - outer ring noise (fuzzy)
  contourNoiseMin: 0.0,           // mm - inner ring noise (crisp)
  contourNoiseFrequency: 20,      // mm - noise wavelength
  contourSymmetric: true,         // generate both sides
  contourMaxWidth: 5.0,           // mm - maximum envelope width
  contourMinWidth: 0.0,           // mm - minimum envelope width
};

/**
 * Generate contour echo fill pattern
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>} Array of SVG path data strings
 */
export function generate(pathData, options = {}) {
  const mappedOptions = {
    ...options,
    maxWidth: options.maxWidth ?? options.contourMaxWidth ?? defaults.contourMaxWidth,
    minWidth: options.minWidth ?? options.contourMinWidth ?? defaults.contourMinWidth,
    spacing: options.spacing ?? options.contourSpacing ?? defaults.contourSpacing,
    maxPasses: options.maxPasses ?? options.contourMaxPasses ?? defaults.contourMaxPasses,
    noiseMax: options.noiseMax ?? options.contourNoiseMax ?? defaults.contourNoiseMax,
    noiseMin: options.noiseMin ?? options.contourNoiseMin ?? defaults.contourNoiseMin,
    noiseFrequency: options.noiseFrequency ?? options.contourNoiseFrequency ?? defaults.contourNoiseFrequency,
    symmetric: options.symmetric ?? options.contourSymmetric ?? defaults.contourSymmetric,
  };

  return generateContourEchoFill(pathData, mappedOptions);
}

export const schema = {
  contourSpacing: { type: 'number', min: 0.1, max: 2, step: 0.1, label: 'Spacing', unit: 'mm' },
  contourMaxPasses: { type: 'number', min: 1, max: 30, step: 1, label: 'Max Passes' },
  contourNoiseMin: { type: 'number', min: 0, max: 1, step: 0.05, label: 'Inner Noise', unit: 'mm' },
  contourNoiseMax: { type: 'number', min: 0, max: 1, step: 0.05, label: 'Outer Noise', unit: 'mm' },
  contourNoiseFrequency: { type: 'number', min: 5, max: 50, step: 5, label: 'Noise Frequency', unit: 'mm' },
  contourSymmetric: { type: 'boolean', label: 'Symmetric' },
};
