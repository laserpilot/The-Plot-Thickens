/**
 * SVG Font Loader
 * Parses SVG font files and extracts glyph data for single-line font rendering
 */

/**
 * Parse SVG font data from an SVG string
 * @param {string} svgData - SVG font file contents
 * @returns {Object} Parsed font data with glyphs and metrics
 */
export function parseSvgFont(svgData) {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgData, 'text/xml');

  const fontData = {
    unitsPerEm: 1000,
    ascent: 800,
    descent: -200,
    glyphs: {},
    defaultAdvance: 378,
  };

  // Parse font-face for metrics
  const fontFace = svgDoc.querySelector('font-face');
  if (fontFace) {
    fontData.unitsPerEm = parseFloat(fontFace.getAttribute('units-per-em') || 1000);
    fontData.ascent = parseFloat(fontFace.getAttribute('ascent') || 800);
    fontData.descent = parseFloat(fontFace.getAttribute('descent') || -200);
  }

  // Parse font element for default advance
  const fontElement = svgDoc.querySelector('font');
  if (fontElement) {
    fontData.defaultAdvance = parseFloat(fontElement.getAttribute('horiz-adv-x') || 378);
  }

  // Parse glyphs
  const glyphElements = svgDoc.querySelectorAll('glyph');
  glyphElements.forEach((glyph) => {
    const unicode = glyph.getAttribute('unicode');
    if (unicode !== null) {
      const pathData = glyph.getAttribute('d') || '';
      const horizAdvX = parseFloat(glyph.getAttribute('horiz-adv-x') || fontData.defaultAdvance);
      fontData.glyphs[unicode] = { d: pathData, horizAdvX };
    }
  });

  return fontData;
}

/**
 * Get glyph data for a character
 * @param {Object} fontData - Parsed font data
 * @param {string} char - Character to look up
 * @returns {Object|null} Glyph data {d, horizAdvX} or null if not found
 */
export function getGlyph(fontData, char) {
  return fontData.glyphs[char] || null;
}

/**
 * Calculate the total width of a string in font units
 * @param {Object} fontData - Parsed font data
 * @param {string} text - Text to measure
 * @param {number} letterSpacing - Letter spacing multiplier (default 1.0)
 * @param {number} wordSpacing - Word spacing multiplier for spaces (default 1.0)
 * @returns {number} Total width in font units
 */
export function getStringWidth(fontData, text, letterSpacing = 1.0, wordSpacing = 1.0) {
  let width = 0;
  const fallbackAdvance = fontData.defaultAdvance || 300;

  for (const char of text) {
    const glyph = fontData.glyphs[char];
    const advance = glyph ? glyph.horizAdvX : fallbackAdvance;
    const spacing = char === ' ' ? wordSpacing : 1.0;
    width += advance * letterSpacing * spacing;
  }

  return width;
}

/**
 * Get scaled metrics for rendering at a specific size
 * @param {Object} fontData - Parsed font data
 * @param {number} fontSize - Desired font size (height)
 * @returns {Object} Scaled metrics {scaleFactor, baseline, ascender, descender}
 */
export function getScaledMetrics(fontData, fontSize) {
  const scaleFactor = fontSize / fontData.unitsPerEm;
  return {
    scaleFactor,
    baseline: 0, // Baseline is at y=0 in font coordinates
    ascender: fontData.ascent * scaleFactor,
    descender: fontData.descent * scaleFactor,
  };
}
