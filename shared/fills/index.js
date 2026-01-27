/**
 * Fill Mode Registry
 * Single source of truth for all fill modes
 */

import * as curly from './curly.js';
import * as barberPole from './barber-pole.js';
import * as textFill from './text-fill.js';
import * as moire from './moire.js';
import * as woodgrain from './woodgrain.js';
import * as contourEcho from './contour-echo.js';
import * as shapeFill from './shape-fill.js';
import * as crosshatch from './crosshatch.js';
import * as stippling from './stippling.js';
import * as hatchGradient from './hatch-gradient.js';
// generatePasses-based modes (wrappers)
import * as offset from './offset.js';
import * as striped from './striped.js';
import * as spiral from './spiral.js';
import * as focusBlur from './focus-blur.js';

/**
 * Fill mode registry
 * Each entry contains:
 *   - generate: function(pathData, options) => Array<string>
 *   - defaults: object with default option values
 *   - category: string for UI grouping
 *   - usesGeneratePasses: boolean - true if mode routes through generatePasses()
 */
export const fillRegistry = {
  'curly': {
    generate: curly.generate,
    defaults: curly.defaults,
    schema: curly.schema,
    category: 'decorative',
    usesGeneratePasses: false,
  },
  'barber-pole': {
    generate: barberPole.generate,
    defaults: barberPole.defaults,
    schema: barberPole.schema,
    category: 'decorative',
    usesGeneratePasses: false,
  },
  'text-fill': {
    generate: textFill.generate,
    defaults: textFill.defaults,
    schema: textFill.schema,
    category: 'decorative',
    usesGeneratePasses: false,
  },
  'moire': {
    generate: moire.generate,
    defaults: moire.defaults,
    schema: moire.schema,
    category: 'pattern',
    usesGeneratePasses: false,
  },
  'woodgrain': {
    generate: woodgrain.generate,
    defaults: woodgrain.defaults,
    schema: woodgrain.schema,
    category: 'organic',
    usesGeneratePasses: false,
  },
  'contour-echo': {
    generate: contourEcho.generate,
    defaults: contourEcho.defaults,
    schema: contourEcho.schema,
    category: 'organic',
    usesGeneratePasses: false,
  },
  'shape-fill': {
    generate: shapeFill.generate,
    defaults: shapeFill.defaults,
    schema: shapeFill.schema,
    category: 'basic',
    usesGeneratePasses: false,
  },
  'crosshatch': {
    generate: crosshatch.generate,
    defaults: crosshatch.defaults,
    schema: crosshatch.schema,
    category: 'pattern',
    usesGeneratePasses: false,
  },
  'stippling': {
    generate: stippling.generate,
    defaults: stippling.defaults,
    schema: stippling.schema,
    category: 'pattern',
    usesGeneratePasses: false,
  },
  'hatch-gradient': {
    generate: hatchGradient.generate,
    defaults: hatchGradient.defaults,
    schema: hatchGradient.schema,
    category: 'shading',
    usesGeneratePasses: false,
  },
  // generatePasses-based modes (wrappers)
  'offset': {
    generate: offset.generate,
    defaults: offset.defaults,
    schema: offset.schema,
    category: 'basic',
    usesGeneratePasses: true,
  },
  'striped': {
    generate: striped.generate,
    defaults: striped.defaults,
    schema: striped.schema,
    category: 'basic',
    usesGeneratePasses: true,
  },
  'spiral': {
    generate: spiral.generate,
    defaults: spiral.defaults,
    schema: spiral.schema,
    category: 'decorative',
    usesGeneratePasses: true,
  },
  'focus-blur': {
    generate: focusBlur.generate,
    defaults: focusBlur.defaults,
    schema: focusBlur.schema,
    category: 'shading',
    usesGeneratePasses: true,
  },
};

/**
 * Get a fill mode by name
 * @param {string} name - Fill mode name
 * @returns {Object} Fill mode object with generate, defaults, etc.
 */
export function getFillMode(name) {
  return fillRegistry[name] || null;
}

/**
 * Get defaults for a specific fill mode
 * @param {string} name - Fill mode name
 * @returns {Object} Default options for the mode
 */
export function getFillDefaults(name) {
  return fillRegistry[name]?.defaults || {};
}

/**
 * List all registered fill mode names
 * @returns {Array<string>} Array of fill mode names
 */
export function listFillModes() {
  return Object.keys(fillRegistry);
}

/**
 * Get all fill modes in a specific category
 * @param {string} category - Category name
 * @returns {Array<string>} Array of fill mode names in that category
 */
export function getFillModesByCategory(category) {
  return Object.entries(fillRegistry)
    .filter(([_, mode]) => mode.category === category)
    .map(([name, _]) => name);
}

/**
 * Merge all fill mode defaults into a single object
 * Useful for initializing store config
 * @returns {Object} Combined defaults from all registered modes
 */
export function getAllDefaults() {
  const combined = {};
  for (const mode of Object.values(fillRegistry)) {
    Object.assign(combined, mode.defaults);
  }
  return combined;
}
