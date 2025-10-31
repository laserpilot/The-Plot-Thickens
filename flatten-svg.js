#!/usr/bin/env node

/**
 * SVG Flattening Tool
 * Converts all SVG shapes to paths and applies transforms
 */

const { Command } = require('commander');
const fs = require('fs');
const { parse, stringify } = require('svgson');
const { pathToAbsolute, pathToString } = require('svg-path-commander');

/**
 * Convert various SVG shapes to path data
 */
function shapeToPath(node) {
  const { name, attributes } = node;

  switch (name) {
    case 'line': {
      const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = attributes;
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }

    case 'rect': {
      const { x = 0, y = 0, width = 0, height = 0, rx = 0, ry = 0 } = attributes;
      const w = parseFloat(width);
      const h = parseFloat(height);
      const px = parseFloat(x);
      const py = parseFloat(y);
      const radiusX = parseFloat(rx);
      const radiusY = parseFloat(ry || rx);

      if (radiusX > 0 || radiusY > 0) {
        // Rounded rectangle
        const rX = Math.min(radiusX, w / 2);
        const rY = Math.min(radiusY, h / 2);
        return `M ${px + rX} ${py}
                L ${px + w - rX} ${py}
                A ${rX} ${rY} 0 0 1 ${px + w} ${py + rY}
                L ${px + w} ${py + h - rY}
                A ${rX} ${rY} 0 0 1 ${px + w - rX} ${py + h}
                L ${px + rX} ${py + h}
                A ${rX} ${rY} 0 0 1 ${px} ${py + h - rY}
                L ${px} ${py + rY}
                A ${rX} ${rY} 0 0 1 ${px + rX} ${py} Z`;
      } else {
        // Regular rectangle
        return `M ${px} ${py} L ${px + w} ${py} L ${px + w} ${py + h} L ${px} ${py + h} Z`;
      }
    }

    case 'circle': {
      const { cx = 0, cy = 0, r = 0 } = attributes;
      const pcx = parseFloat(cx);
      const pcy = parseFloat(cy);
      const pr = parseFloat(r);
      return `M ${pcx - pr} ${pcy}
              A ${pr} ${pr} 0 0 1 ${pcx} ${pcy - pr}
              A ${pr} ${pr} 0 0 1 ${pcx + pr} ${pcy}
              A ${pr} ${pr} 0 0 1 ${pcx} ${pcy + pr}
              A ${pr} ${pr} 0 0 1 ${pcx - pr} ${pcy} Z`;
    }

    case 'ellipse': {
      const { cx = 0, cy = 0, rx = 0, ry = 0 } = attributes;
      const pcx = parseFloat(cx);
      const pcy = parseFloat(cy);
      const prx = parseFloat(rx);
      const pry = parseFloat(ry);
      return `M ${pcx - prx} ${pcy}
              A ${prx} ${pry} 0 0 1 ${pcx} ${pcy - pry}
              A ${prx} ${pry} 0 0 1 ${pcx + prx} ${pcy}
              A ${prx} ${pry} 0 0 1 ${pcx} ${pcy + pry}
              A ${prx} ${pry} 0 0 1 ${pcx - prx} ${pcy} Z`;
    }

    case 'polygon': {
      const { points = '', d } = attributes;
      // Handle non-standard polygon with d attribute (Inkscape sometimes does this)
      if (d) {
        return d;
      }
      const coords = points.trim().split(/[\s,]+/).map(parseFloat);
      if (coords.length < 4) return null;

      let path = `M ${coords[0]} ${coords[1]}`;
      for (let i = 2; i < coords.length; i += 2) {
        path += ` L ${coords[i]} ${coords[i + 1]}`;
      }
      path += ' Z';
      return path;
    }

    case 'polyline': {
      const { points = '' } = attributes;
      const coords = points.trim().split(/[\s,]+/).map(parseFloat);
      if (coords.length < 4) return null;

      let path = `M ${coords[0]} ${coords[1]}`;
      for (let i = 2; i < coords.length; i += 2) {
        path += ` L ${coords[i]} ${coords[i + 1]}`;
      }
      return path;
    }

    default:
      return null;
  }
}

/**
 * Parse SVG transform attribute to matrix
 */
function parseTransform(transformStr) {
  if (!transformStr) return [1, 0, 0, 1, 0, 0]; // Identity matrix

  // Handle matrix(...) format
  const matrixMatch = transformStr.match(/matrix\s*\(\s*([^)]+)\s*\)/);
  if (matrixMatch) {
    const values = matrixMatch[1].split(/[\s,]+/).map(parseFloat);
    if (values.length === 6) {
      return values; // [a, b, c, d, e, f]
    }
  }

  // Handle translate(...) format
  const translateMatch = transformStr.match(/translate\s*\(\s*([^)]+)\s*\)/);
  if (translateMatch) {
    const values = translateMatch[1].split(/[\s,]+/).map(parseFloat);
    const tx = values[0] || 0;
    const ty = values[1] || 0;
    return [1, 0, 0, 1, tx, ty];
  }

  // Handle scale(...) format
  const scaleMatch = transformStr.match(/scale\s*\(\s*([^)]+)\s*\)/);
  if (scaleMatch) {
    const values = scaleMatch[1].split(/[\s,]+/).map(parseFloat);
    const sx = values[0] || 1;
    const sy = values[1] || sx;
    return [sx, 0, 0, sy, 0, 0];
  }

  return [1, 0, 0, 1, 0, 0]; // Default to identity
}

/**
 * Apply transform matrix to a point
 */
function transformPoint(x, y, matrix) {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * x + c * y + e,
    y: b * x + d * y + f
  };
}

/**
 * Apply transform to path data
 */
function applyTransformToPath(pathData, transform) {
  if (!transform) return pathData;

  try {
    const matrix = parseTransform(transform);

    // If identity matrix, no transform needed
    if (matrix[0] === 1 && matrix[1] === 0 && matrix[2] === 0 &&
        matrix[3] === 1 && matrix[4] === 0 && matrix[5] === 0) {
      return pathData;
    }

    // Convert to absolute coordinates
    const absolutePath = pathToAbsolute(pathData);

    // Parse path commands and apply transform to coordinates
    const commandRegex = /([MLHVCSQTAZ])\s*([^MLHVCSQTAZ]*)/gi;
    let transformedPath = '';
    let match;

    while ((match = commandRegex.exec(absolutePath)) !== null) {
      const command = match[1].toUpperCase();
      const coords = match[2].trim();

      if (!coords) {
        transformedPath += command;
        continue;
      }

      const numbers = coords.split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));

      transformedPath += command;

      // Apply transform to coordinate pairs
      if (['M', 'L', 'T'].includes(command)) {
        // Commands with (x, y) pairs
        for (let i = 0; i < numbers.length; i += 2) {
          const transformed = transformPoint(numbers[i], numbers[i + 1], matrix);
          transformedPath += ` ${transformed.x.toFixed(6)} ${transformed.y.toFixed(6)}`;
        }
      } else if (command === 'H') {
        // Horizontal line - transform x coordinate
        for (let i = 0; i < numbers.length; i++) {
          const transformed = transformPoint(numbers[i], 0, matrix);
          transformedPath += ` ${transformed.x.toFixed(6)}`;
        }
      } else if (command === 'V') {
        // Vertical line - transform y coordinate
        for (let i = 0; i < numbers.length; i++) {
          const transformed = transformPoint(0, numbers[i], matrix);
          transformedPath += ` ${transformed.y.toFixed(6)}`;
        }
      } else if (['C', 'S', 'Q'].includes(command)) {
        // Cubic/quadratic bezier - transform all control points
        for (let i = 0; i < numbers.length; i += 2) {
          const transformed = transformPoint(numbers[i], numbers[i + 1], matrix);
          transformedPath += ` ${transformed.x.toFixed(6)} ${transformed.y.toFixed(6)}`;
        }
      } else if (command === 'A') {
        // Arc - complex, needs special handling
        // For now, transform endpoints and scale radii
        for (let i = 0; i < numbers.length; i += 7) {
          const rx = numbers[i] * matrix[0]; // Scale radius x
          const ry = numbers[i + 1] * matrix[3]; // Scale radius y
          const xRot = numbers[i + 2]; // x-axis rotation
          const largeArc = numbers[i + 3];
          const sweep = numbers[i + 4];
          const endPoint = transformPoint(numbers[i + 5], numbers[i + 6], matrix);
          transformedPath += ` ${rx.toFixed(6)} ${ry.toFixed(6)} ${xRot} ${largeArc} ${sweep} ${endPoint.x.toFixed(6)} ${endPoint.y.toFixed(6)}`;
        }
      } else if (command === 'Z') {
        // Close path - no coordinates
      }
    }

    return transformedPath.trim();
  } catch (error) {
    console.warn('Failed to apply transform:', error.message);
    return pathData;
  }
}

/**
 * Multiply two transformation matrices
 */
function multiplyMatrices(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;

  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}

/**
 * Convert matrix to transform string
 */
function matrixToString(matrix) {
  return `matrix(${matrix.join(' ')})`;
}

/**
 * Recursively process SVG nodes and convert to paths
 */
function processNode(node, inheritedAttrs = {}, inheritedTransform = null) {
  const { name, attributes = {}, children = [] } = node;

  // Accumulate transforms from parent groups
  let currentTransform = inheritedTransform;
  if (attributes.transform) {
    const nodeMatrix = parseTransform(attributes.transform);
    if (currentTransform) {
      const parentMatrix = parseTransform(currentTransform);
      currentTransform = matrixToString(multiplyMatrices(parentMatrix, nodeMatrix));
    } else {
      currentTransform = attributes.transform;
    }
  }

  // Merge inherited attributes (stroke, fill, etc.)
  const currentAttrs = {
    stroke: inheritedAttrs.stroke || attributes.stroke || 'black',
    fill: inheritedAttrs.fill || attributes.fill || 'none',
    strokeWidth: inheritedAttrs['stroke-width'] || attributes['stroke-width'] || '0.3',
  };

  const paths = [];

  // If this is a shape that can be converted to path
  if (['line', 'rect', 'circle', 'ellipse', 'polygon', 'polyline'].includes(name)) {
    const pathData = shapeToPath(node);
    if (pathData) {
      const transformedPath = applyTransformToPath(pathData, currentTransform);
      paths.push({
        d: transformedPath,
        ...currentAttrs,
      });
    }
  }

  // If this is already a path
  if (name === 'path' && attributes.d) {
    const transformedPath = applyTransformToPath(attributes.d, currentTransform);
    paths.push({
      d: transformedPath,
      stroke: attributes.stroke || currentAttrs.stroke,
      fill: attributes.fill || currentAttrs.fill,
      strokeWidth: attributes['stroke-width'] || currentAttrs.strokeWidth,
    });
  }

  // Recurse into children (groups, layers, etc.)
  if (children && children.length > 0) {
    for (const child of children) {
      paths.push(...processNode(child, currentAttrs, currentTransform));
    }
  }

  return paths;
}

/**
 * Flatten SVG file
 */
async function flattenSVG(inputPath, outputPath) {
  console.log(`Flattening: ${inputPath}`);

  // Read input file
  const svgContent = fs.readFileSync(inputPath, 'utf-8');

  // Parse SVG
  const parsed = await parse(svgContent);

  // Extract SVG attributes
  const svgAttrs = parsed.attributes || {};
  const viewBox = svgAttrs.viewBox || '0 0 100 100';
  const width = svgAttrs.width || '100';
  const height = svgAttrs.height || '100';

  console.log('Parsing SVG structure...');

  // Process all nodes to extract paths
  const paths = processNode(parsed);

  console.log(`Extracted ${paths.length} paths from all shapes and layers`);

  // Build output SVG
  const output = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">
  <!-- Flattened by plotter-line-thickener -->
  <g id="flattened-paths">
${paths.map(p => `    <path d="${p.d}" stroke="${p.stroke}" fill="${p.fill}" stroke-width="${p.strokeWidth}" />`).join('\n')}
  </g>
</svg>`;

  // Write output
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`Flattened SVG written to: ${outputPath}`);
  console.log(`\nNext steps:`);
  console.log(`  node process-svg.js "${outputPath}"`);
}

// CLI setup
const program = new Command();

program
  .name('flatten-svg')
  .description('Flatten SVG by converting all shapes to paths and applying transforms')
  .version('0.1.0')
  .argument('<input>', 'Input SVG file')
  .argument('[output]', 'Output SVG file (defaults to <input>-flattened.svg)')
  .action(async (input, output) => {
    // Determine output path
    const outputPath = output || input.replace(/\.svg$/, '-flattened.svg');

    // Validate input file exists
    if (!fs.existsSync(input)) {
      console.error(`Input file not found: ${input}`);
      process.exit(1);
    }

    // Flatten the SVG
    try {
      await flattenSVG(input, outputPath);
      console.log('\n✓ Flattening complete!');
    } catch (error) {
      console.error('\n✗ Flattening failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  });

// Parse arguments
program.parse();
