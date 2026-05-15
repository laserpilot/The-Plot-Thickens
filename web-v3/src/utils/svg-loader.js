/**
 * SVG file loading and parsing utilities
 */

// Import measurePathLength for calculating path lengths
import { measurePathLength, splitCompoundPath } from '../../../shared/geometry/path-utils.js';

export async function loadSVGFile(file) {
  const text = await file.text();
  return parseSVG(text);
}

export async function loadSVGFromURL(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load SVG: ${response.statusText}`);
  }
  const text = await response.text();
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

  // Extract all path elements, splitting compound paths (multiple M commands)
  // into separate subpaths so offset/fill operations don't draw connecting
  // lines between disjoint subpaths.
  const pathElements = svgEl.querySelectorAll('path');
  const paths = [];
  pathElements.forEach((pathEl, index) => {
    const d = pathEl.getAttribute('d');
    if (!d) return;

    const baseId = pathEl.id || `path-${index}`;
    const layerId = findParentLayerId(pathEl);
    const fill = pathEl.getAttribute('fill');
    const stroke = pathEl.getAttribute('stroke');
    const strokeWidth = pathEl.getAttribute('stroke-width');
    const transform = pathEl.getAttribute('transform');

    const subpaths = splitCompoundPath(d);
    subpaths.forEach((subD, subIdx) => {
      const length = measurePathLength(subD);
      if (length === 0) return;

      paths.push({
        id: subpaths.length > 1 ? `${baseId}-sub${subIdx}` : baseId,
        d: subD,
        length,
        layerId,
        fill,
        stroke,
        strokeWidth,
        transform
      });
    });
  });

  // Collect unique layer IDs for metadata
  const layers = [...new Set(paths.map(p => p.layerId).filter(Boolean))];

  return {
    raw: svgText,
    bounds,
    paths,
    metadata,
    layers  // List of detected layer IDs
  };
}

/**
 * Walk up DOM tree to find nearest named layer/group
 * Priority: inkscape:label > id attribute > null (ungrouped)
 * Only considers ancestor <g> elements, not the root <svg>
 */
function findParentLayerId(element) {
  let current = element.parentElement;

  while (current && current.tagName.toLowerCase() !== 'svg') {
    if (current.tagName.toLowerCase() === 'g') {
      // Check for Inkscape layer label first (highest priority)
      const inkscapeLabel = current.getAttributeNS(
        'http://www.inkscape.org/namespaces/inkscape',
        'label'
      );
      if (inkscapeLabel) {
        return inkscapeLabel;
      }

      // Fall back to id attribute
      const id = current.getAttribute('id');
      if (id) {
        return id;
      }
    }
    current = current.parentElement;
  }

  return null; // No named group found
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
    case '': return num * 25.4 / 96;  // Unitless = pixels per SVG spec (96 DPI)
    default: return num * 25.4 / 96;  // Unknown unit, treat as px
  }
}

function extractBounds(svgEl) {
  const viewBox = svgEl.getAttribute('viewBox');
  const widthAttr = svgEl.getAttribute('width');
  const heightAttr = svgEl.getAttribute('height');

  // Parse actual document dimensions from width/height attributes (in mm)
  const docWidth = widthAttr ? parseUnit(widthAttr) : null;
  const docHeight = heightAttr ? parseUnit(heightAttr) : null;

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
    width = docWidth || 100;
    height = docHeight || 100;
  }

  // Calculate scale factor from viewBox to document (mm per viewBox unit)
  // This is needed for accurate A3 reference frame positioning
  let viewBoxToMM = 1;
  if (vb && docWidth && docHeight) {
    // Use average scale if aspect ratios differ slightly
    viewBoxToMM = ((docWidth / vb.width) + (docHeight / vb.height)) / 2;
  }

  return {
    x,
    y,
    width,
    height,
    cx: x + width / 2,
    cy: y + height / 2,
    // Actual document dimensions in mm (for display and A3 reference)
    documentWidth: docWidth || width,
    documentHeight: docHeight || height,
    viewBoxToMM
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
