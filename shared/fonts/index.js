/**
 * Font Registry
 * Central registry for single-line SVG fonts with async loading
 */

import { parseSvgFont } from './svg-font-loader.js';

/**
 * Registry of available single-line fonts
 * Each font has a path relative to the web-v3/public/fonts directory
 */
export const fontRegistry = {
  'hershey-sans': {
    name: 'Hershey Sans',
    file: 'HersheySans1.svg',
    description: 'Clean geometric single-line font',
  },
  'hershey-script': {
    name: 'Hershey Script',
    file: 'HersheyScript1.svg',
    description: 'Flowing cursive script',
  },
  'ems-readability': {
    name: 'EMS Readability',
    file: 'EMSReadability.svg',
    description: 'Clear, readable single-line font',
  },
  'ems-casual-hand': {
    name: 'EMS Casual Hand',
    file: 'EMSCasualHand.svg',
    description: 'Informal handwritten style',
  },
  'ems-tech': {
    name: 'EMS Tech',
    file: 'EMSTech.svg',
    description: 'Technical/engineering style',
  },
  'ems-allure': {
    name: 'EMS Allure',
    file: 'EMSAllure.svg',
    description: 'Elegant decorative script',
  },
};

// Cache for loaded and parsed fonts
const fontCache = new Map();

// Base path for font files (relative to document root when served)
let basePath = '/fonts';

/**
 * Set the base path for loading fonts
 * @param {string} path - Base path to font directory
 */
export function setFontBasePath(path) {
  basePath = path;
}

/**
 * Load and parse a font by its registry ID
 * Returns cached version if already loaded
 *
 * @param {string} fontId - Font identifier from fontRegistry
 * @returns {Promise<Object>} Parsed font data
 */
export async function loadFont(fontId) {
  // Return cached font if available
  if (fontCache.has(fontId)) {
    return fontCache.get(fontId);
  }

  const fontInfo = fontRegistry[fontId];
  if (!fontInfo) {
    throw new Error(`Unknown font ID: ${fontId}`);
  }

  const fontPath = `${basePath}/${fontInfo.file}`;

  try {
    const response = await fetch(fontPath);
    if (!response.ok) {
      throw new Error(`Failed to load font: ${response.status} ${response.statusText}`);
    }

    const svgData = await response.text();
    const fontData = parseSvgFont(svgData);

    // Add metadata to font data
    fontData.id = fontId;
    fontData.name = fontInfo.name;
    fontData.description = fontInfo.description;

    // Cache the parsed font
    fontCache.set(fontId, fontData);

    return fontData;
  } catch (error) {
    console.error(`Error loading font ${fontId}:`, error);
    throw error;
  }
}

/**
 * Get list of available font IDs
 * @returns {Array<string>} Array of font IDs
 */
export function getAvailableFonts() {
  return Object.keys(fontRegistry);
}

/**
 * Get font metadata without loading
 * @param {string} fontId - Font identifier
 * @returns {Object|null} Font metadata or null if not found
 */
export function getFontInfo(fontId) {
  return fontRegistry[fontId] || null;
}

/**
 * Check if a font is already loaded and cached
 * @param {string} fontId - Font identifier
 * @returns {boolean} True if font is cached
 */
export function isFontLoaded(fontId) {
  return fontCache.has(fontId);
}

/**
 * Get a loaded font from cache (synchronous)
 * @param {string} fontId - Font identifier
 * @returns {Object|null} Cached font data or null if not loaded
 */
export function getCachedFont(fontId) {
  return fontCache.get(fontId) || null;
}

/**
 * Inject already-parsed font data into the cache.
 * Used to hand fonts from the main thread (where DOMParser exists) into a
 * Web Worker, which cannot parse SVG fonts itself.
 * @param {string} fontId - Font identifier
 * @param {Object} fontData - Parsed font data
 */
export function setCachedFont(fontId, fontData) {
  fontCache.set(fontId, fontData);
}

/**
 * Preload multiple fonts
 * @param {Array<string>} fontIds - Array of font IDs to preload
 * @returns {Promise<Map>} Map of fontId -> fontData for successfully loaded fonts
 */
export async function preloadFonts(fontIds) {
  const results = new Map();

  await Promise.all(
    fontIds.map(async (fontId) => {
      try {
        const fontData = await loadFont(fontId);
        results.set(fontId, fontData);
      } catch (error) {
        console.warn(`Failed to preload font ${fontId}:`, error);
      }
    })
  );

  return results;
}

// Re-export utilities
export { parseSvgFont, getGlyph, getStringWidth, getScaledMetrics } from './svg-font-loader.js';
export { transformGlyph, calculateCurvature } from './glyph-transformer.js';
