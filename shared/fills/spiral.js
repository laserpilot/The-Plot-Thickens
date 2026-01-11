/**
 * Spiral fill mode
 * Creates twisted/spiral patterns along the path
 */

import { generatePasses, getEnvelopePreset, EnvelopePresets } from '../geometry/path-utils.js';

/**
 * Default options for spiral fill mode
 */
export const defaults = {
  twistRate: 0.01,            // twist per unit length
  twistOffset: 0,             // initial twist offset
  baseOffset: 0.25,
  noise: 0.0,
  noiseFrequency: 50,
  sampleRate: 2,
  envelope: 'sinTaperBoth',
  maxPasses: 10,
};

/**
 * Generate spiral fill pattern
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
    twistRate = defaults.twistRate,
    twistOffset = defaults.twistOffset,
    extractOutline = false,
    outlineOffset = 0.25,
    outlinePasses = 1,
  } = options;

  // Spiral mode passes twistRate and twistOffset through crosshatchOptions
  const crosshatchOptions = {
    twistRate,
    twistOffset,
  };

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
    'spiral',
    crosshatchOptions,
    extractOutline,
    1,  // stripeFilled
    1,  // stripeEmpty
    outlineOffset,
    outlinePasses
  );
}

export const schema = {
  twistRate: { type: 'number', min: 0, max: 0.1, step: 0.005, label: 'Twist Rate' },
  twistOffset: { type: 'number', min: 0, max: 360, step: 10, label: 'Twist Offset', unit: 'degrees' },
  baseOffset: { type: 'number', min: 0.1, max: 2, step: 0.05, label: 'Base Offset', unit: 'mm' },
  maxPasses: { type: 'number', min: 1, max: 30, step: 1, label: 'Max Passes' },
  envelope: { type: 'select', options: Object.keys(EnvelopePresets), label: 'Envelope' },
};
