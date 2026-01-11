/**
 * Shape Fill mode
 * Fills paths with repeated shapes (circles, squares, etc.)
 */

import { generateShapeFill } from '../geometry/path-utils.js';

/**
 * Default options for shape-fill mode
 */
export const defaults = {
  shapeType: 'circle',        // 'circle', 'square', 'triangle', etc.
  shapeFillMode: 'filled',    // 'filled' or 'outline'
  shapeSpacing: 1.0,          // mm - spacing between shapes
  shapeMaxWidth: 3.0,         // mm - maximum shape size
  shapeMinWidth: 0.0,         // mm - minimum shape size
};

/**
 * Generate shape fill pattern
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>} Array of SVG path data strings
 */
export function generate(pathData, options = {}) {
  const mappedOptions = {
    ...options,
    maxWidth: options.maxWidth ?? options.shapeMaxWidth ?? defaults.shapeMaxWidth,
    minWidth: options.minWidth ?? options.shapeMinWidth ?? defaults.shapeMinWidth,
    shapeType: options.shapeType ?? defaults.shapeType,
    fillMode: options.fillMode ?? options.shapeFillMode ?? defaults.shapeFillMode,
    spacing: options.spacing ?? options.shapeSpacing ?? defaults.shapeSpacing,
  };

  return generateShapeFill(pathData, mappedOptions);
}

export const schema = {
  shapeType: { type: 'select', options: ['circle', 'square', 'triangle', 'hexagon'], label: 'Shape Type' },
  shapeFillMode: { type: 'select', options: ['filled', 'outline'], label: 'Fill Mode' },
  shapeSpacing: { type: 'number', min: 0.2, max: 5, step: 0.1, label: 'Spacing', unit: 'mm' },
  shapeMaxWidth: { type: 'number', min: 0.5, max: 10, step: 0.5, label: 'Max Size', unit: 'mm' },
  shapeMinWidth: { type: 'number', min: 0, max: 5, step: 0.5, label: 'Min Size', unit: 'mm' },
};
