/**
 * Barber Pole fill mode
 * Creates twisted stripe patterns like a barber pole or candy cane
 * Supports both smooth (continuous S-curves) and pixelated variants
 */

// Import the implementation from path-utils (keeping large code in place)
import { generateBarberPoleFill } from '../geometry/path-utils.js';

/**
 * Default options for barber-pole fill mode
 * This is the single source of truth for barber-pole defaults
 */
export const defaults = {
  // Core barber pole settings
  stripeCount: 3,
  twistFrequency: 0.2,
  twistRateMode: 'inverse',       // 'constant', 'inverse', 'proportional'
  occlusionMode: 'smooth',        // 'none', 'smooth', 'hard', 'braid'
  minOcclusion: 0.0,
  barberPoleStyle: 'smooth',      // 'smooth' or 'pixelated'

  // Width settings
  barberPoleMaxWidth: 3.0,
  barberPoleMinWidth: 0.0,

  // Smooth variant settings
  barberPoleEdgeSoftness: 0.15,   // 0-1, controls stripe edge smoothness
  stripeHeight: null,              // mm - perpendicular thickness (null = auto-scale)
  stripeGapRatio: 1.0,            // ratio of gap width to stripe width
  lineSpacing: 0.3,               // mm - spacing between lines within stripe
  stripeTaperEdgeSharpness: 1.0,  // 0.1-5.0 - controls pointiness at edges
  stripeTaperMiddleAngle: 1.0,    // 0.1-3.0 - controls diagonal slope

  // Braid settings
  braidVariant: 'two-strand',     // 'two-strand' or 'three-strand'
  braidTightness: 0.5,            // 0-1, stripe overlap into gap
  braidOcclusionThreshold: 0.3,   // visibility cutoff
  gapPhaseOffset: 0,              // phase offset for gap family
  profile: 'sigmoid',             // 'sigmoid', 'flat-candy', 'cylindrical'
  stripeRotation: 0,              // degrees
  tipAngle: 0,                    // degrees
  visibleFamilies: null,          // [1,2,3] or null for auto

  // Display option
  showGapOutlines: false,         // draw boundary lines at gap edges
};

/**
 * Generate barber pole fill pattern
 * Delegates to smooth or pixelated variant based on barberPoleStyle
 *
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>|Object} Paths or {stripes, gapOutlines, family3}
 */
export function generate(pathData, options = {}) {
  // Map aliased options to the implementation's expected names
  const mappedOptions = {
    ...options,
    maxWidth: options.maxWidth ?? options.barberPoleMaxWidth ?? defaults.barberPoleMaxWidth,
    minWidth: options.minWidth ?? options.barberPoleMinWidth ?? defaults.barberPoleMinWidth,
  };

  return generateBarberPoleFill(pathData, mappedOptions);
}

/**
 * Optional schema for UI automation (future use)
 */
export const schema = {
  barberPoleStyle: {
    type: 'select',
    options: ['smooth', 'pixelated'],
    label: 'Style',
  },
  stripeCount: {
    type: 'number',
    min: 2,
    max: 8,
    step: 1,
    label: 'Stripe Count',
  },
  twistFrequency: {
    type: 'number',
    min: 0.01,
    max: 1.0,
    step: 0.01,
    label: 'Twist Frequency',
  },
  twistRateMode: {
    type: 'select',
    options: ['constant', 'inverse', 'proportional'],
    label: 'Twist Rate Mode',
  },
  occlusionMode: {
    type: 'select',
    options: ['none', 'smooth', 'hard', 'braid'],
    label: 'Occlusion Mode',
  },
  braidVariant: {
    type: 'select',
    options: ['two-strand', 'three-strand'],
    label: 'Braid Variant',
  },
  braidTightness: {
    type: 'number',
    min: 0,
    max: 1,
    step: 0.1,
    label: 'Braid Tightness',
  },
  profile: {
    type: 'select',
    options: ['sigmoid', 'flat-candy', 'cylindrical'],
    label: 'Profile',
  },
  stripeHeight: {
    type: 'number',
    min: 0.5,
    max: 20,
    step: 0.5,
    label: 'Stripe Height',
    unit: 'mm',
    nullable: true,
  },
  stripeGapRatio: {
    type: 'number',
    min: 0.1,
    max: 3,
    step: 0.1,
    label: 'Gap Ratio',
  },
  lineSpacing: {
    type: 'number',
    min: 0.1,
    max: 2,
    step: 0.1,
    label: 'Line Spacing',
    unit: 'mm',
  },
};
