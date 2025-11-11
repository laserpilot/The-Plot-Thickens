/**
 * SVG path processing using shared engine
 */

import {
  generatePasses,
  measurePathLength,
  lengthToWeight,
  getEnvelopePreset,
  generateShapeFill,
  generateBarberPoleFill
} from '../../../shared/geometry/path-utils.js';

import { AttractorSystem } from '../../../shared/fields/attractor.js';

/**
 * Process SVG paths with offset fills (chunked for UI responsiveness)
 * @param {Array} paths - Array of path objects with {d, ...}
 * @param {Object} config - Processing configuration
 * @param {Array} attractors - Optional array of attractors
 * @param {Object} attractorConfig - Optional attractor configuration
 * @param {Object} viewBox - Optional viewBox for focus blur (required for focus-blur mode)
 * @param {Function} progressCallback - Optional callback(current, total) for progress updates
 * @returns {Object} {paths: processed paths, detectedMinLength, detectedMaxLength}
 */
export async function processPaths(paths, config, attractors = [], attractorConfig = null, viewBox = null, progressCallback = null) {
  const processed = [];

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

  // Process in chunks to avoid blocking UI thread
  const chunkSize = 10; // Process 10 paths at a time
  const totalPaths = paths.length;

  for (let chunkStart = 0; chunkStart < totalPaths; chunkStart += chunkSize) {
    const chunkEnd = Math.min(chunkStart + chunkSize, totalPaths);

    // Process this chunk
    for (let i = chunkStart; i < chunkEnd; i++) {
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

    // Get envelope function from config (default: flat)
    const envelope = getEnvelopePreset(config.envelope || 'flat');

    // Prepare mode-specific options
    let modeOptions = config.fillModeOptions || {};

    // Add noise gradient parameters to mode options (works for offset, striped, spiral modes)
    modeOptions = {
      ...modeOptions,
      noiseGradientMode: config.noiseGradientMode || 'flat',
      noiseMin: config.noiseMin || 0.05,
      noiseMax: config.noiseMax || 0.4,
      freqMin: config.freqMin || 50,
      freqMax: config.freqMax || 10,
      gradientCurve: config.gradientCurve || 'linear'
    };

    // For spiral mode, ensure twist parameters are in the options object
    if (config.fillMode === 'spiral') {
      modeOptions = {
        ...modeOptions,
        twistRate: config.twistRate || 0.01,
        twistOffset: config.twistOffset || 0
      };
    }

    // For crosshatch mode, ensure angles and spacing are in the options object
    if (config.fillMode === 'crosshatch') {
      modeOptions = {
        ...(modeOptions || {}),
        angles: config.crosshatchAngles || [45, 135],
        spacing: config.crosshatchSpacing || 1.0,
        // Add organic parameters if configured
        organic: config.crosshatchOrganic ? {
          enabled: true,
          wiggle: config.crosshatchOrganic.wiggle || 0,
          wiggleFreq: config.crosshatchOrganic.wiggleFreq || 0,
          angleJitter: config.crosshatchOrganic.angleJitter || 0,
          lengthJitter: config.crosshatchOrganic.lengthJitter || 0,
          positionJitter: config.crosshatchOrganic.positionJitter || 0,
          spacingJitter: config.crosshatchOrganic.spacingJitter || 0
        } : { enabled: false }
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

    // Handle shape-fill mode separately (doesn't use generatePasses)
    if (config.fillMode === 'shape-fill') {
      const shapePaths = generateShapeFill(path.d, {
        shapeType: config.shapeType || 'circle',
        shapeFillMode: config.shapeFillMode || 'filled',
        shapeSpacing: config.shapeSpacing !== undefined ? config.shapeSpacing : 1.0,
        baseOffset: config.baseOffset,
        envelope: config.envelope || 'flat',
        maxWidth: config.shapeMaxWidth !== undefined ? config.shapeMaxWidth : 3.0,
        minWidth: config.shapeMinWidth !== undefined ? config.shapeMinWidth : 0.0,
        pathId: `path-${i}`
      });

      // Add each generated shape as a separate path
      shapePaths.forEach((shapeData, shapeIndex) => {
        processed.push({
          id: `${path.id || i}-shape-${shapeIndex}`,
          d: shapeData,
          originalIndex: i,
          shapeIndex,
          fill: 'none',
          stroke: 'black',
          strokeWidth: 0.1
        });
      });

      // Skip to next path (don't call generatePasses)
      continue;
    }

    // Handle barber-pole mode separately (doesn't use generatePasses)
    if (config.fillMode === 'barber-pole') {
      const barberPolePaths = generateBarberPoleFill(path.d, {
        barberPoleStyle: config.barberPoleStyle || 'smooth',
        edgeSoftness: config.barberPoleEdgeSoftness !== undefined ? config.barberPoleEdgeSoftness : 0.15,
        stripeCount: config.stripeCount !== undefined ? config.stripeCount : 3,
        twistFrequency: config.twistFrequency !== undefined ? config.twistFrequency : 0.2,
        twistRateMode: config.twistRateMode || 'inverse',
        occlusionMode: config.occlusionMode || 'smooth',
        minOcclusion: config.minOcclusion !== undefined ? config.minOcclusion : 0.0,
        baseOffset: config.baseOffset,
        envelope: config.envelope || 'flat',
        maxWidth: config.barberPoleMaxWidth !== undefined ? config.barberPoleMaxWidth : 3.0,
        minWidth: config.barberPoleMinWidth !== undefined ? config.barberPoleMinWidth : 0.0,
        noise: config.noise || 0,
        seed: null,
        sampleRate: config.sampleRate || 0.5,
        pathId: `path-${i}`
      });

      // Add each generated stripe path
      barberPolePaths.forEach((stripeData, stripeIndex) => {
        processed.push({
          id: `${path.id || i}-stripe-${stripeIndex}`,
          d: stripeData,
          originalIndex: i,
          stripeIndex,
          fill: 'none',
          stroke: 'black',
          strokeWidth: 0.1
        });
      });

      // Skip to next path (don't call generatePasses)
      continue;
    }

    // Generate offset passes for this path
    // Note: generatePasses expects individual parameters, not an object
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
      modeOptions,            // crosshatchOptions (or mode-specific options)
      config.addOutline || false,  // extractOutline
      config.stripeFilled || 1,  // stripeFilled
      config.stripeEmpty || 1,   // stripeEmpty
      config.outlineOffset || 0.25,  // outlineOffset
      config.outlinePasses || 1      // outlinePasses
    );

    // Handle result - could be array of paths or {fills, outlines} object
    const passes = config.addOutline && result.fills ? result.fills : (Array.isArray(result) ? result : []);
    const outlines = config.addOutline && result.outlines ? result.outlines : [];

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

    // Add outline paths with special ID prefix for grouping
    outlines.forEach((outlineData, outlineIndex) => {
      processed.push({
        id: `${path.id || i}-outline-${outlineIndex}`,
        d: outlineData,
        originalIndex: i,
        isOutline: true,
        // SVG display attributes for rendering and export
        fill: 'none',
        stroke: 'black',
        strokeWidth: 0.1
      });
    });
    }

    // Update progress after each chunk
    if (progressCallback) {
      progressCallback(chunkEnd, totalPaths);
    }

    // Yield to browser to keep UI responsive
    // Use setTimeout with 10ms delay to ensure browser has time to paint UI updates
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  console.log(`Processed ${paths.length} source paths into ${processed.length} offset paths`);
  console.log(`Average passes per path: ${(processed.length / paths.length).toFixed(1)}`);
  return {
    paths: processed,
    detectedMinLength: minLength,
    detectedMaxLength: maxLength
  };
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
