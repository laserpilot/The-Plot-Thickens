/**
 * Text Fill Mode
 * Places text along stroke centerlines, warping letters to follow curves
 * Similar to Adobe Illustrator's "Type on a Path" tool
 */

import {
  pathToAbsolute,
  getTotalLength,
  getPointAtLength,
  getEnvelopePreset,
} from './_helpers.js';

import { transformGlyph } from '../fonts/glyph-transformer.js';

/**
 * Default options for text fill mode
 */
export const defaults = {
  textFillText: 'HELLO ',
  textFillFont: 'hershey-sans',
  textFillLetterSpacing: 1.0,
  textFillWordSpacing: 1.5,
  textFillBaseHeight: 1.0,           // mm - base letter height (small for dense text)
  textFillMaxWidth: 1.5,             // mm - max letter height at widest envelope
  textFillMinWidth: 0.1,             // mm - below this, skip rendering
  textFillCompressionStrength: 0.5,  // 0-1, how much to compress on curve inside
  textFillMinCompression: 0.7,       // 0-1, minimum width multiplier (1 = no compression allowed)
  textFillStartOffset: 'fixed',      // 'fixed', 'random', or 'path-based'
  textFillFilterWords: '',           // Comma-separated list of words to highlight
  textFillCompleteWords: false,      // If true, don't start words that won't fit
};

/**
 * Generate text fill paths
 * Places glyphs along the path centerline, warping them to follow curves
 *
 * @param {string} pathData - SVG path d attribute
 * @param {Object} options - Configuration options
 * @returns {Array<string>} Array of SVG path data strings (one per glyph)
 */
export function generate(pathData, options = {}) {
  const {
    text = defaults.textFillText,
    fontData = null,            // Pre-loaded font data (required)
    letterSpacing = defaults.textFillLetterSpacing,
    wordSpacing = defaults.textFillWordSpacing,
    baseHeight = defaults.textFillBaseHeight,
    envelope = 'flat',
    maxWidth = defaults.textFillMaxWidth,
    minWidth = 0.0,
    minWidthThreshold = defaults.textFillMinWidth,
    compressionStrength = defaults.textFillCompressionStrength,
    minCompression = defaults.textFillMinCompression,
    startOffset = defaults.textFillStartOffset,
    sampleRate = 0.5,
    pathId = 'path',
    unitScale = 1.0,            // viewBox units per mm
    filterWords = defaults.textFillFilterWords,
    completeWords = defaults.textFillCompleteWords,
    // Aliased options (support textFill* prefixed names)
    textFillText,
    textFillFont,
    textFillLetterSpacing,
    textFillWordSpacing,
    textFillBaseHeight,
    textFillMaxWidth,
    textFillMinWidth,
    textFillCompressionStrength,
    textFillMinCompression,
    textFillStartOffset,
    textFillFilterWords,
    textFillCompleteWords,
  } = options;

  // Resolve prefixed vs non-prefixed options
  const resolvedText = textFillText ?? text;
  const resolvedLetterSpacing = textFillLetterSpacing ?? letterSpacing;
  const resolvedWordSpacing = textFillWordSpacing ?? wordSpacing;
  const resolvedBaseHeight = textFillBaseHeight ?? baseHeight;
  const resolvedMaxWidth = textFillMaxWidth ?? maxWidth;
  const resolvedMinWidthThreshold = textFillMinWidth ?? minWidthThreshold;
  const resolvedCompressionStrength = textFillCompressionStrength ?? compressionStrength;
  const resolvedMinCompression = textFillMinCompression ?? minCompression;
  const resolvedStartOffset = textFillStartOffset ?? startOffset;
  const resolvedFilterWords = textFillFilterWords ?? filterWords;
  const resolvedCompleteWords = textFillCompleteWords ?? completeWords;

  const paths = [];

  if (!fontData) {
    console.warn('Text fill requires fontData to be provided');
    return paths;
  }

  if (!resolvedText || resolvedText.length === 0) {
    return paths;
  }

  // Build set of character indices that should be highlighted
  // Supports both single words and multi-word phrases (comma-separated)
  const filterPhrases = resolvedFilterWords.split(',')
    .map(p => p.trim().toUpperCase())
    .filter(p => p);

  const filteredCharIndices = new Set();
  const textUpper = resolvedText.toUpperCase();

  for (const phrase of filterPhrases) {
    let searchStart = 0;
    while (true) {
      const idx = textUpper.indexOf(phrase, searchStart);
      if (idx === -1) break;
      // Mark all characters in this match as filtered
      for (let i = idx; i < idx + phrase.length; i++) {
        filteredCharIndices.add(i);
      }
      searchStart = idx + 1; // Find next occurrence
    }
  }

  const hasFilters = filteredCharIndices.size > 0;

  try {
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return paths;
    }

    // Get envelope function
    const envelopeFn = getEnvelopePreset(envelope);

    // Sample centerline to build a reference for placement
    const centerline = [];

    for (let dist = 0; dist <= totalLength; dist += sampleRate) {
      const point = getPointAtLength(absolutePath, dist);

      if (!point || isNaN(point.x) || isNaN(point.y)) {
        break;
      }

      // Calculate tangent using centered delta
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
          point.tx = dx / len;
          point.ty = dy / len;
          point.nx = -dy / len;
          point.ny = dx / len;
        } else {
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

      // Calculate curvature for compression
      if (centerline.length >= 2) {
        const prevPoint = centerline[centerline.length - 1];
        const prevPrevPoint = centerline[centerline.length - 2];

        // Cross product of adjacent tangent vectors
        const cross = prevPrevPoint.tx * point.ty - prevPrevPoint.ty * point.tx;
        point.curvature = Math.max(-1, Math.min(1, cross * 5));
      } else {
        point.curvature = 0;
      }

      // Calculate envelope width
      const t = dist / totalLength;
      const envelopeMultiplier = envelopeFn(pathId, t);
      point.localWidth = minWidth + envelopeMultiplier * (maxWidth - minWidth);
      point.distance = dist;

      centerline.push(point);
    }

    if (centerline.length < 2) {
      return paths;
    }

    // Smooth curvature values
    for (let i = 1; i < centerline.length - 1; i++) {
      const prev = centerline[i - 1].curvature || 0;
      const curr = centerline[i].curvature || 0;
      const next = centerline[i + 1].curvature || 0;
      centerline[i].smoothedCurvature = 0.25 * prev + 0.5 * curr + 0.25 * next;
    }
    if (centerline.length > 0) {
      centerline[0].smoothedCurvature = centerline[0].curvature || 0;
      centerline[centerline.length - 1].smoothedCurvature =
        centerline[centerline.length - 1].curvature || 0;
    }

    // Place glyphs along the centerline
    let arcPosition = 0;

    // Calculate word start positions for word-based offsetting
    const words = resolvedText.split(/(\s+)/); // Keep spaces as separate elements
    const wordStartIndices = [];
    let wordCharIndex = 0;
    for (let i = 0; i < words.length; i++) {
      if (words[i].trim()) { // Only track actual words, not spaces
        wordStartIndices.push(wordCharIndex);
      }
      wordCharIndex += words[i].length;
    }

    // Calculate start offset based on WORDS, not characters
    let startCharIndex = 0;
    if (resolvedStartOffset === 'random' && wordStartIndices.length > 0) {
      // Use pathId hash for deterministic random offset by word
      const hash = pathId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const startWordIndex = hash % wordStartIndices.length;
      startCharIndex = wordStartIndices[startWordIndex];
    } else if (resolvedStartOffset === 'path-based' && wordStartIndices.length > 0) {
      // Extract path number from pathId like "path-5"
      const match = pathId.match(/(\d+)/);
      if (match) {
        const startWordIndex = parseInt(match[1]) % wordStartIndices.length;
        startCharIndex = wordStartIndices[startWordIndex];
      }
    }
    // 'fixed' mode: startCharIndex stays 0

    let charIndex = 0;
    const fallbackAdvance = fontData.defaultAdvance || 300;

    // Helper to estimate width of remaining word from current position
    function estimateWordWidth(startIdx, localScale) {
      let width = 0;
      let idx = startIdx;
      while (idx < resolvedText.length) {
        const c = resolvedText[(idx + startCharIndex) % resolvedText.length];
        if (c === ' ') break; // Stop at space
        const g = fontData.glyphs[c];
        const adv = g ? g.horizAdvX : fallbackAdvance;
        width += adv * localScale * resolvedLetterSpacing;
        idx++;
      }
      return width;
    }

    while (arcPosition < totalLength) {
      const char = resolvedText[(charIndex + startCharIndex) % resolvedText.length];
      const glyph = fontData.glyphs[char];

      // Check if we're at the start of a word and if complete words mode is on
      if (resolvedCompleteWords && char !== ' ') {
        const prevCharIdx = (charIndex + startCharIndex - 1 + resolvedText.length) % resolvedText.length;
        const prevChar = charIndex === 0 ? ' ' : resolvedText[prevCharIdx];
        const isWordStart = prevChar === ' ' || charIndex === 0;

        if (isWordStart) {
          // Estimate current scale for width calculation
          const t = arcPosition / totalLength;
          const envMult = envelopeFn(pathId, t);
          const localHeight = minWidth + envMult * (maxWidth - minWidth);
          const estScale = localHeight * unitScale / fontData.unitsPerEm;

          const wordWidth = estimateWordWidth(charIndex, estScale);
          const remainingLength = totalLength - arcPosition;

          if (wordWidth > remainingLength) {
            // Word won't fit, stop rendering
            break;
          }
        }
      }

      // Get position info by interpolating centerline
      const position = interpolateCenterline(centerline, arcPosition, totalLength);

      if (!position) {
        break;
      }

      // Get envelope multiplier for letter height scaling
      const t = arcPosition / totalLength;
      const envelopeMultiplier = envelopeFn(pathId, t);
      const localHeight = minWidth + envelopeMultiplier * (maxWidth - minWidth);

      // Skip if below minimum threshold
      if (localHeight < resolvedMinWidthThreshold) {
        const advance = glyph ? glyph.horizAdvX : fallbackAdvance;
        const baseScale = resolvedBaseHeight * unitScale / fontData.unitsPerEm;
        arcPosition += advance * baseScale * resolvedLetterSpacing;
        charIndex++;
        continue;
      }

      // Calculate compression from curvature
      // Use squared curvature for smoother response at lower values
      const curvature = Math.abs(position.curvature || 0);
      const effectiveCurvature = curvature * curvature; // Softer falloff
      const compression = 1 - effectiveCurvature * resolvedCompressionStrength;
      const clampedCompression = Math.max(resolvedMinCompression, Math.min(1.0, compression));

      // Calculate scale for this position
      // Scale based on local height (envelope-modulated)
      const scale = localHeight * unitScale;

      // Transform and add glyph if it has path data
      if (glyph && glyph.d) {
        const transformedPath = transformGlyph(
          glyph.d,
          position,
          scale,
          clampedCompression,
          fontData.unitsPerEm
        );

        if (transformedPath) {
          // Check if current character is part of a filtered phrase
          if (hasFilters) {
            const actualCharIdx = (charIndex + startCharIndex) % resolvedText.length;
            const isFiltered = filteredCharIndices.has(actualCharIdx);
            paths.push({
              d: transformedPath,
              family: isFiltered ? 'highlight' : 'default'
            });
          } else {
            paths.push(transformedPath);
          }
        }
      }

      // Advance by character width
      const advance = glyph ? glyph.horizAdvX : fallbackAdvance;
      const baseScale = localHeight * unitScale / fontData.unitsPerEm;
      const spacing = char === ' ' ? resolvedWordSpacing : 1.0;
      arcPosition += advance * baseScale * clampedCompression * resolvedLetterSpacing * spacing;

      charIndex++;

      // Safety check to prevent infinite loops
      if (charIndex > 10000) {
        console.warn('Text fill: Maximum character count exceeded');
        break;
      }
    }

  } catch (error) {
    console.error(`Error generating text fill for path ${pathId}:`, error);
  }

  return paths;
}

/**
 * Interpolate centerline to get position info at a specific arc length
 *
 * @param {Array} centerline - Array of centerline points
 * @param {number} arcLength - Arc length position to interpolate
 * @param {number} totalLength - Total path length
 * @returns {Object|null} Interpolated position {x, y, tx, ty, nx, ny, curvature}
 */
function interpolateCenterline(centerline, arcLength, totalLength) {
  if (centerline.length === 0) return null;
  if (centerline.length === 1) return { ...centerline[0] };

  // Find the two centerline points bracketing this arc length
  let lower = 0;
  let upper = centerline.length - 1;

  for (let i = 0; i < centerline.length - 1; i++) {
    if (centerline[i].distance <= arcLength && centerline[i + 1].distance > arcLength) {
      lower = i;
      upper = i + 1;
      break;
    }
  }

  const p1 = centerline[lower];
  const p2 = centerline[upper];

  // Handle edge case at path end
  if (p1.distance === p2.distance) {
    return { ...p1, curvature: p1.smoothedCurvature || 0 };
  }

  // Interpolation factor
  const t = (arcLength - p1.distance) / (p2.distance - p1.distance);

  // Interpolate position
  const x = p1.x + t * (p2.x - p1.x);
  const y = p1.y + t * (p2.y - p1.y);

  // Interpolate and normalize tangent/normal
  let tx = p1.tx + t * (p2.tx - p1.tx);
  let ty = p1.ty + t * (p2.ty - p1.ty);
  const tLen = Math.hypot(tx, ty);
  if (tLen > 1e-6) {
    tx /= tLen;
    ty /= tLen;
  }

  let nx = p1.nx + t * (p2.nx - p1.nx);
  let ny = p1.ny + t * (p2.ny - p1.ny);
  const nLen = Math.hypot(nx, ny);
  if (nLen > 1e-6) {
    nx /= nLen;
    ny /= nLen;
  }

  // Interpolate curvature
  const curvature = (p1.smoothedCurvature || 0) + t * ((p2.smoothedCurvature || 0) - (p1.smoothedCurvature || 0));

  return { x, y, tx, ty, nx, ny, curvature };
}

/**
 * Schema for UI automation
 */
export const schema = {
  textFillText: { type: 'text', label: 'Text' },
  textFillFont: {
    type: 'select',
    options: ['hershey-sans', 'hershey-script', 'ems-readability', 'ems-casual-hand', 'ems-tech', 'ems-allure'],
    label: 'Font'
  },
  textFillStartOffset: {
    type: 'select',
    options: ['fixed', 'random', 'path-based'],
    label: 'Start Offset'
  },
  textFillLetterSpacing: { type: 'number', min: 0.3, max: 3, step: 0.1, label: 'Letter Spacing' },
  textFillWordSpacing: { type: 'number', min: 0.3, max: 5, step: 0.1, label: 'Word Spacing' },
  textFillBaseHeight: { type: 'number', min: 0.2, max: 15, step: 0.1, label: 'Letter Height', unit: 'mm' },
  textFillMaxWidth: { type: 'number', min: 0.2, max: 20, step: 0.1, label: 'Max Width', unit: 'mm' },
  textFillMinWidth: { type: 'number', min: 0, max: 5, step: 0.05, label: 'Min Width', unit: 'mm' },
  textFillCompressionStrength: { type: 'number', min: 0, max: 1, step: 0.1, label: 'Compression Strength' },
  textFillMinCompression: { type: 'number', min: 0.3, max: 1, step: 0.05, label: 'Min Width (compression floor)' },
  textFillFilterWords: { type: 'text', label: 'Highlight Phrases (comma-separated)' },
  textFillCompleteWords: { type: 'checkbox', label: 'Complete Words Only' },
};
