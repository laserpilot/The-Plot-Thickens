/**
 * Braid Engine - Pure JS module for generating rhombus braid patterns
 *
 * This module generates braid geometry from a backbone path and parameters.
 * It is DOM-free and suitable for both browser and Node.js environments.
 *
 * @module braid-engine
 */

// ============================================================================
// Constants
// ============================================================================

const BASE_ZIGZAG_AMPLITUDE = 30;
const BASE_WALL_WIDTH = 50;
const WALL_SEPARATION_DEFAULT = 100;

// ============================================================================
// Utility Functions
// ============================================================================

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeVector(vec) {
  const len = Math.hypot(vec.x, vec.y) || 1;
  return { x: vec.x / len, y: vec.y / len };
}

function blendDirection(sourceDir, targetDir, bias) {
  const mixed = {
    x: sourceDir.x * (1 - bias) + targetDir.x * bias,
    y: sourceDir.y * (1 - bias) + targetDir.y * bias
  };
  return normalizeVector(mixed);
}

/**
 * Quadratic Bezier curve point calculation
 */
function quadraticPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
  };
}

/**
 * Triangle wave for sharp pointy zigzag peaks
 */
function triangleWave(t) {
  const normalized = ((t / Math.PI) % 2 + 2) % 2;
  if (normalized < 1) {
    return normalized * 2 - 1;
  } else {
    return 1 - (normalized - 1) * 2;
  }
}

/**
 * Calculate arc lengths for a polyline
 */
function calculateArcLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
  }
  return lengths;
}

/**
 * Sample a curve at specific arc length using precomputed lengths
 */
function sampleCurveByArcLength(rail, lengths, param) {
  if (!rail || rail.length === 0) return { x: 0, y: 0 };
  if (rail.length === 1) return { ...rail[0] };

  const totalLength = lengths[lengths.length - 1];
  const targetLength = clamp(param, 0, 1) * totalLength;

  for (let i = 0; i < rail.length - 1; i++) {
    const lenA = lengths[i];
    const lenB = lengths[i + 1];

    if (targetLength >= lenA && targetLength <= lenB) {
      const segmentLength = lenB - lenA;
      const t = segmentLength > 0 ? (targetLength - lenA) / segmentLength : 0;
      const a = rail[i];
      const b = rail[i + 1];
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
      };
    }
  }

  return { ...rail[rail.length - 1] };
}

// ============================================================================
// Wave Generation Functions
// ============================================================================

function zigzagWave(y, params) {
  const { frequency, cycleJitter, zigzagPhase = 0 } = params;
  const phaseRad = (zigzagPhase * Math.PI) / 180;
  let phase = phaseRad;

  if (cycleJitter > 0) {
    const cycleIndex = Math.floor((y / params.braidLength) * frequency);
    const seed = cycleIndex * 9999;
    const pseudoRandom = Math.abs(Math.sin(seed)) * 2 - 1;
    phase += pseudoRandom * cycleJitter * Math.PI;
  }

  const cycles = frequency;
  const t = (y / params.braidLength) * cycles * Math.PI + phase;
  // Use triangle wave for sharp pointy peaks instead of sine
  return triangleWave(t);
}

function bounceWave(angle, phase, bounceFreq) {
  const modulatedAngle = angle * bounceFreq + phase;
  // |sin(x)| creates a bounce pattern that always pushes outward from baseline
  return Math.abs(Math.sin(modulatedAngle));
}

function getTipTaperScale(y, params) {
  const { braidLength, tipTaper } = params;
  if (tipTaper === 0) return 1;
  const period = braidLength / params.frequency;
  const localY = y % period;
  const halfPeriod = period / 2;
  const distFromPeak = Math.abs(localY - halfPeriod);
  const t = distFromPeak / halfPeriod;
  return 1 - tipTaper * (1 - t);
}

function generateCenterX(y, params) {
  const wave = zigzagWave(y, params);
  const amplitude = BASE_ZIGZAG_AMPLITUDE * (params.zigzagScale || 1);
  const taper = getTipTaperScale(y, params);
  return wave * amplitude * taper;
}

function generateWallX(y, side, params) {
  const { leftWallPhase = 0, rightWallPhase = 0, wallScale, wallSeparation = WALL_SEPARATION_DEFAULT, wallFrequency, frequency } = params;
  // Use wallFrequency if provided, otherwise fall back to frequency
  const wFreq = wallFrequency ?? frequency;
  const angle = (y / params.braidLength) * wFreq * Math.PI;
  const sidePhase = side === 'left' ? leftWallPhase : rightWallPhase;
  const phase = (sidePhase * Math.PI) / 180;
  // bounceFreq of 1 since we're using |sin(x)| directly
  const envelope = bounceWave(angle, phase, 1);
  const amplitude = BASE_WALL_WIDTH * wallScale;
  const translationSign = side === 'left' ? -1 : 1;
  const translation = translationSign * wallSeparation * 0.5;
  const base = translationSign * envelope * amplitude + translation;
  const taper = getTipTaperScale(y, params);
  return base * taper;
}

// ============================================================================
// Sampling Functions
// ============================================================================

function sampleBoundary(generator, params) {
  const samples = [];
  const { braidLength, sampleSpacing } = params;
  const count = Math.max(5, Math.ceil(braidLength / sampleSpacing));
  for (let i = 0; i <= count; i++) {
    const y = (i / count) * braidLength;
    samples.push({ x: generator(y, params), y, index: i });
  }
  return samples;
}

function interpolateSamplesAt(samples, targetY) {
  if (!samples || samples.length === 0) return { x: 0, y: targetY };
  if (targetY <= samples[0].y) return { x: samples[0].x, y: targetY };
  if (targetY >= samples[samples.length - 1].y) {
    return { x: samples[samples.length - 1].x, y: targetY };
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (targetY >= a.y && targetY <= b.y) {
      const t = (targetY - a.y) / (b.y - a.y);
      return {
        x: a.x + (b.x - a.x) * t,
        y: targetY
      };
    }
  }
  return { x: samples[0].x, y: targetY };
}

// ============================================================================
// Detection Functions
// ============================================================================

function detectExtrema(samples) {
  const extrema = [];
  for (let i = 1; i < samples.length - 1; i++) {
    const prevDx = samples[i].x - samples[i - 1].x;
    const nextDx = samples[i + 1].x - samples[i].x;
    if (prevDx === 0 || nextDx === 0) continue;
    if (prevDx * nextDx < 0) {
      extrema.push({
        ...samples[i],
        type: prevDx > 0 ? 'peak' : 'trough'
      });
    }
  }
  return extrema;
}

function estimateTangent(samples, index) {
  const prev = samples[Math.max(0, index - 1)];
  const next = samples[Math.min(samples.length - 1, index + 1)];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: dx / len,
    y: dy / len
  };
}

function findWallPartner(centerExt, wallExtrema, side, params) {
  const searchWindow = params.diagonalSearchWindow || 0;
  let bestMatch = null;
  let minDist = Infinity;

  // With |sin(x)| walls, we want to connect to where wall is CLOSEST to center
  // Left wall: 'peak' is closest to center (least negative x)
  // Right wall: 'trough' is closest to center (least positive x)
  const targetType = side === 'left' ? 'peak' : 'trough';

  for (const wallExt of wallExtrema) {
    if (wallExt.claimed) continue;
    if (wallExt.type !== targetType) continue;

    const dy = wallExt.y - centerExt.y;
    if (searchWindow > 0) {
      if (Math.abs(dy) > searchWindow) continue;
    }

    const dist = Math.abs(dy);
    if (dist < minDist) {
      minDist = dist;
      bestMatch = wallExt;
    }
  }

  return bestMatch;
}

// ============================================================================
// Warp Functions
// ============================================================================

function createWarpFunction(backbone, braidLength) {
  if (!backbone) {
    return (point) => point;
  }

  return (point) => {
    const t = clamp(point.y / braidLength, 0, 1);
    const base = backbone.getPointAt(t);
    const tangent = backbone.getTangentAt(t);
    const normal = { x: -tangent.y, y: tangent.x };
    return {
      x: base.x + point.x * normal.x,
      y: base.y + point.x * normal.y
    };
  };
}

// ============================================================================
// Continuation Pairing
// ============================================================================

function buildContinuationPairs(leftSamples, rightSamples, centerSamples, centerExtrema, leftExtrema, rightExtrema, params) {
  const pairs = [];

  centerExtrema.forEach((tip) => {
    if (tip.paired) return;

    const side = tip.x >= 0 ? 'right' : 'left';
    const wallSamples = side === 'left' ? leftSamples : rightSamples;
    const wallExtrema = side === 'left' ? leftExtrema : rightExtrema;

    const trough = findWallPartner(tip, wallExtrema, side, params);
    if (!trough) return;

    trough.claimed = true;
    tip.paired = true;

    // Build continuation curve (diagonal from trough to tip)
    const contLength = params.continuationLength || 80;
    const contBias = clamp(params.continuationBias ?? 0.7, 0, 1);

    const troughTan = estimateTangent(wallSamples, trough.index);
    const tipTan = estimateTangent(centerSamples, tip.index);

    const diagVec = normalizeVector({
      x: tip.x - trough.x,
      y: tip.y - trough.y
    });

    const startDir = blendDirection(troughTan, diagVec, contBias);
    const endDir = blendDirection(
      { x: -tipTan.x, y: -tipTan.y },
      { x: -diagVec.x, y: -diagVec.y },
      contBias
    );

    const handle1 = {
      x: trough.x + startDir.x * contLength,
      y: trough.y + startDir.y * contLength
    };
    const handle2 = {
      x: tip.x + endDir.x * contLength,
      y: tip.y + endDir.y * contLength
    };

    const continuationRail = [];
    const segmentCount = 24;
    for (let i = 0; i <= segmentCount; i++) {
      const t = i / segmentCount;
      const mt = 1 - t;
      const point = {
        x: mt * mt * mt * trough.x + 3 * mt * mt * t * handle1.x + 3 * mt * t * t * handle2.x + t * t * t * tip.x,
        y: mt * mt * mt * trough.y + 3 * mt * mt * t * handle1.y + 3 * mt * t * t * handle2.y + t * t * t * tip.y
      };
      continuationRail.push(point);
    }
    const continuationLengths = calculateArcLengths(continuationRail);

    // Build wall rail
    const wallRail = [];
    const wallSpan = tip.y - trough.y;
    const wallSegments = Math.max(8, Math.ceil(wallSpan / 6));
    for (let i = 0; i <= wallSegments; i++) {
      const ty = trough.y + wallSpan * (i / wallSegments);
      wallRail.push(interpolateSamplesAt(wallSamples, ty));
    }
    const wallLengths = calculateArcLengths(wallRail);

    // Build center rail
    const centerRail = [];
    const centerSpan = tip.y - trough.y;
    const centerSegments = Math.max(8, Math.ceil(centerSpan / 6));
    for (let i = 0; i <= centerSegments; i++) {
      const ty = trough.y + centerSpan * (i / centerSegments);
      centerRail.push(interpolateSamplesAt(centerSamples, ty));
    }
    const centerLengths = calculateArcLengths(centerRail);

    // Build landing rail (from tip forward to next extremum)
    const centerTips = centerExtrema.filter(e => e.type === 'peak' || e.type === 'trough');
    const tipIndexInList = centerTips.findIndex(e => e.index === tip.index);
    const nextTipY = tipIndexInList < centerTips.length - 1
      ? centerTips[tipIndexInList + 1].y
      : tip.y + centerSpan;

    const landingRail = [];
    const landingSpan = nextTipY - tip.y;
    const landingSegments = Math.max(8, Math.ceil(landingSpan / 6));
    for (let i = 0; i <= landingSegments; i++) {
      const ty = tip.y + landingSpan * (i / landingSegments);
      landingRail.push(interpolateSamplesAt(centerSamples, ty));
    }
    const landingLengths = calculateArcLengths(landingRail);

    pairs.push({
      side,
      wall: trough,
      center: tip,
      tipIndex: tip.index,
      yStart: trough.y,
      yEnd: tip.y,
      wallRail,
      wallLengths,
      centerRail,
      centerLengths,
      diagRail: continuationRail,
      diagLengths: continuationLengths,
      landingRail,
      landingLengths
    });
  });

  return pairs;
}

function assignSideOrdering(continuationPairs) {
  const left = continuationPairs.filter(p => p.side === 'left').sort((a, b) => a.tipIndex - b.tipIndex);
  const right = continuationPairs.filter(p => p.side === 'right').sort((a, b) => a.tipIndex - b.tipIndex);

  left.forEach((pair, i) => {
    pair.sideIndex = i;
  });
  right.forEach((pair, i) => {
    pair.sideIndex = i;
  });

  const leftCount = left.length;
  const rightCount = right.length;

  // Left side: connects to next wrung down on right
  for (let i = 0; i < leftCount; i++) {
    const targetIdx = Math.min(rightCount - 1, i + 1);
    if (right[targetIdx]) {
      left[i].oppositeLandingRail = right[targetIdx].landingRail;
      left[i].oppositeLandingLengths = right[targetIdx].landingLengths;
      left[i].oppositeIndex = right[targetIdx].sideIndex;
    }
  }

  // Right side: connects to same wrung on left
  for (let i = 0; i < rightCount; i++) {
    const targetIdx = Math.min(leftCount - 1, i);
    if (left[targetIdx]) {
      right[i].oppositeLandingRail = left[targetIdx].landingRail;
      right[i].oppositeLandingLengths = left[targetIdx].landingLengths;
      right[i].oppositeIndex = left[targetIdx].sideIndex;
    }
  }
}

// ============================================================================
// Fiber Generation
// ============================================================================

function buildFiberCurves(continuationPairs, leftSamples, rightSamples, centerSamples, params) {
  const curves = [];
  const spacing = Math.max(1, params.fiberSpacing || 8);
  const totalFibers = params.fiberCount
    ? Math.max(1, Math.round(params.fiberCount))
    : Math.max(3, Math.floor(spacing));
  const bias = clamp(params.fiberBias || 0, 0, 1);
  const landingOffset = clamp(params.fiberLanding ?? 0.0, 0, 1);
  const landingSpread = clamp(params.landingSpread ?? 1.0, 0.1, 1);
  const bowStrength = clamp(params.fiberBow ?? 0.5, 0, 1);

  continuationPairs.forEach(pair => {
    const diagRail = pair.diagRail || [];
    const diagLengths = pair.diagLengths || [];
    const wallRail = pair.wallRail || [];
    const wallLengths = pair.wallLengths || [];
    const landingRail = (pair.oppositeLandingRail && pair.oppositeLandingRail.length)
      ? pair.oppositeLandingRail
      : (pair.landingRail && pair.landingRail.length ? pair.landingRail : pair.centerRail);
    const landingLengths = pair.oppositeLandingLengths || pair.landingLengths || pair.centerLengths;

    // Guard against degenerate rails
    if (!diagRail.length || !diagLengths.length || !landingRail?.length || !landingLengths?.length) {
      return;
    }

    const diagTotalLength = diagLengths[diagLengths.length - 1] || 0;
    const landingTotalLength = landingLengths[landingLengths.length - 1] || 0;

    // Skip degenerate rails
    const minLength = spacing * 2;
    if (diagTotalLength < minLength || landingTotalLength < minLength) {
      return;
    }

    // Calculate proportional fiber count
    const maxFibersByLength = Math.floor(diagTotalLength / spacing);
    const effectiveFiberCount = Math.min(totalFibers, Math.max(1, maxFibersByLength));

    for (let i = 0; i < effectiveFiberCount; i++) {
      let fiberParam = (i + 1) / (effectiveFiberCount + 1);
      const ease = 0.5 - 0.5 * Math.cos(Math.PI * fiberParam);
      fiberParam = fiberParam + (ease - fiberParam) * (bias - 0.5) * 2;

      const originParam = fiberParam;
      const landingDirection = pair.side === 'left'
        ? (1 - fiberParam)
        : (1 - fiberParam);
      const landingParam = clamp(landingOffset + landingDirection * landingSpread, 0, 1);

      const originPoint = sampleCurveByArcLength(diagRail, diagLengths, originParam);
      const landingPoint = sampleCurveByArcLength(landingRail, landingLengths, landingParam);
      const wallPoint = sampleCurveByArcLength(wallRail, wallLengths, originParam);

      // Calculate outernessFactor (inverted so outer fibers curve more)
      const outernessFactor = 1 - fiberParam;

      // Direction toward wall
      let toWall = normalizeVector({
        x: wallPoint.x - originPoint.x,
        y: wallPoint.y - originPoint.y
      });
      if (!isFinite(toWall.x) || !isFinite(toWall.y)) {
        toWall = { x: 0, y: 0 };
      }

      // Apply gradient power curve
      const gradientPower = clamp(params.bowGradient ?? 2.0, 0.5, 4);
      const shapedFactor = Math.pow(outernessFactor, gradientPower);

      // Control point distance
      const controlPointDistance = bowStrength * shapedFactor * 100;

      // Place control point at midpoint, offset toward wall
      const midStraight = {
        x: originPoint.x + (landingPoint.x - originPoint.x) * 0.5,
        y: originPoint.y + (landingPoint.y - originPoint.y) * 0.5
      };

      const controlPoint = {
        x: midStraight.x + toWall.x * controlPointDistance,
        y: midStraight.y + toWall.y * controlPointDistance
      };

      // Generate bezier curve points
      const points = [];
      const segmentCount = 24;
      for (let j = 0; j <= segmentCount; j++) {
        const t = j / segmentCount;
        const point = quadraticPoint(originPoint, controlPoint, landingPoint, t);
        points.push(point);
      }

      curves.push({
        side: pair.side,
        points,
        pairIndex: pair.sideIndex ?? 0,
        targetPairIndex: pair.oppositeIndex ?? pair.sideIndex,
        fiberIndex: i
      });
    }
  });

  return curves;
}

// ============================================================================
// Main Generation Function
// ============================================================================

/**
 * Generate braid geometry from a backbone path and parameters
 *
 * @param {Object} backbone - Path with getPointAt(t) and getTangentAt(t) methods
 * @param {Object} params - Configuration parameters
 * @returns {Object} Generated braid with outlines, fibers, and metadata
 */
export function generateBraid(backbone, params) {
  // Fill in default parameters
  const frequency = params.frequency ?? 2.25;
  const wallFrequency = params.wallFrequency ?? frequency;
  const braidLength = params.braidLength ?? 800;

  // Adaptive sampling: use higher frequency to ensure enough samples for both waves
  const maxFreq = Math.max(frequency, wallFrequency);
  const wavelength = braidLength / maxFreq;
  // 40 samples per cycle ensures smooth waves even at high frequencies
  const adaptiveSampleSpacing = Math.min(2, wavelength / 40);

  const config = {
    frequency,
    wallFrequency,
    cycleJitter: params.cycleJitter ?? 0,
    zigzagScale: params.zigzagScale ?? 1.0,
    wallScale: params.wallScale ?? 1.0,
    tipTaper: params.tipTaper ?? 0.0,
    fiberCount: params.fiberCount ?? 10,
    fiberBias: params.fiberBias ?? 0.5,
    fiberLanding: params.fiberLanding ?? 0.0,
    fiberBow: params.fiberBow ?? 0.5,
    bowGradient: params.bowGradient ?? 2.0,
    // Internal parameters
    zigzagPhase: params.zigzagPhase ?? 0,
    leftWallPhase: params.leftWallPhase ?? 0,
    rightWallPhase: params.rightWallPhase ?? 0,
    sampleSpacing: params.sampleSpacing ?? adaptiveSampleSpacing,
    continuationLength: params.continuationLength ?? 20,
    continuationBias: params.continuationBias ?? 0.7,
    landingSpread: params.landingSpread ?? 1.0,
    wallSeparation: params.wallSeparation ?? 100,
    braidLength,
    diagonalSearchWindow: params.diagonalSearchWindow ?? 0,
    fiberSpacing: params.fiberSpacing ?? 3
  };

  // Sample the three boundaries
  const centerSamples = sampleBoundary(generateCenterX, config);
  const leftSamples = sampleBoundary((y, p) => generateWallX(y, 'left', p), config);
  const rightSamples = sampleBoundary((y, p) => generateWallX(y, 'right', p), config);

  // Detect extrema
  const centerExtrema = detectExtrema(centerSamples).map(ext => ({ ...ext, paired: false }));
  const leftExtrema = detectExtrema(leftSamples).map(ext => ({ ...ext, claimed: false }));
  const rightExtrema = detectExtrema(rightSamples).map(ext => ({ ...ext, claimed: false }));

  // Build continuation pairs
  const continuationPairs = buildContinuationPairs(
    leftSamples,
    rightSamples,
    centerSamples,
    centerExtrema,
    leftExtrema,
    rightExtrema,
    config
  );

  // Assign side ordering and opposite landing rails
  assignSideOrdering(continuationPairs);

  // Generate fiber curves
  const fiberCurves = buildFiberCurves(
    continuationPairs,
    leftSamples,
    rightSamples,
    centerSamples,
    config
  );

  // Create warp function
  const warpPoint = createWarpFunction(backbone, config.braidLength);

  // Build output structure
  const outlines = [];

  // Add center zigzag outline
  outlines.push({
    side: 'center',
    type: 'zigzag',
    points: centerSamples.map(warpPoint),
    index: 0
  });

  // Add wall outlines
  outlines.push({
    side: 'left',
    type: 'wall',
    points: leftSamples.map(warpPoint),
    index: 1
  });

  outlines.push({
    side: 'right',
    type: 'wall',
    points: rightSamples.map(warpPoint),
    index: 2
  });

  // Add continuation curves
  continuationPairs.forEach((pair, idx) => {
    outlines.push({
      side: pair.side,
      type: 'continuation',
      points: pair.diagRail.map(warpPoint),
      index: idx + 3
    });
  });

  // Warp fiber curves
  const fibers = fiberCurves.map(fiber => ({
    ...fiber,
    points: fiber.points.map(warpPoint)
  }));

  return {
    outlines,
    fibers,
    metadata: {
      braidLength: config.braidLength,
      centerExtremaCount: centerExtrema.length,
      leftTroughCount: leftExtrema.filter(e => e.type === 'trough').length,
      rightTroughCount: rightExtrema.filter(e => e.type === 'trough').length,
      continuationCount: continuationPairs.length,
      fiberCount: fibers.length,
      parameters: config
    }
  };
}

// Also export as default for convenience
export default { generateBraid };
