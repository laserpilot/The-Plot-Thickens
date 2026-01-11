/**
 * Offset fill mode (default)
 * Creates concentric offset passes following the path shape
 */

import { generatePasses, getEnvelopePreset, EnvelopePresets } from '../geometry/path-utils.js';

/**
 * Default options for offset fill mode
 */
export const defaults = {
  // Core offset parameters
  baseOffset: 0.25,           // mm - distance between passes
  noise: 0.0,                 // mm - random displacement
  noiseFrequency: 50,         // noise frequency
  sampleRate: 2,              // mm - sampling interval
  envelope: 'sinTaperBoth',   // envelope preset name
  minPasses: 1,
  maxPasses: 10,
  curve: 'linear',            // pass weight curve
};

/**
 * Generate offset fill pattern
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
    extractOutline = false,
    outlineOffset = 0.25,
    outlinePasses = 1,
    // Noise gradient options
    noiseGradientMode = 'flat',
    noiseMin = 0.05,
    noiseMax = 0.4,
    freqMin = 50,
    freqMax = 10,
    gradientCurve = 'linear',
  } = options;

  const crosshatchOptions = {
    noiseGradientMode,
    noiseMin,
    noiseMax,
    freqMin,
    freqMax,
    gradientCurve,
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
    'offset',
    crosshatchOptions,
    extractOutline,
    1,  // stripeFilled (not used in offset mode)
    1,  // stripeEmpty (not used in offset mode)
    outlineOffset,
    outlinePasses
  );
}

export const schema = {
  baseOffset: { type: 'number', min: 0.1, max: 2, step: 0.05, label: 'Base Offset', unit: 'mm' },
  noise: { type: 'number', min: 0, max: 2, step: 0.1, label: 'Noise', unit: 'mm' },
  noiseFrequency: { type: 'number', min: 5, max: 100, step: 5, label: 'Noise Frequency' },
  maxPasses: { type: 'number', min: 1, max: 30, step: 1, label: 'Max Passes' },
  envelope: { type: 'select', options: Object.keys(EnvelopePresets), label: 'Envelope' },
};
