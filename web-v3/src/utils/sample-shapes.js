/**
 * Test shape generator for sample preview
 * Creates simple SVG paths for testing fill parameters
 */

/**
 * Generate a circle path
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} r - Radius
 * @returns {string} SVG path data
 */
function circle(cx, cy, r) {
  // Use 4 bezier curves to approximate a circle
  const k = 0.5522847498; // magic number for circle approximation
  const kr = k * r;

  return `M ${cx},${cy - r} ` +
    `C ${cx + kr},${cy - r} ${cx + r},${cy - kr} ${cx + r},${cy} ` +
    `C ${cx + r},${cy + kr} ${cx + kr},${cy + r} ${cx},${cy + r} ` +
    `C ${cx - kr},${cy + r} ${cx - r},${cy + kr} ${cx - r},${cy} ` +
    `C ${cx - r},${cy - kr} ${cx - kr},${cy - r} ${cx},${cy - r} Z`;
}

/**
 * Generate a square path
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} size - Side length
 * @returns {string} SVG path data
 */
function square(cx, cy, size) {
  const half = size / 2;
  return `M ${cx - half},${cy - half} ` +
    `L ${cx + half},${cy - half} ` +
    `L ${cx + half},${cy + half} ` +
    `L ${cx - half},${cy + half} Z`;
}

/**
 * Generate a triangle path
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} size - Size
 * @returns {string} SVG path data
 */
function triangle(cx, cy, size) {
  const h = size * 0.866; // sqrt(3)/2
  return `M ${cx},${cy - size * 0.577} ` +
    `L ${cx + size / 2},${cy + h / 2} ` +
    `L ${cx - size / 2},${cy + h / 2} Z`;
}

/**
 * Generate a wavy line path (sine wave)
 * @param {number} startX - Starting X coordinate
 * @param {number} startY - Starting Y coordinate (center of wave)
 * @param {number} length - Total horizontal length
 * @param {number} amplitude - Wave height (peak to center)
 * @param {number} wavelength - Distance for one full wave cycle
 * @param {number} segments - Number of line segments per wavelength (smoothness)
 * @returns {string} SVG path data (open path)
 */
function wavyLine(startX, startY, length, amplitude, wavelength, segments = 16) {
  const points = [];
  const totalSegments = Math.ceil((length / wavelength) * segments);
  const dx = length / totalSegments;

  for (let i = 0; i <= totalSegments; i++) {
    const x = startX + i * dx;
    const phase = (i * dx / wavelength) * Math.PI * 2;
    const y = startY + Math.sin(phase) * amplitude;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }

  return 'M ' + points.join(' L ');
}

/**
 * Generate a zigzag line path (sharp peaks)
 * @param {number} startX - Starting X coordinate
 * @param {number} startY - Starting Y coordinate (center of zigzag)
 * @param {number} length - Total horizontal length
 * @param {number} amplitude - Zigzag height (peak to center)
 * @param {number} wavelength - Distance for one full zigzag cycle
 * @returns {string} SVG path data (open path)
 */
function zigzagLine(startX, startY, length, amplitude, wavelength) {
  const points = [];
  const cycles = length / wavelength;
  const quarterWave = wavelength / 4;

  let x = startX;
  points.push(`${x},${startY}`);

  for (let i = 0; i < cycles; i++) {
    // Up peak
    x += quarterWave;
    points.push(`${x.toFixed(2)},${(startY - amplitude).toFixed(2)}`);
    // Center
    x += quarterWave;
    points.push(`${x.toFixed(2)},${startY.toFixed(2)}`);
    // Down peak
    x += quarterWave;
    points.push(`${x.toFixed(2)},${(startY + amplitude).toFixed(2)}`);
    // Center
    x += quarterWave;
    if (x <= startX + length) {
      points.push(`${x.toFixed(2)},${startY.toFixed(2)}`);
    }
  }

  return 'M ' + points.join(' L ');
}

/**
 * Generate a star path
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} outerR - Outer radius
 * @param {number} innerR - Inner radius
 * @param {number} points - Number of points
 * @returns {string} SVG path data
 */
function star(cx, cy, outerR, innerR, points = 5) {
  let path = '';
  const angleStep = Math.PI / points;

  for (let i = 0; i < points * 2; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    path += (i === 0 ? 'M ' : 'L ') + `${x},${y} `;
  }

  return path + 'Z';
}

/**
 * Generate concentric shapes of varying sizes
 * @param {Function} shapeFn - Shape generation function
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} maxSize - Maximum size
 * @param {number} count - Number of concentric shapes
 * @returns {Array} Array of path objects
 */
function concentricShapes(shapeFn, cx, cy, maxSize, count) {
  const paths = [];
  const step = maxSize / count;

  for (let i = count; i > 0; i--) {
    const size = i * step;
    paths.push({
      id: `concentric-${i}`,
      d: shapeFn(cx, cy, size)
    });
  }

  return paths;
}

/**
 * Generate sample shapes based on type and complexity
 * @param {string} type - Shape type (circle, square, triangle, star, grid, mixed)
 * @param {number} size - Base size in mm
 * @param {string} complexity - Complexity level (simple, medium, complex)
 * @returns {Object} {paths: Array, bounds: Object}
 */
export function generateSampleShapes(type, size = 50, complexity = 'medium') {
  const paths = [];
  const margin = 20;
  const center = 100; // Use 200x200mm canvas

  // Determine number of shapes based on complexity
  const counts = {
    simple: 5,
    medium: 12,
    complex: 25
  };
  const count = counts[complexity] || counts.medium;

  switch (type) {
    case 'circle':
      paths.push(...concentricShapes(
        (cx, cy, r) => circle(cx, cy, r / 2),
        center, center, size, count
      ));
      break;

    case 'square':
      paths.push(...concentricShapes(
        square,
        center, center, size, count
      ));
      break;

    case 'triangle':
      paths.push(...concentricShapes(
        triangle,
        center, center, size, count
      ));
      break;

    case 'star':
      paths.push(...concentricShapes(
        (cx, cy, s) => star(cx, cy, s / 2, s / 4),
        center, center, size, count
      ));
      break;

    case 'grid': {
      // 3x3 grid of circles with varying sizes
      const gridSize = 3;
      const spacing = size * 1.5;
      const startX = center - spacing;
      const startY = center - spacing;

      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          const x = startX + col * spacing;
          const y = startY + row * spacing;
          // Vary radius based on position
          const radiusFactor = 0.3 + (row * gridSize + col) / (gridSize * gridSize) * 0.5;
          const radius = size * radiusFactor * 0.4;

          paths.push({
            id: `grid-${row}-${col}`,
            d: circle(x, y, radius)
          });
        }
      }
      break;
    }

    case 'mixed': {
      // Mix of different shapes at different positions
      const shapes = [
        { fn: circle, args: [center - size * 0.6, center - size * 0.6, size * 0.3] },
        { fn: square, args: [center + size * 0.6, center - size * 0.6, size * 0.6] },
        { fn: triangle, args: [center - size * 0.6, center + size * 0.6, size * 0.6] },
        { fn: (cx, cy) => star(cx, cy, size * 0.3, size * 0.15), args: [center + size * 0.6, center + size * 0.6] },
        { fn: circle, args: [center, center, size * 0.4] }
      ];

      shapes.forEach((shape, i) => {
        // Create concentric versions of each
        const subCount = Math.ceil(count / shapes.length);
        const [cx, cy, baseSize] = shape.args;

        for (let j = 0; j < subCount; j++) {
          const scale = 1 - (j / subCount) * 0.7;
          const scaledSize = (baseSize || size * 0.3) * scale;

          paths.push({
            id: `mixed-${i}-${j}`,
            d: shape.fn(cx, cy, scaledSize)
          });
        }
      });
      break;
    }

    case 'wavy': {
      // Array of wavy open paths with varying wavelengths and amplitudes
      // Great for testing curvature-based effects
      const lineLength = size * 1.8;
      const startX = center - lineLength / 2;
      const rowSpacing = size * 0.25;
      const numRows = Math.min(count, 10);

      // Different wave configurations: [wavelength, amplitude, type]
      const waveConfigs = [
        { wavelength: 8, amplitude: 3, type: 'sine', label: 'tight-small' },
        { wavelength: 15, amplitude: 6, type: 'sine', label: 'tight-medium' },
        { wavelength: 25, amplitude: 10, type: 'sine', label: 'medium' },
        { wavelength: 40, amplitude: 12, type: 'sine', label: 'gentle' },
        { wavelength: 60, amplitude: 15, type: 'sine', label: 'lazy' },
        { wavelength: 12, amplitude: 8, type: 'zigzag', label: 'zigzag-tight' },
        { wavelength: 25, amplitude: 10, type: 'zigzag', label: 'zigzag-medium' },
        { wavelength: 20, amplitude: 4, type: 'sine', label: 'shallow' },
        { wavelength: 20, amplitude: 15, type: 'sine', label: 'deep' },
        { wavelength: 35, amplitude: 8, type: 'sine', label: 'wide-shallow' },
      ];

      const startY = center - (numRows - 1) * rowSpacing / 2;

      for (let i = 0; i < numRows && i < waveConfigs.length; i++) {
        const config = waveConfigs[i];
        const y = startY + i * rowSpacing;

        if (config.type === 'zigzag') {
          paths.push({
            id: `wavy-${config.label}`,
            d: zigzagLine(startX, y, lineLength, config.amplitude, config.wavelength)
          });
        } else {
          paths.push({
            id: `wavy-${config.label}`,
            d: wavyLine(startX, y, lineLength, config.amplitude, config.wavelength)
          });
        }
      }
      break;
    }

    default:
      // Default to concentric circles
      paths.push(...concentricShapes(
        (cx, cy, r) => circle(cx, cy, r / 2),
        center, center, size, count
      ));
  }

  // Calculate bounds
  const bounds = {
    minX: margin,
    minY: margin,
    maxX: center * 2 - margin,
    maxY: center * 2 - margin,
    width: center * 2 - margin * 2,
    height: center * 2 - margin * 2,
    cx: center,
    cy: center
  };

  return { paths, bounds };
}

/**
 * Get description of sample shape
 */
export function getSampleDescription(type, complexity) {
  const counts = {
    simple: '5-10',
    medium: '10-20',
    complex: '20-40'
  };

  const descriptions = {
    circle: 'Concentric circles',
    square: 'Concentric squares',
    triangle: 'Concentric triangles',
    star: 'Concentric stars',
    grid: '3x3 grid of varying circles',
    mixed: 'Mixed shapes with variety',
    wavy: 'Wavy lines (open paths, various wavelengths)'
  };

  return `${descriptions[type] || 'Test shapes'} (${counts[complexity] || counts.medium} paths)`;
}
