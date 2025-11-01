/**
 * SVG path processing using shared engine
 */

import {
  generatePasses,
  measurePathLength,
  lengthToWeight,
  getEnvelopePreset
} from '../../../shared/geometry/path-utils.js';

import { AttractorSystem } from '../../../shared/fields/attractor.js';

/**
 * Process SVG paths with offset fills
 * @param {Array} paths - Array of path objects with {d, ...}
 * @param {Object} config - Processing configuration
 * @param {Array} attractors - Optional array of attractors
 * @param {Object} attractorConfig - Optional attractor configuration
 * @returns {Array} Processed paths
 */
export function processPaths(paths, config, attractors = [], attractorConfig = null) {
  const processed = [];

  // Set up attractor system if attractors provided
  let attractorSystem = null;
  if (attractors && attractors.length > 0 && attractorConfig) {
    attractorSystem = new AttractorSystem();

    // Configure system
    Object.assign(attractorSystem.config, {
      mode: attractorConfig.mode || 'attract',
      strength: attractorConfig.strength || 1.0,
      falloffRadius: attractorConfig.falloffRadius || 50,
      falloffCurve: attractorConfig.falloffCurve || 'linear',
      multiMode: attractorConfig.multiMode || 'additive',
      minPasses: config.minPasses,
      maxPasses: config.maxPasses
    });

    // Add attractors
    attractors.forEach(a => {
      attractorSystem.addAttractor(a.x, a.y, a.strength, a.radius);
    });

    console.log(`Using ${attractors.length} attractors for path processing`);
  }

  // Measure all path lengths first for relative scaling
  const lengths = paths.map(p => measurePathLength(p.d));
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const length = lengths[i];

    // Calculate number of passes
    let passCount;
    if (attractorSystem) {
      // Use attractor-based weight
      passCount = Math.round(attractorSystem.calculatePathWeight(path.d, length));
    } else {
      // Use length-based weight
      passCount = Math.round(lengthToWeight(
        length,
        config.minPasses,
        config.maxPasses,
        minLength,
        maxLength,
        config.curve || 'linear'
      ));
    }

    // Get envelope function for normal mode
    const envelope = getEnvelopePreset('sinTaperBoth');

    // Prepare mode-specific options
    let modeOptions = config.fillModeOptions || null;

    // For spiral mode, ensure twist parameters are in the options object
    if (config.fillMode === 'spiral') {
      modeOptions = {
        ...(modeOptions || {}),
        twistRate: config.twistRate || 0.01,
        twistOffset: config.twistOffset || 0
      };
    }

    // For crosshatch mode, ensure angles and spacing are in the options object
    if (config.fillMode === 'crosshatch') {
      modeOptions = {
        ...(modeOptions || {}),
        angles: config.crosshatchAngles || [45, 135],
        spacing: config.crosshatchSpacing || 1.0
      };
    }

    // Generate offset passes for this path
    // Note: generatePasses expects individual parameters, not an object
    const passes = generatePasses(
      path.d,                 // pathData
      passCount,              // passes (number)
      config.baseOffset,      // baseOffset
      config.noise,           // noise
      null,                   // seed (auto-generate)
      `path-${i}`,           // pathId
      envelope,               // offsetEnvelope
      true,                   // useNormalMode
      config.noiseFrequency,  // noiseFrequency
      config.sampleRate,      // sampleRate
      config.fillMode || 'offset',  // fillMode
      modeOptions,            // crosshatchOptions (or mode-specific options)
      false,                  // extractOutline
      config.stripeFilled || 1,  // stripeFilled
      config.stripeEmpty || 1    // stripeEmpty
    );

    // Add each pass as a separate path with proper SVG attributes
    passes.forEach((passData, passIndex) => {
      processed.push({
        id: `${path.id || i}-pass-${passIndex}`,
        d: passData,
        originalIndex: i,
        passIndex,
        // SVG display attributes for rendering and export
        fill: 'none',
        stroke: 'black',
        strokeWidth: 0.1  // 0.1mm default pen width
      });
    });
  }

  console.log(`Processed ${paths.length} source paths into ${processed.length} offset paths`);
  console.log(`Average passes per path: ${(processed.length / paths.length).toFixed(1)}`);
  return processed;
}

/**
 * Get path statistics
 */
export function getPathStats(paths) {
  const lengths = paths.map(p => measurePathLength(p.d));

  return {
    count: paths.length,
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths),
    avgLength: lengths.reduce((a, b) => a + b, 0) / lengths.length,
    totalLength: lengths.reduce((a, b) => a + b, 0)
  };
}
