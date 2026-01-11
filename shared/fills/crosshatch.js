/**
 * Crosshatch fill mode
 * Creates hatched lines at specified angles
 */

import { generateCrosshatchFill } from '../geometry/path-utils.js';

/**
 * Default options for crosshatch fill mode
 */
export const defaults = {
  crosshatchAngles: [45, 135],    // degrees - angles for hatch lines
  crosshatchSpacing: 1.0,        // mm - spacing between lines
  crosshatchOrganic: {
    wiggle: 0.5,                 // amount of line wiggle
    wiggleFreq: 5,               // frequency of wiggle
    angleJitter: 5,              // degrees - random angle variation
    lengthJitter: 0.1,           // random length variation
    positionJitter: 0.2,         // random position variation
    spacingJitter: 0.2           // random spacing variation
  },
};

/**
 * Generate crosshatch fill pattern
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>} Array of SVG path data strings
 */
export function generate(pathData, options = {}) {
  return generateCrosshatchFill(pathData, {
    ...defaults,
    ...options,
  });
}

export const schema = {
  crosshatchAngles: {
    type: 'array',
    itemType: 'number',
    min: 0,
    max: 180,
    label: 'Angles',
    unit: 'degrees'
  },
  crosshatchSpacing: { type: 'number', min: 0.2, max: 5, step: 0.1, label: 'Spacing', unit: 'mm' },
  'crosshatchOrganic.wiggle': { type: 'number', min: 0, max: 2, step: 0.1, label: 'Wiggle' },
  'crosshatchOrganic.wiggleFreq': { type: 'number', min: 1, max: 20, step: 1, label: 'Wiggle Frequency' },
  'crosshatchOrganic.angleJitter': { type: 'number', min: 0, max: 30, step: 1, label: 'Angle Jitter', unit: 'degrees' },
};
