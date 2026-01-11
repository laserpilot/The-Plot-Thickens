/**
 * Woodgrain fill mode
 * Creates parallel drifting strands that mimic wood grain patterns
 */

import { generateWoodgrainFill } from '../geometry/path-utils.js';

/**
 * Default options for woodgrain fill mode
 */
export const defaults = {
  woodgrainBands: 8,              // number of parallel strands (6-12 typical)
  woodgrainSpacing: 1.0,          // mm - base spacing between strands
  woodgrainDriftAmplitude: 0.5,   // mm - how much strands wander
  woodgrainDriftWavelength: 60,   // mm - how slowly they drift (40-120)
  woodgrainDriftFalloff: 0.5,     // 0-1 - edge vs center drift strength
  woodgrainMaxWidth: 5.0,         // mm - maximum envelope width
  woodgrainMinWidth: 0.0,         // mm - minimum envelope width
};

/**
 * Generate woodgrain fill pattern
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>} Array of SVG path data strings
 */
export function generate(pathData, options = {}) {
  const mappedOptions = {
    ...options,
    maxWidth: options.maxWidth ?? options.woodgrainMaxWidth ?? defaults.woodgrainMaxWidth,
    minWidth: options.minWidth ?? options.woodgrainMinWidth ?? defaults.woodgrainMinWidth,
    bands: options.bands ?? options.woodgrainBands ?? defaults.woodgrainBands,
    spacing: options.spacing ?? options.woodgrainSpacing ?? defaults.woodgrainSpacing,
    driftAmplitude: options.driftAmplitude ?? options.woodgrainDriftAmplitude ?? defaults.woodgrainDriftAmplitude,
    driftWavelength: options.driftWavelength ?? options.woodgrainDriftWavelength ?? defaults.woodgrainDriftWavelength,
    driftFalloff: options.driftFalloff ?? options.woodgrainDriftFalloff ?? defaults.woodgrainDriftFalloff,
  };

  return generateWoodgrainFill(pathData, mappedOptions);
}

export const schema = {
  woodgrainBands: { type: 'number', min: 2, max: 20, step: 1, label: 'Bands' },
  woodgrainSpacing: { type: 'number', min: 0.2, max: 3, step: 0.1, label: 'Spacing', unit: 'mm' },
  woodgrainDriftAmplitude: { type: 'number', min: 0, max: 2, step: 0.1, label: 'Drift Amplitude', unit: 'mm' },
  woodgrainDriftWavelength: { type: 'number', min: 20, max: 200, step: 10, label: 'Drift Wavelength', unit: 'mm' },
  woodgrainDriftFalloff: { type: 'number', min: 0, max: 1, step: 0.1, label: 'Drift Falloff' },
};
