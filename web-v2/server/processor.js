/**
 * Server-side SVG processor with progress hooks
 * Wraps the shared engine and emits progress updates
 */

import {
  generatePasses,
  measurePathLength,
  lengthToWeight,
  getEnvelopePreset,
  generateCurlyFill
} from '../../shared/geometry/path-utils.js';

import { AttractorSystem } from '../../shared/fields/attractor.js';

/**
 * Process SVG paths with progress callback
 * @param {Array} paths - Array of path objects with {d, ...}
 * @param {Object} config - Processing configuration
 * @param {Function} progressCallback - Called with {processed, total, percent}
 * @param {Array} attractors - Optional array of attractors
 * @param {Object} attractorConfig - Optional attractor configuration
 * @param {Object} viewBox - Optional viewBox for focus blur modes
 * @returns {Array} Processed paths
 */
export function processPathsWithProgress(
  paths,
  config,
  progressCallback = null,
  attractors = [],
  attractorConfig = null,
  viewBox = null
) {
  const processed = [];
  const totalPaths = paths.length;

  // Set up attractor system if attractors provided
  let attractorSystem = null;
  if (attractors && attractors.length > 0 && attractorConfig) {
    attractorSystem = new AttractorSystem();

    // Configure system with all options
    Object.assign(attractorSystem.config, {
      mode: attractorConfig.mode || 'attract',
      strength: attractorConfig.strength || 1.0,
      falloffRadius: attractorConfig.falloffRadius || 50,
      falloffCurve: attractorConfig.falloffCurve || 'linear',
      falloffExponent: attractorConfig.falloffExponent || 2,
      multiMode: attractorConfig.multiMode || 'additive',
      minPasses: config.minPasses,
      maxPasses: config.maxPasses,
      // Advanced filtering options
      minInfluenceThreshold: attractorConfig.minInfluenceThreshold || 0,
      minCoveragePercent: attractorConfig.minCoveragePercent || 0,
      influenceCalcMode: attractorConfig.influenceCalcMode || 'average'
    });

    // Add attractors
    attractors.forEach(a => {
      attractorSystem.addAttractor(a.x, a.y, a.strength, a.radius);
    });

    console.log(`Using ${attractors.length} attractors for path processing`);
  }

  // Measure all path lengths first for relative scaling
  const lengths = paths.map(p => measurePathLength(p.d));

  // Use config overrides if provided (non-zero), otherwise auto-detect
  const minLength = (config.minLength && config.minLength > 0)
    ? config.minLength
    : Math.min(...lengths);
  const maxLength = (config.maxLength && config.maxLength > 0)
    ? config.maxLength
    : Math.max(...lengths);

  console.log(`Length range: ${minLength.toFixed(1)} - ${maxLength.toFixed(1)} mm ${config.minLength || config.maxLength ? '(manual override)' : '(auto-detected)'}`);

  // Emit initial progress
  if (progressCallback) {
    progressCallback({
      processed: 0,
      total: totalPaths,
      percent: 0
    });
  }

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

    // For focus blur mode, pass all focus blur parameters and viewBox
    if (config.fillMode === 'focus-blur') {
      const focusBlur = config.focusBlur || {};
      modeOptions = {
        ...(modeOptions || {}),
        lightMode: focusBlur.lightMode || 'directional',
        lightAngle: focusBlur.lightAngle || 45,
        lightPosX: focusBlur.lightPosX || 50,
        lightPosY: focusBlur.lightPosY || 50,
        falloffRadius: focusBlur.falloffRadius || 150,
        noiseMin: focusBlur.noiseMin || 0.05,
        noiseMax: focusBlur.noiseMax || 0.6,
        freqMin: focusBlur.freqMin || 100,
        freqMax: focusBlur.freqMax || 10,
        modulatePasses: focusBlur.modulatePasses || false,
        passesMin: focusBlur.passesMin || 1.0,
        passesMax: focusBlur.passesMax || 1.5,
        viewBox: viewBox || { x: 0, y: 0, width: 100, height: 100 }
      };
    }

    // For hatch gradient mode, pass all hatch gradient parameters and viewBox
    if (config.fillMode === 'hatch-gradient') {
      const hatchGradient = config.hatchGradient || {};
      modeOptions = {
        ...(modeOptions || {}),
        angles: hatchGradient.angles || [0, 45, 90],
        spacing: hatchGradient.spacing || 1.0,
        lightMode: hatchGradient.lightMode || 'directional',
        lightAngle: hatchGradient.lightAngle || 45,
        lightPosX: hatchGradient.lightPosX || 25,
        lightPosY: hatchGradient.lightPosY || 25,
        falloffRadius: hatchGradient.falloffRadius || 100,
        lightStrength: hatchGradient.lightStrength || 0.8,
        baseWeight: hatchGradient.baseWeight || 0.2,
        shadowSoftness: hatchGradient.shadowSoftness || 0.5,
        viewBox: viewBox || { x: 0, y: 0, width: 100, height: 100 }
      };
    }

    // Handle curly mode separately (doesn't use generatePasses)
    if (config.fillMode === 'curly') {
      const curlyPaths = generateCurlyFill(path.d, {
        loopFrequency: config.curlyLoopFrequency !== undefined ? config.curlyLoopFrequency : 1.0,
        loopAmplitude: config.curlyLoopAmplitude !== undefined ? config.curlyLoopAmplitude : 1.0,
        overlap: config.curlyOverlap !== undefined ? config.curlyOverlap : 0.3,
        minWidthThreshold: config.curlyMinWidth !== undefined ? config.curlyMinWidth : 0.5,
        loopStyle: config.curlyLoopStyle || 'circular',
        strands: config.curlyStrands !== undefined ? config.curlyStrands : 1,
        strandPhaseOffset: config.curlyStrandPhaseOffset !== undefined ? config.curlyStrandPhaseOffset : 0.5,
        baseOffset: config.baseOffset,
        envelope: config.envelope || 'flat',
        maxWidth: config.curlyMaxWidth !== undefined ? config.curlyMaxWidth : 3.0,
        minWidth: config.curlyMinWidth !== undefined ? config.curlyMinWidth : 0.0,
        noise: config.noise || 0,
        seed: null,
        sampleRate: config.sampleRate || 0.5,
        pathId: `path-${i}`
      });

      // Add each generated curly path
      curlyPaths.forEach((curlyData, curlyIndex) => {
        processed.push({
          id: `${path.id || i}-curly-${curlyIndex}`,
          d: curlyData,
          originalIndex: i,
          curlyIndex,
          fill: 'none',
          stroke: 'black',
          strokeWidth: 0.1
        });
      });

      // Skip to next path (don't call generatePasses)
      continue;
    }

    // Generate offset passes for this path
    const result = generatePasses(
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
      modeOptions,            // mode-specific options
      config.addOutline || false,  // extractOutline
      config.stripeFilled || 1,  // stripeFilled
      config.stripeEmpty || 1,   // stripeEmpty
      config.outlineOffset || 0.25,  // outlineOffset
      config.outlinePasses || 1      // outlinePasses
    );

    // Handle result - could be array of paths or {fills, outlines} object
    const passes = config.addOutline && result.fills ? result.fills : (Array.isArray(result) ? result : []);
    let outlines = config.addOutline && result.outlines ? result.outlines : [];

    // Filter outlines by path length (based on original path length)
    if (outlines.length > 0 && (config.outlineMinLength !== null || config.outlineMaxLength !== null)) {
      const passesFilter =
        (config.outlineMinLength === null || length >= config.outlineMinLength) &&
        (config.outlineMaxLength === null || length <= config.outlineMaxLength);

      if (!passesFilter) {
        // Path doesn't meet length criteria for outlines - clear them
        outlines = [];
      }
    }

    // Add each pass as a separate path with proper SVG attributes
    passes.forEach((passData, passIndex) => {
      processed.push({
        id: `${path.id || i}-pass-${passIndex}`,
        d: passData,
        originalIndex: i,
        passIndex,
        sourceLength: length,
        // SVG display attributes for rendering and export
        fill: 'none',
        stroke: 'black',
        strokeWidth: 0.1  // 0.1mm default pen width
      });
    });

    // Add outline paths with special ID prefix for grouping
    outlines.forEach((outlineData, outlineIndex) => {
      processed.push({
        id: `${path.id || i}-outline-${outlineIndex}`,
        d: outlineData,
        originalIndex: i,
        isOutline: true,
        sourceLength: length,
        // SVG display attributes for rendering and export
        fill: 'none',
        stroke: 'black',
        strokeWidth: 0.1
      });
    });

    // Emit progress every 100 paths or on completion
    if (progressCallback && ((i + 1) % 100 === 0 || i === totalPaths - 1)) {
      const percent = ((i + 1) / totalPaths * 100).toFixed(1);
      progressCallback({
        processed: i + 1,
        total: totalPaths,
        percent: parseFloat(percent)
      });
    }
  }

  console.log(`Processed ${paths.length} source paths into ${processed.length} offset paths`);
  console.log(`Average passes per path: ${(processed.length / paths.length).toFixed(1)}`);

  // Final progress update
  if (progressCallback) {
    progressCallback({
      processed: totalPaths,
      total: totalPaths,
      percent: 100
    });
  }

  return processed;
}
