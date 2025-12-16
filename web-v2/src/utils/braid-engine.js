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

/**
 * Smoothstep easing function for smooth transitions
 */
function smoothstep(t) {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function normalizeVector(vec) {
  const len = Math.hypot(vec.x, vec.y) || 1;
  return { x: vec.x / len, y: vec.y / len };
}

function lerpVector(v1, v2, t) {
  return {
    x: v1.x + (v2.x - v1.x) * t,
    y: v1.y + (v2.y - v1.y) * t
  };
}

function rotateVector(v, angleDegrees) {
  const rad = angleDegrees * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos
  };
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

/**
 * Compute arc lengths along backbone for frequency adjustment
 */
function computeBackboneArcLengths(backbone, sampleCount = 200) {
  const points = [];
  for (let i = 0; i <= sampleCount; i++) {
    points.push(backbone.getPointAt(i / sampleCount));
  }
  return calculateArcLengths(points);
}

/**
 * Get frequency-adjusted Y coordinate based on backbone arc length
 */
function getFrequencyAdjustedY(y, braidLength, arcLengths) {
  const totalArcLength = arcLengths[arcLengths.length - 1];
  const t = clamp(y / braidLength, 0, 1);
  const idx = t * (arcLengths.length - 1);
  const i = Math.floor(idx);
  const frac = idx - i;
  const arcLen = arcLengths[i] + (arcLengths[Math.min(i + 1, arcLengths.length - 1)] - arcLengths[i]) * frac;
  return (arcLen / totalArcLength) * braidLength;
}

/**
 * Compute smoothed curvature along backbone
 */
function computeBackboneCurvature(backbone, braidLength, sampleCount = 100, smoothingWindow = 5) {
  const epsilon = 1e-4;
  const raw = [];

  // Compute raw curvature
  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const t0 = Math.max(0, t - epsilon);
    const t1 = Math.min(1, t + epsilon);

    const tan0 = backbone.getTangentAt(t0);
    const tan1 = backbone.getTangentAt(t1);

    let deltaAngle = Math.atan2(tan1.y, tan1.x) - Math.atan2(tan0.y, tan0.x);
    if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

    const p0 = backbone.getPointAt(t0);
    const p1 = backbone.getPointAt(t1);
    const arcLength = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const curvature = arcLength > 1e-6 ? deltaAngle / arcLength : 0;

    raw.push({ t, curvature });
  }

  // Apply moving average smoothing
  const smoothed = [];
  for (let i = 0; i < raw.length; i++) {
    let sum = 0, count = 0;
    for (let j = -smoothingWindow; j <= smoothingWindow; j++) {
      const idx = Math.max(0, Math.min(raw.length - 1, i + j));
      sum += raw[idx].curvature;
      count++;
    }
    smoothed.push({ t: raw[i].t, curvature: sum / count });
  }

  return smoothed;
}

/**
 * Get curvature at a specific t value by interpolating samples
 */
function getCurvatureAt(curvatureSamples, t) {
  if (!curvatureSamples || curvatureSamples.length === 0) return 0;
  const count = curvatureSamples.length - 1;
  const idx = clamp(t, 0, 1) * count;
  const i = Math.floor(idx);
  const frac = idx - i;
  const a = curvatureSamples[Math.min(i, count)];
  const b = curvatureSamples[Math.min(i + 1, count)];
  return a.curvature + (b.curvature - a.curvature) * frac;
}

/**
 * Calculate compression factor for a point based on curvature
 * Returns a value 0-1 where lower values mean more compression (fewer samples needed)
 * @param {number} x - X coordinate (negative = left, positive = right)
 * @param {number} curvature - Local curvature (positive = left turn, negative = right turn)
 * @param {number} wallSeparation - Width of the braid
 */
function getCompressionFactor(x, curvature, wallSeparation) {
  if (curvature === 0) return 1; // No compression on straight sections

  const radius = 1 / Math.abs(curvature);
  const halfWidth = wallSeparation / 2;

  // Determine if this point is on the inside of the curve
  // In screen coords (Y down): curvature > 0 = curving left, curvature < 0 = curving right
  // curvature > 0 (left turn) → right side (x > 0) is inside
  // curvature < 0 (right turn) → left side (x < 0) is inside
  const isInside = (curvature > 0 && x > 0) || (curvature < 0 && x < 0);

  if (!isInside) return 1; // Outside of curve - no compression

  // How far from center as a ratio of half-width
  const distanceRatio = Math.abs(x) / halfWidth;

  // How much the inner arc compresses relative to the centerline
  // Inner arc length = (radius - offset) * angle, centerline = radius * angle
  // Ratio = (radius - offset) / radius = 1 - offset/radius
  const offset = Math.abs(x);
  const compressionRatio = Math.max(0.1, 1 - offset / radius);

  // Blend based on how far from center (center has no compression)
  return 1 - (1 - compressionRatio) * distanceRatio;
}

/**
 * Redistribute strand positions to bias toward curve inside
 * @param {number} x_norm - Normalized x coordinate (-1 to 1)
 * @param {number} shift - Shift amount (-1 to 1), negative = bias left
 */
function redistribute(x_norm, shift) {
  // Clamp shift to safe range (prevents power going negative/zero)
  const safeShift = clamp(shift, -0.95, 0.95);

  // Ease shift to prevent overcompensation at low curvature
  const easedShift = safeShift * (2 - Math.abs(safeShift));

  const sign = Math.sign(x_norm);
  const t = Math.abs(x_norm);

  // Power-based redistribution
  // Positive shift compresses positive x (right), expands negative x (left)
  const power = sign > 0 ? (1 + easedShift) : (1 - easedShift);

  return Math.pow(t, power) * sign;
}

// ============================================================================
// Wave Generation Functions
// ============================================================================

// Pseudo-random function for consistent jitter per cycle
function cycleRandom(cycleIndex) {
  const seed = cycleIndex * 9999;
  return Math.abs(Math.sin(seed)) * 2 - 1;
}

function zigzagWave(y, params) {
  const { frequency, cycleJitter, zigzagPhase = 0 } = params;
  const phaseRad = (zigzagPhase * Math.PI) / 180;

  const cycles = frequency;
  const t = (y / params.braidLength) * cycles * Math.PI + phaseRad;
  let wave = triangleWave(t);

  // Apply amplitude jitter per cycle (makes links taller/shorter without discontinuities)
  if (cycleJitter > 0) {
    const cyclePos = (y / params.braidLength) * frequency;
    const cycleIndex = Math.floor(cyclePos);
    const cycleFrac = cyclePos - cycleIndex;

    // Get amplitude scale for current and next cycle (range: 1-jitter to 1+jitter)
    const jitter0 = 1 + cycleRandom(cycleIndex) * cycleJitter * 0.3;
    const jitter1 = 1 + cycleRandom(cycleIndex + 1) * cycleJitter * 0.3;

    // Smooth interpolation at cycle boundaries
    const smoothT = cycleFrac * cycleFrac * (3 - 2 * cycleFrac);
    const ampScale = jitter0 + (jitter1 - jitter0) * smoothT;

    wave *= ampScale;
  }

  return wave;
}

function bounceWave(angle, phase, bounceFreq) {
  const modulatedAngle = angle * bounceFreq + phase;
  // |sin(x)| creates a bounce pattern that always pushes outward from baseline
  return Math.abs(Math.sin(modulatedAngle));
}

/**
 * Calculate global taper scale for braid ends
 * Tapers smoothly from 0 at the ends to 1 at tipTaperLength distance from ends
 */
function getBraidTaperScale(y, params) {
  const { braidLength, tipTaper, tipTaperLength = 50 } = params;
  if (tipTaper === 0 || tipTaperLength <= 0) return 1;

  // Guard against very small taper lengths
  const safeTaperLength = Math.max(1, tipTaperLength);

  // Calculate distance from nearest end
  const distFromStart = y;
  const distFromEnd = braidLength - y;
  const distFromNearestEnd = Math.min(distFromStart, distFromEnd);

  // Normalized progress from end (0 at end, 1 at full distance)
  const t = clamp(distFromNearestEnd / safeTaperLength, 0, 1);

  // Apply smoothstep easing for smooth transition
  const easedT = smoothstep(t);

  // Scale: 0 at end (when tipTaper=1), 1 at full distance
  return 1 - tipTaper * (1 - easedT);
}

function generateCenterX(phaseY, actualY, params) {
  const wave = zigzagWave(phaseY, params);
  const amplitude = BASE_ZIGZAG_AMPLITUDE * (params.zigzagScale || 1);
  const taper = getBraidTaperScale(actualY, params);
  return wave * amplitude * taper;
}

function generateWallX(phaseY, actualY, side, params) {
  const { leftWallPhase = 0, rightWallPhase = 0, wallScale, wallSeparation = WALL_SEPARATION_DEFAULT, wallFrequency, frequency } = params;
  // Use wallFrequency if provided, otherwise fall back to frequency
  const wFreq = wallFrequency ?? frequency;
  const angle = (phaseY / params.braidLength) * wFreq * Math.PI;
  const sidePhase = side === 'left' ? leftWallPhase : rightWallPhase;
  const phase = (sidePhase * Math.PI) / 180;
  // bounceFreq of 1 since we're using |sin(x)| directly
  const envelope = bounceWave(angle, phase, 1);
  const amplitude = BASE_WALL_WIDTH * wallScale;
  const translationSign = side === 'left' ? -1 : 1;
  const translation = translationSign * wallSeparation * 0.5;

  // Apply taper to both amplitude AND translation separately
  // This makes walls collapse toward center at the braid ends
  const taper = getBraidTaperScale(actualY, params);
  const taperedAmplitude = translationSign * envelope * amplitude * taper;
  const taperedTranslation = translation * taper;

  return taperedAmplitude + taperedTranslation;
}

// ============================================================================
// Sampling Functions
// ============================================================================

function sampleBoundary(generator, params) {
  const samples = [];
  const { braidLength, sampleSpacing, arcLengths } = params;
  const count = Math.max(5, Math.ceil(braidLength / sampleSpacing));
  for (let i = 0; i <= count; i++) {
    const physicalY = (i / count) * braidLength;
    // Use arc-length adjusted Y for wave generation if backbone is curved
    const phaseY = arcLengths
      ? getFrequencyAdjustedY(physicalY, braidLength, arcLengths)
      : physicalY;
    // Pass both phaseY (for waves) and physicalY (for taper)
    samples.push({ x: generator(phaseY, physicalY, params), y: physicalY, index: i });
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

function createWarpFunction(backbone, braidLength, curvatureSamples = null, params = {}) {
  if (!backbone) {
    return (point) => point;
  }

  const { redistributionFactor = 0, wallSeparation = 100 } = params;

  return (point) => {
    const t = clamp(point.y / braidLength, 0, 1);
    const base = backbone.getPointAt(t);
    const tangent = backbone.getTangentAt(t);
    const normal = { x: -tangent.y, y: tangent.x };

    let adjustedX = point.x;

    // Apply curvature-based redistribution
    if (curvatureSamples && redistributionFactor > 0) {
      const curvature = getCurvatureAt(curvatureSamples, t);
      const halfWidth = wallSeparation / 2;
      const x_norm = point.x / halfWidth;
      // Scale curvature by wallSeparation to get dimensionless quantity
      // (curvature is rad/px, wallSeparation is px, so product is radians)
      const scaledCurvature = curvature * wallSeparation;
      const shift = -scaledCurvature * redistributionFactor;
      const remapped = redistribute(x_norm, shift);
      adjustedX = remapped * halfWidth;
    }

    // Directional curvature clamp to prevent fold-over on tight curves
    if (curvatureSamples) {
      const curvature = getCurvatureAt(curvatureSamples, t);
      if (curvature !== 0) {
        const radius = 1 / Math.abs(curvature);
        const maxOffset = radius * 0.85; // safety margin

        // Only clamp the INSIDE of the curve
        if (curvature > 0 && adjustedX < 0) {
          // Left turn: negative X is inside
          adjustedX = Math.max(adjustedX, -maxOffset);
        } else if (curvature < 0 && adjustedX > 0) {
          // Right turn: positive X is inside
          adjustedX = Math.min(adjustedX, maxOffset);
        }
      }
    }

    return {
      x: base.x + adjustedX * normal.x,
      y: base.y + adjustedX * normal.y
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

function buildFiberCurves(continuationPairs, leftSamples, rightSamples, centerSamples, params, curvatureSamples = null) {
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
    let effectiveFiberCount = Math.min(totalFibers, Math.max(1, maxFibersByLength));

    // Scale down fiber count based on curvature compression
    // If this pair is on the inside of a tight curve, reduce fiber count
    const originalFiberCount = effectiveFiberCount;
    if (curvatureSamples && diagRail.length > 0) {
      const braidLength = params.braidLength || 500;
      const wallSeparation = params.wallSeparation || 100;

      // Get the Y range of this continuation pair
      const pairY = diagRail[0].y; // Use start of diagonal rail
      const backboneT = clamp(pairY / braidLength, 0, 1);
      const curvature = getCurvatureAt(curvatureSamples, backboneT);

      if (curvature !== 0) {
        // Determine if this pair is on the inside of the curve
        // pair.side tells us which wall this continuation goes to
        // curvature > 0 = curving left → right wall is inside
        // curvature < 0 = curving right → left wall is inside
        const isOnInside = (curvature > 0 && pair.side === 'right') ||
                           (curvature < 0 && pair.side === 'left');

        if (isOnInside) {
          const radius = 1 / Math.abs(curvature);
          const halfWidth = wallSeparation / 2;

          // Calculate compression ratio: how much the inner arc shrinks
          // Inner arc = (radius - offset) / radius
          const compressionRatio = Math.max(0.2, (radius - halfWidth) / radius);

          // Scale fiber count by compression ratio
          effectiveFiberCount = Math.max(1, Math.round(effectiveFiberCount * compressionRatio));

          // DEBUG: Log compression details for first few pairs
          if (pair.sideIndex < 3) {
            console.log(`[COMPRESSION DEBUG] Pair ${pair.sideIndex} (${pair.side}):`, {
              pairY: pairY.toFixed(1),
              curvature: curvature.toFixed(6),
              radius: radius.toFixed(1),
              wallSep: wallSeparation,
              halfWidth: halfWidth.toFixed(1),
              isOnInside,
              compressionRatio: compressionRatio.toFixed(3),
              originalCount: originalFiberCount,
              reducedCount: effectiveFiberCount
            });
          }
        }
      }
    } else {
      // DEBUG: Log when curvatureSamples is missing
      if (pair.sideIndex === 0) {
        console.log('[COMPRESSION DEBUG] curvatureSamples:', curvatureSamples ? 'EXISTS' : 'NULL');
      }
    }

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

      // Generate bezier curve points with curvature-aware sampling
      const points = [];
      const segmentCount = 24;
      const braidLength = params.braidLength || 500;
      const wallSeparation = params.wallSeparation || 100;

      for (let j = 0; j <= segmentCount; j++) {
        const t = j / segmentCount;
        const point = quadraticPoint(originPoint, controlPoint, landingPoint, t);

        // Check if this point should be included based on curvature compression
        if (curvatureSamples && j > 0 && j < segmentCount) {
          const backboneT = clamp(point.y / braidLength, 0, 1);
          const curvature = getCurvatureAt(curvatureSamples, backboneT);
          const compression = getCompressionFactor(point.x, curvature, wallSeparation);

          // Skip points in heavily compressed regions, but keep minimum density
          // compression < 0.5 means significant compression
          // Use modulo to keep every Nth point based on compression level
          if (compression < 0.5) {
            const skipFactor = Math.floor(1 / compression); // e.g., compression 0.25 -> skip 3 of every 4
            const keepEvery = Math.max(2, Math.min(4, skipFactor)); // Keep at least every 4th, at most every 2nd
            if (j % keepEvery !== 0) {
              continue; // Skip this point
            }
          }
        }

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
// End Cap and Spout Fiber Generation
// ============================================================================

/**
 * Build fibers for start cap - connects first unclaimed wall troughs to centerline start
 */
function buildStartCapFibers(leftExtrema, rightExtrema, centerSamples, leftSamples, rightSamples, params, warpPoint) {
  const fibers = [];
  const { capFiberCount = 8, capGatherLength = 10, braidLength } = params;
  const fibersPerSide = Math.max(1, Math.floor(capFiberCount / 2));

  // Find first unclaimed trough on each side (lowest y)
  const leftTrough = leftExtrema
    .filter(e => e.type === 'trough' && !e.claimed)
    .sort((a, b) => a.y - b.y)[0];
  const rightTrough = rightExtrema
    .filter(e => e.type === 'trough' && !e.claimed)
    .sort((a, b) => a.y - b.y)[0];

  // Target: gather segment at start of centerline
  const gatherStart = { x: centerSamples[0].x, y: 0 };
  const gatherEnd = interpolateSamplesAt(centerSamples, Math.min(capGatherLength, braidLength * 0.1));

  // Generate fibers for left side
  if (leftTrough) {
    for (let i = 0; i < fibersPerSide; i++) {
      const t = (i + 0.5) / fibersPerSide;

      // Origin: distribute along segment near wall trough
      const originY = leftTrough.y * (1 - t * 0.3);
      const originPoint = interpolateSamplesAt(leftSamples, originY);

      // Landing: distribute along gather segment
      const landingPoint = lerpVector(gatherStart, gatherEnd, t);

      // Control point: offset toward wall for gentle curve
      const midPoint = lerpVector(originPoint, landingPoint, 0.5);
      const wallOffset = (originPoint.x - landingPoint.x) * 0.3;
      const controlPoint = {
        x: midPoint.x + wallOffset,
        y: midPoint.y
      };

      // Generate curve points
      const points = [];
      const segmentCount = 24;
      for (let j = 0; j <= segmentCount; j++) {
        const pt = j / segmentCount;
        const point = quadraticPoint(originPoint, controlPoint, landingPoint, pt);
        points.push(warpPoint(point));
      }

      fibers.push({
        type: 'cap',
        side: 'left',
        points,
        capEnd: 'start',
        pairIndex: -1,
        targetPairIndex: -1,
        fiberIndex: i
      });
    }
  }

  // Generate fibers for right side
  if (rightTrough) {
    for (let i = 0; i < fibersPerSide; i++) {
      const t = (i + 0.5) / fibersPerSide;

      // Origin: distribute along segment near wall trough
      const originY = rightTrough.y * (1 - t * 0.3);
      const originPoint = interpolateSamplesAt(rightSamples, originY);

      // Landing: distribute along gather segment
      const landingPoint = lerpVector(gatherStart, gatherEnd, t);

      // Control point: offset toward wall for gentle curve
      const midPoint = lerpVector(originPoint, landingPoint, 0.5);
      const wallOffset = (originPoint.x - landingPoint.x) * 0.3;
      const controlPoint = {
        x: midPoint.x + wallOffset,
        y: midPoint.y
      };

      // Generate curve points
      const points = [];
      const segmentCount = 24;
      for (let j = 0; j <= segmentCount; j++) {
        const pt = j / segmentCount;
        const point = quadraticPoint(originPoint, controlPoint, landingPoint, pt);
        points.push(warpPoint(point));
      }

      fibers.push({
        type: 'cap',
        side: 'right',
        points,
        capEnd: 'start',
        pairIndex: -1,
        targetPairIndex: -1,
        fiberIndex: i
      });
    }
  }

  return fibers;
}

/**
 * Build fibers for end cap - fans final unpaired center peak out to wall endpoints
 */
function buildEndCapFibers(centerExtrema, centerSamples, leftSamples, rightSamples, params, warpPoint) {
  const fibers = [];
  const { capFiberCount = 8, braidLength } = params;
  const fibersPerSide = Math.max(1, Math.floor(capFiberCount / 2));

  // Find last unpaired peak in centerExtrema (highest y)
  const lastPeak = centerExtrema
    .filter(e => (e.type === 'peak' || e.type === 'trough') && !e.paired)
    .sort((a, b) => b.y - a.y)[0];

  if (!lastPeak) return fibers;

  // Target endpoints on walls
  const leftEnd = { x: leftSamples[leftSamples.length - 1].x, y: braidLength };
  const rightEnd = { x: rightSamples[rightSamples.length - 1].x, y: braidLength };

  // Origin: distribute along segment near center peak
  const spanToEnd = braidLength - lastPeak.y;

  // Generate fibers to left wall endpoint
  for (let i = 0; i < fibersPerSide; i++) {
    const t = (i + 0.5) / fibersPerSide;

    // Origin: spread along center near peak
    const originY = lastPeak.y + spanToEnd * t * 0.2;
    const originPoint = interpolateSamplesAt(centerSamples, originY);

    // Landing: fan to left wall endpoint
    const landingPoint = lerpVector(
      { x: leftEnd.x, y: lastPeak.y + spanToEnd * 0.7 },
      leftEnd,
      t
    );

    // Control point for fan effect
    const midPoint = lerpVector(originPoint, landingPoint, 0.4);
    const controlPoint = {
      x: midPoint.x + (landingPoint.x - originPoint.x) * 0.2,
      y: midPoint.y + spanToEnd * 0.1
    };

    // Generate curve points
    const points = [];
    const segmentCount = 24;
    for (let j = 0; j <= segmentCount; j++) {
      const pt = j / segmentCount;
      const point = quadraticPoint(originPoint, controlPoint, landingPoint, pt);
      points.push(warpPoint(point));
    }

    fibers.push({
      type: 'cap',
      side: 'left',
      points,
      capEnd: 'end',
      pairIndex: -1,
      targetPairIndex: -1,
      fiberIndex: i
    });
  }

  // Generate fibers to right wall endpoint
  for (let i = 0; i < fibersPerSide; i++) {
    const t = (i + 0.5) / fibersPerSide;

    // Origin: spread along center near peak
    const originY = lastPeak.y + spanToEnd * t * 0.2;
    const originPoint = interpolateSamplesAt(centerSamples, originY);

    // Landing: fan to right wall endpoint
    const landingPoint = lerpVector(
      { x: rightEnd.x, y: lastPeak.y + spanToEnd * 0.7 },
      rightEnd,
      t
    );

    // Control point for fan effect
    const midPoint = lerpVector(originPoint, landingPoint, 0.4);
    const controlPoint = {
      x: midPoint.x + (landingPoint.x - originPoint.x) * 0.2,
      y: midPoint.y + spanToEnd * 0.1
    };

    // Generate curve points
    const points = [];
    const segmentCount = 24;
    for (let j = 0; j <= segmentCount; j++) {
      const pt = j / segmentCount;
      const point = quadraticPoint(originPoint, controlPoint, landingPoint, pt);
      points.push(warpPoint(point));
    }

    fibers.push({
      type: 'cap',
      side: 'right',
      points,
      capEnd: 'end',
      pairIndex: -1,
      targetPairIndex: -1,
      fiberIndex: i
    });
  }

  return fibers;
}

/**
 * Build decorative spout fibers extending beyond braid ends
 */
function buildSpoutFibers(centerSamples, backbone, params, warpPoint) {
  const fibers = [];
  const {
    spoutFiberCount = 5,
    spoutLength = 50,
    spoutSpread = 30,
    spoutGravity = 0.3,
    spoutAtStart = false
  } = params;

  if (spoutFiberCount <= 0) return fibers;

  // Gravity direction (always screen-down)
  const gravityDir = { x: 0, y: 1 };

  // Generate spout at end (always if spoutFiberCount > 0)
  const endPoint = centerSamples[centerSamples.length - 1];
  let endTangent = { x: 0, y: 1 }; // Default downward

  if (backbone) {
    const tan = backbone.getTangentAt(1);
    endTangent = normalizeVector(tan);
  }

  // Blend tangent with gravity
  const endDir = normalizeVector(lerpVector(endTangent, gravityDir, spoutGravity));

  for (let i = 0; i < spoutFiberCount; i++) {
    // Calculate angle offset for fan effect
    const angleOffset = ((i - (spoutFiberCount - 1) / 2) / Math.max(1, spoutFiberCount - 1)) * spoutSpread;
    const fiberDir = rotateVector(endDir, angleOffset);

    // Origin: end of centerline
    const originPoint = { x: endPoint.x, y: endPoint.y };

    // End: origin + direction * length
    const endPointFiber = {
      x: originPoint.x + fiberDir.x * spoutLength,
      y: originPoint.y + fiberDir.y * spoutLength
    };

    // Control point: midway with slight perpendicular offset for curl
    const midPoint = lerpVector(originPoint, endPointFiber, 0.5);
    const perpOffset = (i - (spoutFiberCount - 1) / 2) * 3; // Slight spread
    const controlPoint = {
      x: midPoint.x - fiberDir.y * perpOffset,
      y: midPoint.y + fiberDir.x * perpOffset
    };

    // Generate curve points
    const points = [];
    const segmentCount = 24;
    for (let j = 0; j <= segmentCount; j++) {
      const t = j / segmentCount;
      const point = quadraticPoint(originPoint, controlPoint, endPointFiber, t);
      // Warp only the origin portion, fade out warping along the spout
      const warpedOrigin = warpPoint(originPoint);
      const unwarpedPoint = point;
      // Blend from fully warped at origin to unwarped at tip
      const warpBlend = 1 - t;
      const warpedPoint = warpPoint(point);
      points.push({
        x: warpedPoint.x * warpBlend + (warpedOrigin.x + (unwarpedPoint.x - originPoint.x)) * (1 - warpBlend),
        y: warpedPoint.y * warpBlend + (warpedOrigin.y + (unwarpedPoint.y - originPoint.y)) * (1 - warpBlend)
      });
    }

    fibers.push({
      type: 'spout',
      side: 'center',
      points,
      spoutEnd: 'end',
      pairIndex: -1,
      targetPairIndex: -1,
      fiberIndex: i
    });
  }

  // Generate spout at start (optional)
  if (spoutAtStart) {
    const startPoint = centerSamples[0];
    let startTangent = { x: 0, y: -1 }; // Default upward (negative Y)

    if (backbone) {
      const tan = backbone.getTangentAt(0);
      startTangent = normalizeVector({ x: -tan.x, y: -tan.y }); // Negate for backward direction
    }

    // Blend tangent with inverted gravity (upward for start)
    const invertedGravity = { x: 0, y: -1 };
    const startDir = normalizeVector(lerpVector(startTangent, invertedGravity, spoutGravity));

    for (let i = 0; i < spoutFiberCount; i++) {
      const angleOffset = ((i - (spoutFiberCount - 1) / 2) / Math.max(1, spoutFiberCount - 1)) * spoutSpread;
      const fiberDir = rotateVector(startDir, angleOffset);

      const originPoint = { x: startPoint.x, y: startPoint.y };
      const endPointFiber = {
        x: originPoint.x + fiberDir.x * spoutLength,
        y: originPoint.y + fiberDir.y * spoutLength
      };

      const midPoint = lerpVector(originPoint, endPointFiber, 0.5);
      const perpOffset = (i - (spoutFiberCount - 1) / 2) * 3;
      const controlPoint = {
        x: midPoint.x - fiberDir.y * perpOffset,
        y: midPoint.y + fiberDir.x * perpOffset
      };

      const points = [];
      const segmentCount = 24;
      for (let j = 0; j <= segmentCount; j++) {
        const t = j / segmentCount;
        const point = quadraticPoint(originPoint, controlPoint, endPointFiber, t);
        const warpedOrigin = warpPoint(originPoint);
        const unwarpedPoint = point;
        const warpBlend = 1 - t;
        const warpedPoint = warpPoint(point);
        points.push({
          x: warpedPoint.x * warpBlend + (warpedOrigin.x + (unwarpedPoint.x - originPoint.x)) * (1 - warpBlend),
          y: warpedPoint.y * warpBlend + (warpedOrigin.y + (unwarpedPoint.y - originPoint.y)) * (1 - warpBlend)
        });
      }

      fibers.push({
        type: 'spout',
        side: 'center',
        points,
        spoutEnd: 'start',
        pairIndex: -1,
        targetPairIndex: -1,
        fiberIndex: i
      });
    }
  }

  return fibers;
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

  // Curvature-aware parameters
  const redistributionFactor = params.redistributionFactor ?? 0;
  const curvatureSmoothing = params.curvatureSmoothing ?? 5;

  // Compute backbone arc lengths for frequency adjustment (if backbone exists)
  const arcLengths = backbone ? computeBackboneArcLengths(backbone) : null;

  // Compute smoothed curvature for redistribution (if backbone exists and redistribution enabled)
  const curvatureSamples = (backbone && redistributionFactor > 0)
    ? computeBackboneCurvature(backbone, braidLength, 100, curvatureSmoothing)
    : null;

  const config = {
    frequency,
    wallFrequency,
    cycleJitter: params.cycleJitter ?? 0,
    zigzagScale: params.zigzagScale ?? 1.0,
    wallScale: params.wallScale ?? 1.0,
    tipTaper: params.tipTaper ?? 0.0,
    tipTaperLength: params.tipTaperLength ?? 50,
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
    fiberSpacing: params.fiberSpacing ?? 3,
    // Curvature-aware parameters
    arcLengths,
    redistributionFactor,
    curvatureSmoothing,
    // End cap parameters
    enableCaps: params.enableCaps ?? true,
    capFiberCount: params.capFiberCount ?? 8,
    capGatherLength: params.capGatherLength ?? 10,
    // Spout parameters
    spoutFiberCount: params.spoutFiberCount ?? 5,
    spoutLength: params.spoutLength ?? 50,
    spoutSpread: params.spoutSpread ?? 30,
    spoutGravity: params.spoutGravity ?? 0.3,
    spoutAtStart: params.spoutAtStart ?? false
  };

  // Sample the three boundaries
  const centerSamples = sampleBoundary(generateCenterX, config);
  const leftSamples = sampleBoundary((phaseY, actualY, p) => generateWallX(phaseY, actualY, 'left', p), config);
  const rightSamples = sampleBoundary((phaseY, actualY, p) => generateWallX(phaseY, actualY, 'right', p), config);

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
    config,
    curvatureSamples
  );

  // Create warp function (with curvature-aware redistribution)
  const warpPoint = createWarpFunction(backbone, config.braidLength, curvatureSamples, config);

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
  const mainFibers = fiberCurves.map(fiber => ({
    ...fiber,
    type: 'main',
    points: fiber.points.map(warpPoint)
  }));

  // Generate cap fibers (if enabled)
  let capFibers = [];
  if (config.enableCaps) {
    const startCapFibers = buildStartCapFibers(
      leftExtrema,
      rightExtrema,
      centerSamples,
      leftSamples,
      rightSamples,
      config,
      warpPoint
    );
    const endCapFibers = buildEndCapFibers(
      centerExtrema,
      centerSamples,
      leftSamples,
      rightSamples,
      config,
      warpPoint
    );
    capFibers = [...startCapFibers, ...endCapFibers];
  }

  // Generate spout fibers (if count > 0)
  let spoutFibers = [];
  if (config.spoutFiberCount > 0) {
    spoutFibers = buildSpoutFibers(centerSamples, backbone, config, warpPoint);
  }

  // Combine all fibers for backwards compatibility
  const allFibers = [...mainFibers, ...capFibers, ...spoutFibers];

  return {
    outlines,
    fibers: allFibers,
    fiberGroups: {
      main: mainFibers,
      caps: capFibers,
      spouts: spoutFibers
    },
    metadata: {
      braidLength: config.braidLength,
      centerExtremaCount: centerExtrema.length,
      leftTroughCount: leftExtrema.filter(e => e.type === 'trough').length,
      rightTroughCount: rightExtrema.filter(e => e.type === 'trough').length,
      continuationCount: continuationPairs.length,
      fiberCount: allFibers.length,
      mainFiberCount: mainFibers.length,
      capFiberCount: capFibers.length,
      spoutFiberCount: spoutFibers.length,
      parameters: config
    }
  };
}

// Also export as default for convenience
export default { generateBraid };
