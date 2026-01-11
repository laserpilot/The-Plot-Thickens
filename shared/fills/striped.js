/**
 * Striped fill mode
 * Creates alternating filled and empty stripe patterns
 */

import { generatePasses, getEnvelopePreset, EnvelopePresets } from '../geometry/path-utils.js';

/**
 * Default options for striped fill mode
 */
export const defaults = {
  stripeFilled: 1,            // number of filled stripes
  stripeEmpty: 1,             // number of empty stripes
  baseOffset: 0.25,
  noise: 0.0,
  noiseFrequency: 50,
  sampleRate: 2,
  envelope: 'sinTaperBoth',
  maxPasses: 10,
};

/**
 * Generate striped fill pattern
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>} Array of SVG path data strings
 */
export function generate(pathData, options = {}) {
  const {
    passes = options.maxPasses ?? defaults.maxPasses,
    baseOffset = defaults.baseOffset,
    noise = defaults.noise,
    seed = null,
    pathId = '',
    envelope = defaults.envelope,
    noiseFrequency = defaults.noiseFrequency,
    sampleRate = defaults.sampleRate,
    stripeFilled = defaults.stripeFilled,
    stripeEmpty = defaults.stripeEmpty,
    extractOutline = false,
    outlineOffset = 0.25,
    outlinePasses = 1,
  } = options;

  // Convert envelope name to function
  const envelopeFn = typeof envelope === 'string' ? getEnvelopePreset(envelope) : envelope;

  return generatePasses(
    pathData,
    passes,
    baseOffset,
    noise,
    seed,
    pathId,
    envelopeFn,
    true,  // useNormalMode
    noiseFrequency,
    sampleRate,
    'striped',
    null,  // crosshatchOptions
    extractOutline,
    stripeFilled,
    stripeEmpty,
    outlineOffset,
    outlinePasses
  );
}

export const schema = {
  stripeFilled: { type: 'number', min: 1, max: 10, step: 1, label: 'Filled Stripes' },
  stripeEmpty: { type: 'number', min: 1, max: 10, step: 1, label: 'Empty Stripes' },
  baseOffset: { type: 'number', min: 0.1, max: 2, step: 0.05, label: 'Base Offset', unit: 'mm' },
  maxPasses: { type: 'number', min: 1, max: 30, step: 1, label: 'Max Passes' },
  envelope: { type: 'select', options: Object.keys(EnvelopePresets), label: 'Envelope' },
};
