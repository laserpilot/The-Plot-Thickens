/**
 * Curly/Spring fill mode
 * Creates a telephone-cord or spring-like pattern following the path centerline
 */

import {
  pathToAbsolute,
  getTotalLength,
  getPointAtLength,
  getEnvelopePreset,
  simpleNoise,
  pointsToPath,
} from './_helpers.js';

/**
 * Default options for curly fill mode
 * This is the single source of truth for curly defaults
 */
export const defaults = {
  curlyLoopFrequency: 1.0,      // loops per 10mm
  curlyLoopAmplitude: 1.0,      // multiplier of envelope width (0.5-2.0)
  curlyOverlap: 0.3,            // 0-1, controls loop density/overlap
  curlyMinWidth: 0.5,           // mm - min width threshold for rendering loops
  curlyLoopStyle: 'circular',   // 'circular' or 'elliptical'
  curlyStrands: 1,              // number of parallel spring strands
  curlyStrandPhaseOffset: 0.5,  // 0-1, phase offset between strands
  curlyMaxWidth: 4.0,           // maximum envelope width (mm)
  curlyLeanMode: 'none',        // 'none', 'inside', 'outside' - lean into/out of turns
  curlyLeanStrength: 0.5,       // 0-1, how much to lean
  curlyDynamicModulation: 0,    // 0-1, amplitude/phase variation along path
  curlySlantAngle: 0,           // degrees, constant forward/backward tilt (-60 to 60)
  curlyCompressionMode: 'none', // 'none', 'curvature', 'periodic', 'both' - tonal modulation
  curlyCompressionAmount: 0.5,  // 0-1, intensity of compression effect
  curlyPeriodicWavelength: 50,  // mm - wavelength of periodic compression cycle
  curlyCompressionInvert: false, // flip compression/expansion direction
  curlyCurvatureSensitivity: 1.0, // 0.5-5, scales curvature detection window
};

/**
 * Generate a continuous curly/spring fill that loops along the path
 * Creates a telephone-cord or spring-like pattern following the centerline
 *
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>} Array of SVG path data strings (one per strand)
 */
export function generate(pathData, options = {}) {
  const {
    // Curly-specific options (use defaults from above)
    loopFrequency = defaults.curlyLoopFrequency,
    loopAmplitude = defaults.curlyLoopAmplitude,
    overlap = defaults.curlyOverlap,
    minWidthThreshold = defaults.curlyMinWidth,
    loopStyle = defaults.curlyLoopStyle,
    strands = defaults.curlyStrands,
    strandPhaseOffset = defaults.curlyStrandPhaseOffset,
    leanMode = defaults.curlyLeanMode,
    leanStrength = defaults.curlyLeanStrength,
    dynamicModulation = defaults.curlyDynamicModulation,
    slantAngle = defaults.curlySlantAngle,
    compressionMode = defaults.curlyCompressionMode,
    compressionAmount = defaults.curlyCompressionAmount,
    periodicWavelength = defaults.curlyPeriodicWavelength,
    compressionInvert = defaults.curlyCompressionInvert,
    curvatureSensitivity = defaults.curlyCurvatureSensitivity,
    // Aliased options (support both curly* and non-prefixed names)
    curlyLoopFrequency,
    curlyLoopAmplitude,
    curlyOverlap,
    curlyMinWidth,
    curlyLoopStyle,
    curlyStrands,
    curlyStrandPhaseOffset,
    curlyMaxWidth,
    curlyLeanMode,
    curlyLeanStrength,
    curlyDynamicModulation,
    curlySlantAngle,
    curlyCompressionMode,
    curlyCompressionAmount,
    curlyPeriodicWavelength,
    curlyCompressionInvert,
    curlyCurvatureSensitivity,
    // Common geometry options
    baseOffset = 0.25,
    envelope = 'flat',
    maxWidth = curlyMaxWidth ?? defaults.curlyMaxWidth,
    minWidth = 0.0,
    sampleRate = 0.5,
    noise = 0,
    seed = null,
    pathId = 'path',
    unitScale = 1.0,  // scale factor for mm-based internal constants (viewBox units / mm)
  } = options;

  // Resolve curly-prefixed vs non-prefixed options
  const resolvedLoopFrequency = curlyLoopFrequency ?? loopFrequency;
  const resolvedLoopAmplitude = curlyLoopAmplitude ?? loopAmplitude;
  const resolvedMinWidthThreshold = curlyMinWidth ?? minWidthThreshold;
  const resolvedLoopStyle = curlyLoopStyle ?? loopStyle;
  const resolvedStrands = curlyStrands ?? strands;
  const resolvedStrandPhaseOffset = curlyStrandPhaseOffset ?? strandPhaseOffset;
  const resolvedLeanMode = curlyLeanMode ?? leanMode;
  const resolvedLeanStrength = curlyLeanStrength ?? leanStrength;
  const resolvedDynamicModulation = curlyDynamicModulation ?? dynamicModulation;
  const resolvedSlantAngle = curlySlantAngle ?? slantAngle;
  const resolvedCompressionMode = curlyCompressionMode ?? compressionMode;
  const resolvedCompressionAmount = curlyCompressionAmount ?? compressionAmount;
  const resolvedPeriodicWavelength = curlyPeriodicWavelength ?? periodicWavelength;
  const resolvedCompressionInvert = curlyCompressionInvert ?? compressionInvert;
  const resolvedCurvatureSensitivity = curlyCurvatureSensitivity ?? curvatureSensitivity;

  const paths = [];

  try {
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return paths;
    }

    // Get envelope function
    const envelopeFn = getEnvelopePreset(envelope);

    // Sample path to get centerline points with normals
    const centerline = [];

    for (let dist = 0; dist <= totalLength; dist += sampleRate) {
      const point = getPointAtLength(absolutePath, dist);

      if (!point || isNaN(point.x) || isNaN(point.y)) {
        break;
      }

      // Calculate tangent using centered, larger delta for stability
      const delta = Math.min(sampleRate, totalLength * 0.01);
      const prevDist = Math.max(0, dist - delta);
      const nextDist = Math.min(totalLength, dist + delta);
      const prevPt = getPointAtLength(absolutePath, prevDist);
      const nextPt = getPointAtLength(absolutePath, nextDist);

      if (prevPt && nextPt && !isNaN(prevPt.x) && !isNaN(nextPt.x)) {
        const dx = nextPt.x - prevPt.x;
        const dy = nextPt.y - prevPt.y;
        const len = Math.hypot(dx, dy);

        if (len > 1e-6) {
          // Tangent is along the path direction
          point.tx = dx / len;
          point.ty = dy / len;
          // Normal is perpendicular to tangent
          point.nx = -dy / len;
          point.ny = dx / len;
        } else {
          // Keep previous tangent if available
          const prev = centerline[centerline.length - 1];
          point.tx = prev?.tx ?? 1;
          point.ty = prev?.ty ?? 0;
          point.nx = prev?.nx ?? 0;
          point.ny = prev?.ny ?? 1;
        }
      } else {
        const prev = centerline[centerline.length - 1];
        point.tx = prev?.tx ?? 1;
        point.ty = prev?.ty ?? 0;
        point.nx = prev?.nx ?? 0;
        point.ny = prev?.ny ?? 1;
      }

      // Calculate turn signal only when curvature-based compression is enabled
      // Optimized: only 2 getPointAtLength calls instead of 4
      const needsCurvature = resolvedCompressionMode === 'curvature' || resolvedCompressionMode === 'both' ||
                             resolvedLeanMode !== 'none';

      if (needsCurvature) {
        // Compare tangents at two window positions using vectors through current point
        // User-controllable sensitivity: smaller = more local/responsive, larger = smoother
        const baseTurnWindow = Math.max(2 * unitScale, sampleRate * 4);
        const turnWindow = baseTurnWindow * resolvedCurvatureSensitivity;
        const turnPrevDist = Math.max(0, dist - turnWindow);
        const turnNextDist = Math.min(totalLength, dist + turnWindow);

        const prevPt = getPointAtLength(absolutePath, turnPrevDist);
        const nextPt = getPointAtLength(absolutePath, turnNextDist);
        const currPt = point;  // already have this

        if (prevPt && nextPt) {
          // Vector from prev to current
          const v1x = currPt.x - prevPt.x;
          const v1y = currPt.y - prevPt.y;
          const v1len = Math.hypot(v1x, v1y);

          // Vector from current to next
          const v2x = nextPt.x - currPt.x;
          const v2y = nextPt.y - currPt.y;
          const v2len = Math.hypot(v2x, v2y);

          if (v1len > 1e-6 && v2len > 1e-6) {
            // Normalize
            const t1x = v1x / v1len, t1y = v1y / v1len;
            const t2x = v2x / v2len, t2y = v2y / v2len;

            // Angle between them - lower threshold (0.03 rad ≈ 1.7°) for sensitivity on gentle curves
            const cross = t1x * t2y - t1y * t2x;
            const dot = t1x * t2x + t1y * t2y;
            const angle = Math.atan2(cross, dot);
            point.turn = Math.sign(angle) * Math.min(1, Math.abs(angle) / 0.03);
          } else {
            point.turn = 0;
          }
        } else {
          point.turn = 0;
        }
      } else {
        point.turn = 0;
      }

      // Calculate envelope width at this position
      const t = dist / totalLength;
      const envelopeMultiplier = envelopeFn(pathId, t);
      point.localWidth = minWidth + envelopeMultiplier * (maxWidth - minWidth);
      point.distance = dist;

      centerline.push(point);
    }

    // Smooth turn signal to reduce noise from coarse sampling
    // This helps lean calculations when sample rate is coarse relative to loop frequency
    for (let i = 1; i < centerline.length - 1; i++) {
      const prev = centerline[i - 1].turn || 0;
      const curr = centerline[i].turn || 0;
      const next = centerline[i + 1].turn || 0;
      centerline[i].smoothedTurn = 0.25 * prev + 0.5 * curr + 0.25 * next;
    }
    // Handle endpoints
    if (centerline.length > 0) {
      centerline[0].smoothedTurn = centerline[0].turn || 0;
      if (centerline.length > 1) {
        centerline[centerline.length - 1].smoothedTurn = centerline[centerline.length - 1].turn || 0;
      }
    }

    if (centerline.length < 2) {
      return paths;
    }

    // Base loop frequency
    const loopsPerMm = resolvedLoopFrequency / 10;

    // Generate curly paths (one per strand)
    for (let strandIdx = 0; strandIdx < resolvedStrands; strandIdx++) {
      const strandPhase = strandIdx * resolvedStrandPhaseOffset * Math.PI * 2;
      const curlyPoints = [];

      // Phase integration state - for smooth, continuous phase across compression changes
      let accumulatedPhase = strandPhase;
      let prevCompressionFactor = 1.0;
      let prevEffectiveLoopsPerMm = loopsPerMm;
      let prevDist = 0;
      let prevLeanBias = 0;  // For smoothing lean transitions

      for (let i = 0; i < centerline.length; i++) {
        const point = centerline[i];
        const nextPoint = centerline[i + 1];
        const width = point.localWidth;
        const dist = point.distance;

        // If width is below threshold, follow centerline
        if (width < resolvedMinWidthThreshold) {
          curlyPoints.push({ x: point.x, y: point.y });
          prevDist = dist;
          continue;
        }

        // Compute raw compression factor
        // Higher compression = tighter loops (more ink density = darker)
        let rawCompression = 1.0;
        if (resolvedCompressionMode === 'curvature' || resolvedCompressionMode === 'both') {
          // Linear response for more predictable control
          const curvatureSignal = Math.abs(point.turn || 0);
          rawCompression *= 1 + resolvedCompressionAmount * curvatureSignal;
        }
        if (resolvedCompressionMode === 'periodic' || resolvedCompressionMode === 'both') {
          const periodicPhase = (2 * Math.PI * dist) / (resolvedPeriodicWavelength * unitScale);
          rawCompression *= 1 + resolvedCompressionAmount * 0.5 * Math.sin(periodicPhase);
        }

        // Clamp first to stay in valid range before potential invert
        rawCompression = Math.max(0.5, Math.min(2.0, rawCompression));

        // Invert via reciprocal: 2 -> 0.5 (looser), 0.5 -> 2 (tighter)
        if (resolvedCompressionInvert) {
          rawCompression = 1 / rawCompression;
        }

        // Stronger smoothing (70% previous, 30% new) to prevent jumps, tighter clamp range
        const compressionFactor = Math.max(0.5, Math.min(2.5,
          0.7 * prevCompressionFactor + 0.3 * rawCompression));
        prevCompressionFactor = compressionFactor;

        // Determine how many sub-samples needed for this segment
        // Target ~8 samples per loop even at high compression
        const effectiveLoopsPerMm = loopsPerMm * compressionFactor;
        const segmentLength = nextPoint ? (nextPoint.distance - dist) : sampleRate;
        const loopsInSegment = effectiveLoopsPerMm * segmentLength;
        const subSamples = Math.max(1, Math.ceil(loopsInSegment * 8));

        for (let sub = 0; sub < subSamples; sub++) {
          const t = sub / subSamples;  // 0 to just under 1
          const subDist = dist + t * segmentLength;

          // Interpolate point properties when between centerline samples
          let interpPoint;
          if (nextPoint && t > 0) {
            interpPoint = {
              x: point.x + t * (nextPoint.x - point.x),
              y: point.y + t * (nextPoint.y - point.y),
              tx: point.tx + t * (nextPoint.tx - point.tx),
              ty: point.ty + t * (nextPoint.ty - point.ty),
              nx: point.nx + t * (nextPoint.nx - point.nx),
              ny: point.ny + t * (nextPoint.ny - point.ny),
            };
            // Normalize interpolated tangent/normal
            const tLen = Math.hypot(interpPoint.tx, interpPoint.ty);
            if (tLen > 1e-6) { interpPoint.tx /= tLen; interpPoint.ty /= tLen; }
            const nLen = Math.hypot(interpPoint.nx, interpPoint.ny);
            if (nLen > 1e-6) { interpPoint.nx /= nLen; interpPoint.ny /= nLen; }
          } else {
            interpPoint = point;
          }

          // Integrate phase using average of current/previous effective frequency
          const avgLoopsPerMm = 0.5 * (prevEffectiveLoopsPerMm + effectiveLoopsPerMm);
          const distDelta = subDist - prevDist;
          accumulatedPhase += avgLoopsPerMm * distDelta * Math.PI * 2;
          prevDist = subDist;
          prevEffectiveLoopsPerMm = effectiveLoopsPerMm;

          // Dynamic modulation - adds organic variation to amplitude and phase
          let ampMod = 1.0;
          let phaseMod = 0;
          if (resolvedDynamicModulation > 0) {
            const modulationScale = 30 * unitScale;
            const noiseSeed = seed !== null ? seed : pathId.length;
            const mod = simpleNoise(subDist / modulationScale, noiseSeed + 500);
            ampMod = 1 + resolvedDynamicModulation * 0.5 * mod;
            phaseMod = resolvedDynamicModulation * 0.6 * mod;
          }

          const phase = accumulatedPhase + phaseMod;

          // Interpolate width for sub-samples
          const interpWidth = nextPoint
            ? point.localWidth + t * (nextPoint.localWidth - point.localWidth)
            : point.localWidth;

          // Calculate loop offset using circular motion
          const loopRadius = interpWidth * resolvedLoopAmplitude * 0.5 * ampMod;
          const normalOffset = Math.sin(phase) * loopRadius;
          const tangentScale = resolvedLoopStyle === 'elliptical' ? 0.6 : 1.0;

          // Slant: shear tangent by normal for constant tilt
          const slant = Math.tan((resolvedSlantAngle * Math.PI) / 180);
          const tangentOffset = Math.cos(phase) * loopRadius * tangentScale + slant * normalOffset;

          // Lean bias - shifts curls toward inside/outside of turns
          // Uses smoothedTurn to reduce noise from coarse centerline sampling
          let leanBias = 0;
          if (resolvedLeanMode !== 'none' && resolvedLeanStrength > 0) {
            const interpTurn = nextPoint
              ? (point.smoothedTurn || 0) + t * ((nextPoint.smoothedTurn ?? point.smoothedTurn ?? 0) - (point.smoothedTurn || 0))
              : (point.smoothedTurn || 0);
            const leanDir = resolvedLeanMode === 'inside' ? 1 : -1;
            leanBias = resolvedLeanStrength * loopRadius * leanDir * interpTurn;
            // Smooth lean to prevent jumps from interpolated turn noise
            leanBias = 0.6 * prevLeanBias + 0.4 * leanBias;
            prevLeanBias = leanBias;
          }

          // Apply offset in both normal and tangent directions
          const x = interpPoint.x + interpPoint.nx * (normalOffset + leanBias) + interpPoint.tx * tangentOffset;
          const y = interpPoint.y + interpPoint.ny * (normalOffset + leanBias) + interpPoint.ty * tangentOffset;

          // Add noise if specified
          let noiseOffsetX = 0;
          let noiseOffsetY = 0;
          if (noise > 0) {
            const noiseSeed = seed !== null ? seed : pathId.length;
            const noiseScale = 10 * unitScale;
            noiseOffsetX = simpleNoise(subDist / noiseScale + strandIdx * 100, noiseSeed) * noise;
            noiseOffsetY = simpleNoise(subDist / noiseScale + 1000 + strandIdx * 100, noiseSeed + 1) * noise;
          }

          curlyPoints.push({
            x: x + noiseOffsetX,
            y: y + noiseOffsetY
          });
        }
      }

      // Convert points to SVG path
      if (curlyPoints.length > 1) {
        paths.push(pointsToPath(curlyPoints));
      }
    }

  } catch (error) {
    console.error(`Error generating curly fill for path ${pathId}:`, error);
  }

  return paths;
}

/**
 * Optional schema for UI automation (future use)
 */
export const schema = {
  curlyLoopFrequency: { type: 'number', min: 0.1, max: 5.0, step: 0.1, label: 'Loop Frequency', unit: 'per 10mm' },
  curlyLoopAmplitude: { type: 'number', min: 0.1, max: 2.0, step: 0.1, label: 'Loop Amplitude' },
  curlyStrands: { type: 'number', min: 1, max: 5, step: 1, label: 'Strands' },
  curlyStrandPhaseOffset: { type: 'number', min: 0, max: 1, step: 0.1, label: 'Strand Phase Offset' },
  curlyMinWidth: { type: 'number', min: 0, max: 2, step: 0.1, label: 'Min Width Threshold', unit: 'mm' },
  curlyMaxWidth: { type: 'number', min: 0.5, max: 10, step: 0.5, label: 'Max Width', unit: 'mm' },
  curlyLoopStyle: { type: 'select', options: ['circular', 'elliptical'], label: 'Loop Style' },
  curlyLeanMode: { type: 'select', options: ['none', 'inside', 'outside'], label: 'Lean Mode' },
  curlyLeanStrength: { type: 'number', min: 0, max: 1, step: 0.1, label: 'Lean Strength' },
  curlyDynamicModulation: { type: 'number', min: 0, max: 1, step: 0.1, label: 'Dynamic Modulation' },
  curlySlantAngle: { type: 'number', min: -60, max: 60, step: 5, label: 'Slant Angle', unit: 'degrees' },
  curlyCompressionMode: { type: 'select', options: ['none', 'curvature', 'periodic', 'both'], label: 'Compression Mode' },
  curlyCompressionAmount: { type: 'number', min: 0, max: 1, step: 0.1, label: 'Compression Amount' },
  curlyPeriodicWavelength: { type: 'number', min: 10, max: 200, step: 5, label: 'Periodic Wavelength', unit: 'mm' },
  curlyCompressionInvert: { type: 'checkbox', label: 'Invert Compression' },
  curlyCurvatureSensitivity: { type: 'number', min: 0.5, max: 5, step: 0.5, label: 'Curvature Sensitivity' },
};
