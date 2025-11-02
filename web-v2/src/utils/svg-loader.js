/**
 * SVG file loading and parsing utilities
 */

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

  // Extract all path elements
  const pathElements = svgEl.querySelectorAll('path');
  const paths = Array.from(pathElements).map((pathEl, index) => ({
    id: pathEl.id || `path-${index}`,
    d: pathEl.getAttribute('d'),
    fill: pathEl.getAttribute('fill'),
    stroke: pathEl.getAttribute('stroke'),
    strokeWidth: pathEl.getAttribute('stroke-width'),
    transform: pathEl.getAttribute('transform')
  })).filter(p => p.d); // Only paths with data

  return {
    raw: svgText,
    bounds,
    paths,
    metadata
  };
}

function extractBounds(svgEl) {
  const viewBox = svgEl.getAttribute('viewBox');

  if (viewBox) {
    const [x, y, width, height] = viewBox.split(/\s+/).map(parseFloat);
    return {
      x,
      y,
      width,
      height,
      cx: x + width / 2,
      cy: y + height / 2
    };
  }

  // Fallback to width/height attributes
  const width = parseFloat(svgEl.getAttribute('width')) || 100;
  const height = parseFloat(svgEl.getAttribute('height')) || 100;

  return {
    x: 0,
    y: 0,
    width,
    height,
    cx: width / 2,
    cy: height / 2
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
