/**
 * Hatch Gradient fill mode
 * Creates light-driven hatch density patterns
 */

import { generateHatchGradientFill } from '../geometry/path-utils.js';

/**
 * Default options for hatch-gradient fill mode
 */
export const defaults = {
  hatchGradient: {
    angles: [0, 45, 90],          // degrees - angles for hatch layers
    spacing: 1.0,                 // mm - base spacing
    lightMode: 'directional',     // 'directional' or 'radial'
    lightAngle: 45,               // degrees - light direction
    lightPosX: 25,                // percentage - light X position (radial)
    lightPosY: 25,                // percentage - light Y position (radial)
    falloffRadius: 100,           // mm - falloff distance (radial)
    lightStrength: 0.8,           // 0-1 - light intensity
    baseWeight: 0.2,              // 0-1 - minimum hatch density
    shadowSoftness: 0.5           // 0-1 - shadow edge softness
  },
};

/**
 * Generate hatch gradient fill pattern
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>} Array of SVG path data strings
 */
export function generate(pathData, options = {}) {
  // Merge nested hatchGradient options
  const hatchConfig = {
    ...defaults.hatchGradient,
    ...(options.hatchGradient || {}),
  };

  return generateHatchGradientFill(pathData, {
    ...options,
    hatchGradient: hatchConfig,
  });
}

export const schema = {
  'hatchGradient.angles': { type: 'array', itemType: 'number', label: 'Angles', unit: 'degrees' },
  'hatchGradient.spacing': { type: 'number', min: 0.2, max: 5, step: 0.1, label: 'Spacing', unit: 'mm' },
  'hatchGradient.lightMode': { type: 'select', options: ['directional', 'radial'], label: 'Light Mode' },
  'hatchGradient.lightAngle': { type: 'number', min: 0, max: 360, step: 5, label: 'Light Angle', unit: 'degrees' },
  'hatchGradient.lightStrength': { type: 'number', min: 0, max: 1, step: 0.1, label: 'Light Strength' },
  'hatchGradient.baseWeight': { type: 'number', min: 0, max: 1, step: 0.1, label: 'Base Weight' },
};
