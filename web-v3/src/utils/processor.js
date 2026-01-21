/**
 * SVG path processing using shared engine
 */

import {
  generatePasses,
  measurePathLength,
  samplePathPoints,
  lengthToWeight,
  getEnvelopePreset,
  generateShapeFill,
  generateBarberPoleFill,
  generateMoireFill,
  generateWoodgrainFill,
  generateContourEchoFill
} from '../../../shared/geometry/path-utils.js';

// Import curly from the fills registry (has compression support)
import { generate as generateCurlyFill } from '../../../shared/fills/curly.js';

import { AttractorSystem } from '../../../shared/fields/attractor.js';

/**
 * Process SVG paths with offset fills (chunked for UI responsiveness)
 * @param {Array} paths - Array of path objects with {d, ...}
 * @param {Object} config - Processing configuration
 * @param {Array} attractors - Optional array of attractors
 * @param {Object} attractorConfig - Optional attractor configuration
 * @param {Object} viewBox - Optional viewBox for focus blur (required for focus-blur mode)
 * @param {Function} progressCallback - Optional callback(current, total) for progress updates
 * @param {AbortSignal} signal - Optional AbortSignal for cancellation
 * @returns {Object} {paths: processed paths, detectedMinLength, detectedMaxLength}
 */
export async function processPaths(paths, config, attractors = [], attractorConfig = null, viewBox = null, progressCallback = null, signal = null) {
  console.log('=== processPaths called ===', { pathCount: paths?.length, hasViewBox: !!viewBox, viewBox });
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
      influenceCalcMode: attractorConfig.influenceCalcMode || 'average',
      excludeUnaffectedPaths: attractorConfig.excludeUnaffectedPaths || false
    });

    // Add attractors
    attractors.forEach(a => {
      attractorSystem.addAttractor(a.x, a.y, a.strength, a.radius);
    });

    console.log(`Using ${attractors.length} attractors for path processing`);
  }

  // Measure all path lengths first for relative scaling
  const lengths = paths.map(p => measurePathLength(p.d));

  // Scale factor: convert mm to viewBox units
  // viewBoxToMM = mm per viewBox unit, so we divide mm values by this to get viewBox units
  // If no viewBox info available, assume 1:1 (viewBox units are mm)
  const mmToViewBox = viewBox?.viewBoxToMM ? (1 / viewBox.viewBoxToMM) : 1;

  // Debug logging for scale factor verification
  const loopFreqForDebug = config.curlyLoopFrequency || 1.0;
  const loopPeriodMmForDebug = 10 / loopFreqForDebug;
  const maxSampleRateForDebug = loopPeriodMmForDebug / 20;  // 20 samples per loop
  const effectiveSampleRateForDebug = Math.min(config.sampleRate || 0.5, maxSampleRateForDebug);
  console.log('Scale factors:', {
    viewBoxToMM: viewBox?.viewBoxToMM,
    mmToViewBox,
    curlyLoopFrequency: loopFreqForDebug,
    loopPeriodMm: loopPeriodMmForDebug,
    configSampleRate: config.sampleRate,
    effectiveSampleRate: effectiveSampleRateForDebug,
    pointsPerLoop: loopPeriodMmForDebug / effectiveSampleRateForDebug
  });

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

    // Skip paths below minLength threshold
    if (config.minLength && config.minLength > 0 && length < config.minLength) {
      // If keepShortPaths is enabled, preserve as single unfilled stroke
      if (config.keepShortPaths) {
        processed.push({
          id: `${path.id || i}-short`,
          d: path.d,
          originalIndex: i,
          layerId: path.layerId,
          fill: 'none',
          stroke: path.stroke || 'black',
          strokeWidth: 0.1,
          isShortPath: true
        });
      }
      continue;
    }

    // Calculate number of passes
    let passCount;
    if (attractorSystem) {
      // Use attractor-based weight - sample points along path for influence calculation
      const pathPoints = samplePathPoints(path.d, attractorSystem.config.arcLengthSampleInterval || 5);
      passCount = Math.round(attractorSystem.calculatePathWeight(pathPoints, length));
    } else {
      // Use length-based weight (config object format)
      passCount = lengthToWeight(length, {
        minLength,
        maxLength,
        minPasses: config.minPasses,
        maxPasses: config.maxPasses,
        curve: config.curve || 'linear',
        exponent: config.exponent || 2
      });
    }

    // Skip paths with 0 passes (excluded by attractor system)
    if (passCount === 0) {
      continue;
    }

    // Get envelope function from config (default: flat)
    const envelope = getEnvelopePreset(config.envelope || 'flat');

    // Prepare mode-specific options
    let modeOptions = config.fillModeOptions || {};

    // Add noise gradient parameters to mode options (works for offset, striped, spiral modes)
    // Scale mm-based noise values to viewBox units
    modeOptions = {
      ...modeOptions,
      noiseGradientMode: config.noiseGradientMode || 'flat',
      noiseMin: (config.noiseMin || 0.05) * mmToViewBox,
      noiseMax: (config.noiseMax || 0.4) * mmToViewBox,
      freqMin: (config.freqMin || 50) * mmToViewBox,
      freqMax: (config.freqMax || 10) * mmToViewBox,
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
        spacing: (config.crosshatchSpacing || 1.0) * mmToViewBox,
        // Add organic parameters if configured - scale mm-based values
        organic: config.crosshatchOrganic ? {
          enabled: true,
          wiggle: (config.crosshatchOrganic.wiggle || 0) * mmToViewBox,
          wiggleFreq: (config.crosshatchOrganic.wiggleFreq || 0) * mmToViewBox,
          angleJitter: config.crosshatchOrganic.angleJitter || 0,
          lengthJitter: config.crosshatchOrganic.lengthJitter || 0,
          positionJitter: (config.crosshatchOrganic.positionJitter || 0) * mmToViewBox,
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
        falloffRadius: (focusBlur.falloffRadius || 150) * mmToViewBox,
        noiseMin: (focusBlur.noiseMin || 0.05) * mmToViewBox,
        noiseMax: (focusBlur.noiseMax || 0.6) * mmToViewBox,
        freqMin: (focusBlur.freqMin || 100) * mmToViewBox,
        freqMax: (focusBlur.freqMax || 10) * mmToViewBox,
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
        spacing: (hatchGradient.spacing || 1.0) * mmToViewBox,
        lightMode: hatchGradient.lightMode || 'directional',
        lightAngle: hatchGradient.lightAngle || 45,
        lightPosX: hatchGradient.lightPosX || 25,
        lightPosY: hatchGradient.lightPosY || 25,
        falloffRadius: (hatchGradient.falloffRadius || 100) * mmToViewBox,
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
        shapeSpacing: (config.shapeSpacing !== undefined ? config.shapeSpacing : 1.0) * mmToViewBox,
        baseOffset: (config.baseOffset || 0.25) * mmToViewBox,
        envelope: config.envelope || 'flat',
        maxWidth: (config.shapeMaxWidth !== undefined ? config.shapeMaxWidth : 3.0) * mmToViewBox,
        minWidth: (config.shapeMinWidth !== undefined ? config.shapeMinWidth : 0.0) * mmToViewBox,
        pathId: `path-${i}`
      });

      // Add each generated shape as a separate path
      shapePaths.forEach((shapeData, shapeIndex) => {
        processed.push({
          id: `${path.id || i}-shape-${shapeIndex}`,
          d: shapeData,
          originalIndex: i,
          layerId: path.layerId,
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
      const barberPoleResult = generateBarberPoleFill(path.d, {
        barberPoleStyle: config.barberPoleStyle || 'smooth',
        edgeSoftness: config.barberPoleEdgeSoftness !== undefined ? config.barberPoleEdgeSoftness : 0.15,
        stripeCount: config.stripeCount !== undefined ? config.stripeCount : 3,
        twistFrequency: config.twistFrequency !== undefined ? config.twistFrequency : 0.2,
        twistRateMode: config.twistRateMode || 'inverse',
        occlusionMode: config.occlusionMode || 'smooth',
        minOcclusion: config.minOcclusion !== undefined ? config.minOcclusion : 0.0,
        baseOffset: (config.baseOffset || 0.25) * mmToViewBox,
        envelope: config.envelope || 'flat',
        maxWidth: (config.barberPoleMaxWidth !== undefined ? config.barberPoleMaxWidth : 3.0) * mmToViewBox,
        minWidth: (config.barberPoleMinWidth !== undefined ? config.barberPoleMinWidth : 0.0) * mmToViewBox,
        stripeHeight: config.stripeHeight !== null && config.stripeHeight !== undefined ? config.stripeHeight * mmToViewBox : null,
        stripeGapRatio: config.stripeGapRatio !== undefined ? config.stripeGapRatio : 1.0,
        lineSpacing: (config.lineSpacing !== undefined ? config.lineSpacing : 0.3) * mmToViewBox,
        stripeTaperEdgeSharpness: config.stripeTaperEdgeSharpness !== undefined ? config.stripeTaperEdgeSharpness : 1.0,
        stripeTaperMiddleAngle: config.stripeTaperMiddleAngle !== undefined ? config.stripeTaperMiddleAngle : 1.0,
        tipAngle: config.tipAngle !== undefined ? config.tipAngle : 0,
        gapPhaseOffset: config.gapPhaseOffset !== undefined ? config.gapPhaseOffset : 0,
        showGapOutlines: config.showGapOutlines !== undefined ? config.showGapOutlines : false,
        braidVariant: config.braidVariant || 'two-strand',
        profile: config.barberProfile || 'sigmoid',
        braidTightness: config.braidTightness !== undefined ? config.braidTightness : 1.0,
        braidOcclusionThreshold: config.braidOcclusionThreshold !== undefined ? config.braidOcclusionThreshold : 0.5,
        visibleFamilies: config.visibleFamilies || null,
        noise: (config.noise || 0) * mmToViewBox,
        seed: null,
        sampleRate: (config.sampleRate || 0.5) * mmToViewBox,
        pathId: `path-${i}`
      });

      // Handle result - can be array or object with {stripes, gapOutlines, family3}
      let barberPolePaths, gapOutlinePaths, family3Paths;
      if (Array.isArray(barberPoleResult)) {
        // Legacy: just an array of paths
        barberPolePaths = barberPoleResult;
        gapOutlinePaths = [];
        family3Paths = [];
      } else {
        // New format: {stripes, gapOutlines, family3}
        barberPolePaths = barberPoleResult.stripes || [];
        gapOutlinePaths = barberPoleResult.gapOutlines || [];
        family3Paths = barberPoleResult.family3 || [];
      }

      // Add main stripe paths - Family 1 (black)
      barberPolePaths.forEach((stripeData, stripeIndex) => {
        processed.push({
          id: `${path.id || i}-stripe-${stripeIndex}`,
          d: stripeData,
          originalIndex: i,
          layerId: path.layerId,
          stripeIndex,
          fill: 'none',
          stroke: 'black',
          strokeWidth: 0.1,
          family: 'black'
        });
      });

      // Add gap outline paths - Family 2 (red)
      gapOutlinePaths.forEach((gapData, gapIndex) => {
        processed.push({
          id: `${path.id || i}-gap-${gapIndex}`,
          d: gapData,
          originalIndex: i,
          layerId: path.layerId,
          stripeIndex: gapIndex,
          fill: 'none',
          stroke: 'red',
          strokeWidth: 0.1,
          family: 'red'
        });
      });

      // Add family 3 paths (blue)
      family3Paths.forEach((family3Data, family3Index) => {
        processed.push({
          id: `${path.id || i}-family3-${family3Index}`,
          d: family3Data,
          originalIndex: i,
          layerId: path.layerId,
          stripeIndex: family3Index,
          fill: 'none',
          stroke: 'blue',
          strokeWidth: 0.1,
          family: 'blue'
        });
      });

      // Skip to next path (don't call generatePasses)
      continue;
    }

    // Handle curly mode separately (doesn't use generatePasses)
    if (config.fillMode === 'curly') {
      // Calculate adaptive sample rate to ensure smooth curves
      // Need at least 20 samples per loop to avoid Nyquist aliasing
      const minSamplesPerLoop = 20;
      const loopFreq = config.curlyLoopFrequency !== undefined ? config.curlyLoopFrequency : 1.0;
      const loopPeriodMm = 10 / loopFreq;  // mm per loop
      const maxSampleRateMm = loopPeriodMm / minSamplesPerLoop;
      const effectiveSampleRate = Math.min(config.sampleRate || 0.5, maxSampleRateMm);

      const curlyPaths = generateCurlyFill(path.d, {
        // loopFrequency is "loops per 10mm" - scale to "loops per 10 viewBox units"
        loopFrequency: loopFreq / mmToViewBox,
        loopAmplitude: config.curlyLoopAmplitude !== undefined ? config.curlyLoopAmplitude : 1.0,
        overlap: config.curlyOverlap !== undefined ? config.curlyOverlap : 0.3,
        // Scale mm parameters to viewBox units
        minWidthThreshold: (config.curlyMinWidth !== undefined ? config.curlyMinWidth : 0.5) * mmToViewBox,
        loopStyle: config.curlyLoopStyle || 'circular',
        strands: config.curlyStrands !== undefined ? config.curlyStrands : 1,
        strandPhaseOffset: config.curlyStrandPhaseOffset !== undefined ? config.curlyStrandPhaseOffset : 0.5,
        baseOffset: (config.baseOffset || 0.25) * mmToViewBox,
        envelope: config.envelope || 'flat',
        maxWidth: (config.curlyMaxWidth !== undefined ? config.curlyMaxWidth : 4.0) * mmToViewBox,
        minWidth: 0.0,
        noise: (config.noise || 0) * mmToViewBox,
        seed: null,
        sampleRate: effectiveSampleRate * mmToViewBox,  // Use adaptive rate for smooth curves
        pathId: `path-${i}`,
        leanMode: config.curlyLeanMode || 'none',
        leanStrength: config.curlyLeanStrength !== undefined ? Number(config.curlyLeanStrength) : 0.5,
        dynamicModulation: config.curlyDynamicModulation !== undefined ? Number(config.curlyDynamicModulation) : 0,
        slantAngle: config.curlySlantAngle !== undefined ? Number(config.curlySlantAngle) : 0,
        compressionMode: config.curlyCompressionMode || 'none',
        compressionAmount: config.curlyCompressionAmount !== undefined ? Number(config.curlyCompressionAmount) : 1.0,
        curvatureSensitivity: config.curlyCurvatureSensitivity !== undefined ? Number(config.curlyCurvatureSensitivity) : 1.0,
        periodicWavelength: config.curlyPeriodicWavelength !== undefined ? config.curlyPeriodicWavelength : 50,
        compressionInvert: config.curlyCompressionInvert || false,
        unitScale: mmToViewBox  // scale factor for internal mm-based constants
      });

      // Add each generated curly path
      curlyPaths.forEach((curlyData, curlyIndex) => {
        processed.push({
          id: `${path.id || i}-curly-${curlyIndex}`,
          d: curlyData,
          originalIndex: i,
          layerId: path.layerId,
          curlyIndex,
          fill: 'none',
          stroke: 'black',
          strokeWidth: 0.1
        });
      });

      // Skip to next path (don't call generatePasses)
      continue;
    }

    // Handle moiré mode separately (doesn't use generatePasses)
    if (config.fillMode === 'moire') {
      const moireResult = generateMoireFill(path.d, {
        moireMode: config.moireMode || 'spacing',
        spacingA: (config.moireSpacingA !== undefined ? config.moireSpacingA : 1.0) * mmToViewBox,
        spacingDelta: config.moireSpacingDelta !== undefined ? config.moireSpacingDelta : 0.02,
        phaseDriftWavelength: (config.moirePhaseDriftWavelength !== undefined ? config.moirePhaseDriftWavelength : 80) * mmToViewBox,
        phaseDriftAmplitude: (config.moirePhaseDriftAmplitude !== undefined ? config.moirePhaseDriftAmplitude : 0.2) * mmToViewBox,
        families: config.moireFamilies !== undefined ? config.moireFamilies : 2,
        passesPerFamily: config.moirePassesPerFamily !== undefined ? config.moirePassesPerFamily : 5,
        familyOffset: (config.moireFamilyOffset !== undefined ? config.moireFamilyOffset : 0.5) * mmToViewBox,
        baseOffset: (config.baseOffset || 0.25) * mmToViewBox,
        envelope: config.envelope || 'flat',
        maxWidth: (config.moireMaxWidth !== undefined ? config.moireMaxWidth : 3.0) * mmToViewBox,
        minWidth: (config.moireMinWidth !== undefined ? config.moireMinWidth : 0.0) * mmToViewBox,
        noise: (config.noise || 0) * mmToViewBox,
        seed: null,
        sampleRate: (config.sampleRate || 0.5) * mmToViewBox,
        pathId: `path-${i}`,
        samplingDrift: config.moireSamplingDrift || false,
        samplingDriftWavelength: (config.moireSamplingDriftWavelength !== undefined ? config.moireSamplingDriftWavelength : 100) * mmToViewBox,
        samplingDriftAmplitude: (config.moireSamplingDriftAmplitude !== undefined ? config.moireSamplingDriftAmplitude : 0.5) * mmToViewBox
      });

      // Add family A paths (black)
      moireResult.familyA.forEach((pathData, pathIndex) => {
        processed.push({
          id: `${path.id || i}-moire-a-${pathIndex}`,
          d: pathData,
          originalIndex: i,
          layerId: path.layerId,
          fill: 'none',
          stroke: 'black',
          strokeWidth: 0.1,
          family: 'black'
        });
      });

      // Add family B paths (red)
      moireResult.familyB.forEach((pathData, pathIndex) => {
        processed.push({
          id: `${path.id || i}-moire-b-${pathIndex}`,
          d: pathData,
          originalIndex: i,
          layerId: path.layerId,
          fill: 'none',
          stroke: 'red',
          strokeWidth: 0.1,
          family: 'red'
        });
      });

      // Add family C paths (blue) if present
      if (moireResult.familyC && moireResult.familyC.length > 0) {
        moireResult.familyC.forEach((pathData, pathIndex) => {
          processed.push({
            id: `${path.id || i}-moire-c-${pathIndex}`,
            d: pathData,
            originalIndex: i,
            layerId: path.layerId,
            fill: 'none',
            stroke: 'blue',
            strokeWidth: 0.1,
            family: 'blue'
          });
        });
      }

      // Skip to next path (don't call generatePasses)
      continue;
    }

    // Handle woodgrain mode separately (doesn't use generatePasses)
    if (config.fillMode === 'woodgrain') {
      const woodgrainPaths = generateWoodgrainFill(path.d, {
        bands: config.woodgrainBands !== undefined ? config.woodgrainBands : 8,
        spacing: (config.woodgrainSpacing !== undefined ? config.woodgrainSpacing : 1.0) * mmToViewBox,
        driftAmplitude: (config.woodgrainDriftAmplitude !== undefined ? config.woodgrainDriftAmplitude : 0.5) * mmToViewBox,
        driftWavelength: (config.woodgrainDriftWavelength !== undefined ? config.woodgrainDriftWavelength : 60) * mmToViewBox,
        driftFalloff: config.woodgrainDriftFalloff !== undefined ? config.woodgrainDriftFalloff : 0.5,
        baseOffset: (config.baseOffset || 0.25) * mmToViewBox,
        envelope: config.envelope || 'flat',
        maxWidth: (config.woodgrainMaxWidth !== undefined ? config.woodgrainMaxWidth : 5.0) * mmToViewBox,
        minWidth: (config.woodgrainMinWidth !== undefined ? config.woodgrainMinWidth : 0.0) * mmToViewBox,
        noise: (config.noise || 0) * mmToViewBox,
        seed: null,
        sampleRate: (config.sampleRate || 0.5) * mmToViewBox,
        pathId: `path-${i}`
      });

      // Add each generated woodgrain path
      woodgrainPaths.forEach((pathData, pathIndex) => {
        processed.push({
          id: `${path.id || i}-woodgrain-${pathIndex}`,
          d: pathData,
          originalIndex: i,
          layerId: path.layerId,
          fill: 'none',
          stroke: 'black',
          strokeWidth: 0.1
        });
      });

      // Skip to next path (don't call generatePasses)
      continue;
    }

    // Handle contour-echo mode separately (doesn't use generatePasses)
    if (config.fillMode === 'contour-echo') {
      const contourPaths = generateContourEchoFill(path.d, {
        contourSpacing: (config.contourSpacing !== undefined ? config.contourSpacing : 0.5) * mmToViewBox,
        maxPasses: config.contourMaxPasses !== undefined ? config.contourMaxPasses : 10,
        noiseMax: (config.contourNoiseMax !== undefined ? config.contourNoiseMax : 0.3) * mmToViewBox,
        noiseMin: (config.contourNoiseMin !== undefined ? config.contourNoiseMin : 0.0) * mmToViewBox,
        noiseFrequency: (config.contourNoiseFrequency !== undefined ? config.contourNoiseFrequency : 20) * mmToViewBox,
        symmetric: config.contourSymmetric !== undefined ? config.contourSymmetric : true,
        baseOffset: (config.baseOffset || 0.25) * mmToViewBox,
        envelope: config.envelope || 'flat',
        maxWidth: (config.contourMaxWidth !== undefined ? config.contourMaxWidth : 5.0) * mmToViewBox,
        minWidth: (config.contourMinWidth !== undefined ? config.contourMinWidth : 0.0) * mmToViewBox,
        seed: null,
        sampleRate: (config.sampleRate || 0.5) * mmToViewBox,
        pathId: `path-${i}`
      });

      // Add each generated contour path
      contourPaths.forEach((pathData, pathIndex) => {
        processed.push({
          id: `${path.id || i}-contour-${pathIndex}`,
          d: pathData,
          originalIndex: i,
          layerId: path.layerId,
          fill: 'none',
          stroke: 'black',
          strokeWidth: 0.1
        });
      });

      // Skip to next path (don't call generatePasses)
      continue;
    }

    // Calculate scaled outline passes based on path length
    // Linear scaling: 0 passes at outlineMinLength, full passes at outlineMaxLength
    let scaledOutlinePasses = config.outlinePasses || 1;
    if (config.addOutline && (config.outlineMinLength !== null || config.outlineMaxLength !== null)) {
      const outlineMin = config.outlineMinLength ?? minLength;
      const outlineMax = config.outlineMaxLength ?? maxLength;

      if (length <= outlineMin) {
        scaledOutlinePasses = 0;
      } else if (length >= outlineMax) {
        scaledOutlinePasses = config.outlinePasses || 1;
      } else {
        // Linear interpolation
        const t = (length - outlineMin) / (outlineMax - outlineMin);
        scaledOutlinePasses = Math.round(t * (config.outlinePasses || 1));
      }
    }

    // Generate offset passes for this path
    // Note: generatePasses expects individual parameters, not an object
    // Scale mm-based parameters to viewBox units
    const result = generatePasses(
      path.d,                 // pathData
      passCount,              // passes (number)
      (config.baseOffset || 0.25) * mmToViewBox,      // baseOffset
      (config.noise || 0) * mmToViewBox,           // noise
      null,                   // seed (auto-generate)
      `path-${i}`,           // pathId
      envelope,               // offsetEnvelope
      true,                   // useNormalMode
      (config.noiseFrequency || 50) * mmToViewBox,  // noiseFrequency
      (config.sampleRate || 2) * mmToViewBox,      // sampleRate
      config.fillMode || 'offset',  // fillMode
      modeOptions,            // crosshatchOptions (or mode-specific options)
      config.addOutline || false,  // extractOutline
      config.stripeFilled || 1,  // stripeFilled
      config.stripeEmpty || 1,   // stripeEmpty
      (config.outlineOffset || 0.25) * mmToViewBox,  // outlineOffset
      scaledOutlinePasses        // outlinePasses (scaled by path length)
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
        layerId: path.layerId,
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
        layerId: path.layerId,
        isOutline: true,
        // SVG display attributes for rendering and export
        fill: 'none',
        stroke: 'red',
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

    // Check for cancellation after each chunk
    if (signal && signal.aborted) {
      console.log('Processing cancelled by user');
      throw new DOMException('Processing cancelled', 'AbortError');
    }
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
