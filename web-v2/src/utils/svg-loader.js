/**
 * SVG file loading and parsing utilities
 */

// Import measurePathLength for calculating path lengths
import { measurePathLength } from '../../../shared/geometry/path-utils.js';

export async function loadSVGFile(file) {
  const text = await file.text();
  return parseSVG(text);
}

export function parseSVG(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');

  const svgEl = doc.querySelector('svg');
  if (!svgEl) {
    throw new Error('No SVG element found');
  }

  // Extract viewBox or compute from width/height
  const bounds = extractBounds(svgEl);

  // Store original SVG metadata (for preserving dimensions on export)
  const metadata = {
    width: svgEl.getAttribute('width'),
    height: svgEl.getAttribute('height'),
    viewBox: svgEl.getAttribute('viewBox')
  };

  // Extract all path elements and calculate their lengths
  const pathElements = svgEl.querySelectorAll('path');
  const paths = Array.from(pathElements).map((pathEl, index) => {
    const d = pathEl.getAttribute('d');
    if (!d) return null;

    // Calculate path length for binning and outline filtering
    const length = measurePathLength(d);

    return {
      id: pathEl.id || `path-${index}`,
      d,
      length,  // Add length property for binning/filtering
      fill: pathEl.getAttribute('fill'),
      stroke: pathEl.getAttribute('stroke'),
      strokeWidth: pathEl.getAttribute('stroke-width'),
      transform: pathEl.getAttribute('transform')
    };
  }).filter(p => p !== null); // Only valid paths

  return {
    raw: svgText,
    bounds,
    paths,
    metadata
  };
}

/**
 * Parse SVG unit value and convert to millimeters
 */
function parseUnit(value) {
  if (!value) return null;

  const match = String(value).match(/^([-+]?[0-9]*\.?[0-9]+)\s*(px|pt|pc|mm|cm|in)?$/);
  if (!match) return parseFloat(value);

  const num = parseFloat(match[1]);
  const unit = match[2] || '';

  // Convert all units to mm (per CSS3/SVG spec)
  switch (unit) {
    case 'mm': return num;
    case 'cm': return num * 10;
    case 'in': return num * 25.4;
    case 'pt': return num * 25.4 / 72;
    case 'pc': return num * 25.4 / 6;
    case 'px': return num * 25.4 / 96;  // CSS px at 96 DPI
    case '': return num;  // Unitless - assume user units
    default: return num;
  }
}

function extractBounds(svgEl) {
  const viewBox = svgEl.getAttribute('viewBox');
  const widthAttr = svgEl.getAttribute('width');
  const heightAttr = svgEl.getAttribute('height');

  // Parse viewBox for coordinate system (if present)
  // IMPORTANT: Path coordinates are always in viewBox units, so we must use
  // viewBox dimensions for bounds to ensure correct centering
  let vb = null;
  if (viewBox) {
    const [x, y, w, h] = viewBox.split(/\s+/).map(parseFloat);
    vb = { x, y, width: w, height: h };
  }

  // Use viewBox dimensions for bounds since paths are in viewBox coordinates
  // Only fall back to width/height attributes if no viewBox exists
  let width, height, x, y;

  if (vb) {
    // Use viewBox dimensions - paths are in these coordinates
    x = vb.x;
    y = vb.y;
    width = vb.width;
    height = vb.height;
  } else {
    // No viewBox - use width/height attributes (convert units to user units)
    x = 0;
    y = 0;
    width = widthAttr ? parseUnit(widthAttr) : 100;
    height = heightAttr ? parseUnit(heightAttr) : 100;
  }

  return {
    x,
    y,
    width,
    height,
    cx: x + width / 2,
    cy: y + height / 2
  };
}

/**
 * Compute actual bounding box from path data
 * (Simple implementation - can be enhanced with proper path parsing)
 */
export function computePathBounds(paths) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // This is a simplified version - for production, parse path commands properly
  for (const path of paths) {
    const d = path.d;
    const numbers = d.match(/-?\d+\.?\d*/g);

    if (!numbers) continue;

    for (let i = 0; i < numbers.length; i += 2) {
      const x = parseFloat(numbers[i]);
      const y = parseFloat(numbers[i + 1]);

      if (!isNaN(x)) minX = Math.min(minX, x);
      if (!isNaN(y)) minY = Math.min(minY, y);
      if (!isNaN(x)) maxX = Math.max(maxX, x);
      if (!isNaN(y)) maxY = Math.max(maxY, y);
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    x: minX,
    y: minY,
    width,
    height,
    cx: minX + width / 2,
    cy: minY + height / 2
  };
}
