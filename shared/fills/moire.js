/**
 * Moiré fill mode
 * Creates phase-locked moiré patterns with interference bands
 */

import { generateMoireFill } from '../geometry/path-utils.js';

/**
 * Default options for moiré fill mode
 */
export const defaults = {
  moireMode: 'spacing',             // 'spacing' (classic moiré) or 'phase' (phase drift)
  moireSpacingA: 1.0,               // mm - spacing for family A
  moireSpacingDelta: 0.02,          // ratio - spacing difference (0.02 = 2%)
  moirePhaseDriftWavelength: 80,    // mm - wavelength of phase drift oscillation
  moirePhaseDriftAmplitude: 0.2,    // mm - amplitude of phase drift
  moireFamilies: 2,                 // number of stripe families (2 or 3)
  moirePassesPerFamily: 5,          // number of parallel strokes per family per side
  moireFamilyOffset: 0.5,           // mm - perpendicular offset between families
  moireMaxWidth: 3.0,               // maximum envelope width (mm)
  moireMinWidth: 0.0,               // minimum envelope width (mm)
  moireSamplingDrift: false,        // use sampling origin drift instead of offset drift
  moireSamplingDriftWavelength: 100,// mm
  moireSamplingDriftAmplitude: 0.5, // mm
};

/**
 * Generate moiré fill pattern
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Object} { familyA, familyB, familyC? } - Arrays of SVG path data strings
 */
export function generate(pathData, options = {}) {
  const mappedOptions = {
    ...options,
    maxWidth: options.maxWidth ?? options.moireMaxWidth ?? defaults.moireMaxWidth,
    minWidth: options.minWidth ?? options.moireMinWidth ?? defaults.moireMinWidth,
    spacingA: options.spacingA ?? options.moireSpacingA ?? defaults.moireSpacingA,
    spacingDelta: options.spacingDelta ?? options.moireSpacingDelta ?? defaults.moireSpacingDelta,
    phaseDriftWavelength: options.phaseDriftWavelength ?? options.moirePhaseDriftWavelength ?? defaults.moirePhaseDriftWavelength,
    phaseDriftAmplitude: options.phaseDriftAmplitude ?? options.moirePhaseDriftAmplitude ?? defaults.moirePhaseDriftAmplitude,
    families: options.families ?? options.moireFamilies ?? defaults.moireFamilies,
    passesPerFamily: options.passesPerFamily ?? options.moirePassesPerFamily ?? defaults.moirePassesPerFamily,
    familyOffset: options.familyOffset ?? options.moireFamilyOffset ?? defaults.moireFamilyOffset,
  };

  return generateMoireFill(pathData, mappedOptions);
}

export const schema = {
  moireMode: { type: 'select', options: ['spacing', 'phase'], label: 'Mode' },
  moireSpacingA: { type: 'number', min: 0.2, max: 5, step: 0.1, label: 'Base Spacing', unit: 'mm' },
  moireSpacingDelta: { type: 'number', min: 0, max: 0.2, step: 0.01, label: 'Spacing Delta' },
  moireFamilies: { type: 'number', min: 2, max: 3, step: 1, label: 'Families' },
  moirePassesPerFamily: { type: 'number', min: 1, max: 20, step: 1, label: 'Passes Per Family' },
  moireFamilyOffset: { type: 'number', min: 0, max: 2, step: 0.1, label: 'Family Offset', unit: 'mm' },
};
