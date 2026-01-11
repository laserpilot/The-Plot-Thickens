/**
 * Focus Blur fill mode
 * Creates light-driven density variation with focus/blur zones
 */

import { generatePasses, getEnvelopePreset, EnvelopePresets } from '../geometry/path-utils.js';

/**
 * Default options for focus-blur fill mode
 */
export const defaults = {
  focusBlur: {
    lightMode: 'directional',   // 'directional' or 'point'
    lightAngle: 45,             // degrees - light direction (directional mode)
    lightPosX: 50,              // percentage - light X position (point mode)
    lightPosY: 50,              // percentage - light Y position (point mode)
    falloffRadius: 150,         // mm - falloff distance
    noiseMin: 0.05,             // mm - focused (lit) area noise
    noiseMax: 0.6,              // mm - blurred (shadowed) area noise
    freqMin: 100,               // focused area frequency (tighter)
    freqMax: 10,                // blurred area frequency (looser)
    modulatePasses: false,      // also vary pass count
    passesMin: 1.0,             // minimum pass multiplier
    passesMax: 1.5,             // maximum pass multiplier
  },
  baseOffset: 0.25,
  sampleRate: 2,
  envelope: 'sinTaperBoth',
  maxPasses: 10,
};

/**
 * Generate focus-blur fill pattern
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>} Array of SVG path data strings
 */
export function generate(pathData, options = {}) {
  const {
    passes = options.maxPasses ?? defaults.maxPasses,
    baseOffset = defaults.baseOffset,
    seed = null,
    pathId = '',
    envelope = defaults.envelope,
    sampleRate = defaults.sampleRate,
    focusBlur = {},
    viewBox = { x: 0, y: 0, width: 100, height: 100 },
    extractOutline = false,
    outlineOffset = 0.25,
    outlinePasses = 1,
  } = options;

  // Merge focus blur options with defaults
  const focusConfig = {
    ...defaults.focusBlur,
    ...focusBlur,
    viewBox,
  };

  // Convert envelope name to function
  const envelopeFn = typeof envelope === 'string' ? getEnvelopePreset(envelope) : envelope;

  return generatePasses(
    pathData,
    passes,
    baseOffset,
    0,     // noise (handled by focus-blur mode internally)
    seed,
    pathId,
    envelopeFn,
    true,  // useNormalMode
    50,    // noiseFrequency (unused)
    sampleRate,
    'focus-blur',
    focusConfig,  // Pass focus blur config as crosshatchOptions
    extractOutline,
    1,  // stripeFilled
    1,  // stripeEmpty
    outlineOffset,
    outlinePasses
  );
}

export const schema = {
  'focusBlur.lightMode': { type: 'select', options: ['directional', 'point'], label: 'Light Mode' },
  'focusBlur.lightAngle': { type: 'number', min: 0, max: 360, step: 5, label: 'Light Angle', unit: 'degrees' },
  'focusBlur.lightPosX': { type: 'number', min: 0, max: 100, step: 5, label: 'Light X', unit: '%' },
  'focusBlur.lightPosY': { type: 'number', min: 0, max: 100, step: 5, label: 'Light Y', unit: '%' },
  'focusBlur.falloffRadius': { type: 'number', min: 10, max: 500, step: 10, label: 'Falloff Radius', unit: 'mm' },
  'focusBlur.noiseMin': { type: 'number', min: 0, max: 1, step: 0.05, label: 'Focus Noise', unit: 'mm' },
  'focusBlur.noiseMax': { type: 'number', min: 0, max: 2, step: 0.1, label: 'Blur Noise', unit: 'mm' },
};
