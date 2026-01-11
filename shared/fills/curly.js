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
    // Common geometry options
    baseOffset = 0.25,
    envelope = 'flat',
    maxWidth = curlyMaxWidth ?? defaults.curlyMaxWidth,
    minWidth = 0.0,
    sampleRate = 0.5,
    noise = 0,
    seed = null,
    pathId = 'path',
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

      // Calculate turn signal using wider window for meaningful curvature
      const turnWindow = Math.max(5, sampleRate * 8);
      const turnPrevDist = Math.max(0, dist - turnWindow);
      const turnNextDist = Math.min(totalLength, dist + turnWindow);
      const turnPrevPt = getPointAtLength(absolutePath, turnPrevDist);
      const turnNextPt = getPointAtLength(absolutePath, turnNextDist);

      if (turnPrevPt && turnNextPt) {
        const turnDx = turnNextPt.x - turnPrevPt.x;
        const turnDy = turnNextPt.y - turnPrevPt.y;
        const turnLen = Math.hypot(turnDx, turnDy);

        const windowTx = turnLen > 1e-6 ? turnDx / turnLen : point.tx;
        const windowTy = turnLen > 1e-6 ? turnDy / turnLen : point.ty;

        // Compare against previous point's tangent
        const prevPoint = centerline[centerline.length - 1];
        if (prevPoint?.tx !== undefined) {
          const cross = prevPoint.tx * windowTy - prevPoint.ty * windowTx;
          const dot = prevPoint.tx * windowTx + prevPoint.ty * windowTy;
          const angle = Math.atan2(cross, dot);
          point.turn = Math.sign(angle) * Math.min(1, Math.abs(angle) / 0.1);
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

    if (centerline.length < 2) {
      return paths;
    }

    // Generate curly paths (one per strand)
    for (let strandIdx = 0; strandIdx < resolvedStrands; strandIdx++) {
      const strandPhase = strandIdx * resolvedStrandPhaseOffset * Math.PI * 2;
      const curlyPoints = [];

      for (let i = 0; i < centerline.length; i++) {
        const point = centerline[i];
        const width = point.localWidth;
        const dist = point.distance;

        // If width is below threshold, follow centerline
        if (width < resolvedMinWidthThreshold) {
          curlyPoints.push({
            x: point.x,
            y: point.y
          });
          continue;
        }

        // Calculate loop phase based on distance traveled
        const loopsPerMm = resolvedLoopFrequency / 10;
        const basePhase = (dist * loopsPerMm * Math.PI * 2) + strandPhase;

        // Dynamic modulation - adds organic variation to amplitude and phase
        let ampMod = 1.0;
        let phaseMod = 0;
        if (resolvedDynamicModulation > 0) {
          const modulationScale = 30;
          const noiseSeed = seed !== null ? seed : pathId.length;
          const mod = simpleNoise(dist / modulationScale, noiseSeed + 500);
          ampMod = 1 + resolvedDynamicModulation * 0.5 * mod;
          phaseMod = resolvedDynamicModulation * 0.6 * mod;
        }

        const phase = basePhase + phaseMod;

        // Calculate loop offset using circular motion
        const loopRadius = width * resolvedLoopAmplitude * 0.5 * ampMod;
        const normalOffset = Math.sin(phase) * loopRadius;
        const tangentScale = resolvedLoopStyle === 'elliptical' ? 0.6 : 1.0;

        // Slant: shear tangent by normal for constant tilt
        const slant = Math.tan((resolvedSlantAngle * Math.PI) / 180);
        const tangentOffset = Math.cos(phase) * loopRadius * tangentScale + slant * normalOffset;

        // Lean bias - shifts curls toward inside/outside of turns
        let leanBias = 0;
        if (resolvedLeanMode !== 'none' && resolvedLeanStrength > 0) {
          const leanDir = resolvedLeanMode === 'inside' ? 1 : -1;
          leanBias = resolvedLeanStrength * loopRadius * leanDir * (point.turn || 0);
        }

        // Apply offset in both normal and tangent directions
        const x = point.x + point.nx * (normalOffset + leanBias) + point.tx * tangentOffset;
        const y = point.y + point.ny * (normalOffset + leanBias) + point.ty * tangentOffset;

        // Add noise if specified
        let noiseOffsetX = 0;
        let noiseOffsetY = 0;
        if (noise > 0) {
          const noiseSeed = seed !== null ? seed : pathId.length;
          noiseOffsetX = simpleNoise(dist / 10 + strandIdx * 100, noiseSeed) * noise;
          noiseOffsetY = simpleNoise(dist / 10 + 1000 + strandIdx * 100, noiseSeed + 1) * noise;
        }

        curlyPoints.push({
          x: x + noiseOffsetX,
          y: y + noiseOffsetY
        });
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
};
