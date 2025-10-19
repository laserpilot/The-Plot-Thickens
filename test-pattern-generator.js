#!/usr/bin/env node

/**
 * Phase 1: SVG Test Pattern Generator
 * Creates a grid showing different line pass counts and noise offset amounts
 * for pen plotter line weight testing
 */

// Configuration
const config = {
  passCounts: [1, 2, 3, 5, 10, 20],
  noiseAmounts: [0, 0.05, 0.1, 0.2, 0.5], // in mm
  cellSize: 30, // mm
  shapeSize: 8, // mm radius/half-width
  margin: 20, // mm
  labelSize: 2.5, // mm
  strokeWidth: 0.3, // mm (pen width)
};

// Calculate canvas dimensions
const gridWidth = config.passCounts.length;
const gridHeight = config.noiseAmounts.length;
const canvasWidth = config.margin * 2 + gridWidth * config.cellSize;
const canvasHeight = config.margin * 2 + gridHeight * config.cellSize;

// Helper: Generate random offset with noise
function randomOffset(baseOffset, noiseAmount) {
  return baseOffset + (Math.random() - 0.5) * noiseAmount * 2;
}

// Helper: Generate circle path with N passes and noise
function generateCircle(cx, cy, radius, passes, noise) {
  const paths = [];

  for (let i = 0; i < passes; i++) {
    // Calculate perpendicular offset for this pass
    const offsetRadius = radius + randomOffset(i * 0.1, noise);

    // Add slight rotation noise
    const rotationNoise = noise > 0 ? (Math.random() - 0.5) * 0.1 : 0;

    // Generate circle path
    const path = `M ${cx + offsetRadius} ${cy}
                  A ${offsetRadius} ${offsetRadius} ${rotationNoise} 0 1 ${cx - offsetRadius} ${cy}
                  A ${offsetRadius} ${offsetRadius} ${rotationNoise} 0 1 ${cx + offsetRadius} ${cy}`;

    paths.push(`  <path d="${path}" fill="none" stroke="black" stroke-width="${config.strokeWidth}" />`);
  }

  return paths.join('\n');
}

// Helper: Generate square path with N passes and noise
function generateSquare(cx, cy, size, passes, noise) {
  const paths = [];

  for (let i = 0; i < passes; i++) {
    // Calculate perpendicular offset for this pass
    const offsetSize = size + randomOffset(i * 0.1, noise);
    const half = offsetSize / 2;

    // Add slight position noise
    const xNoise = noise > 0 ? randomOffset(0, noise * 0.5) : 0;
    const yNoise = noise > 0 ? randomOffset(0, noise * 0.5) : 0;

    // Generate square path (closed)
    const x = cx + xNoise;
    const y = cy + yNoise;
    const path = `M ${x - half} ${y - half}
                  L ${x + half} ${y - half}
                  L ${x + half} ${y + half}
                  L ${x - half} ${y + half}
                  Z`;

    paths.push(`  <path d="${path}" fill="none" stroke="black" stroke-width="${config.strokeWidth}" />`);
  }

  return paths.join('\n');
}

// Helper: Generate text label
function generateLabel(x, y, text, size = config.labelSize) {
  return `  <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" fill="black" text-anchor="middle">${text}</text>`;
}

// Main SVG generation
function generateTestPattern() {
  const svgParts = [];

  // SVG header
  svgParts.push(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${canvasWidth}mm" height="${canvasHeight}mm"
     viewBox="0 0 ${canvasWidth} ${canvasHeight}"
     xmlns="http://www.w3.org/2000/svg">

  <!-- Test Pattern: Line Weight via Pass Count and Noise -->
  <g id="test-pattern">`);

  // Column headers (pass counts)
  svgParts.push('\n  <!-- Column headers -->');
  config.passCounts.forEach((passes, colIdx) => {
    const x = config.margin + colIdx * config.cellSize + config.cellSize / 2;
    const y = config.margin - 5;
    svgParts.push(generateLabel(x, y, `${passes}×`));
  });

  // Row headers (noise amounts)
  svgParts.push('\n  <!-- Row headers -->');
  config.noiseAmounts.forEach((noise, rowIdx) => {
    const x = config.margin - 5;
    const y = config.margin + rowIdx * config.cellSize + config.cellSize / 2 + 1;
    svgParts.push(generateLabel(x, y, `${noise}mm`, 2));
  });

  // Generate grid cells
  svgParts.push('\n  <!-- Grid cells -->');
  config.noiseAmounts.forEach((noise, rowIdx) => {
    config.passCounts.forEach((passes, colIdx) => {
      const cellX = config.margin + colIdx * config.cellSize;
      const cellY = config.margin + rowIdx * config.cellSize;
      const centerX = cellX + config.cellSize / 2;
      const centerY = cellY + config.cellSize / 2;

      svgParts.push(`\n  <!-- Cell: ${passes} passes, ${noise}mm noise -->`);

      // Circle (left side of cell)
      const circleX = centerX - config.shapeSize / 2;
      svgParts.push(generateCircle(circleX, centerY, config.shapeSize / 2, passes, noise));

      // Square (right side of cell)
      const squareX = centerX + config.shapeSize / 2;
      svgParts.push(generateSquare(squareX, centerY, config.shapeSize, passes, noise));
    });
  });

  // Title
  svgParts.push('\n  <!-- Title -->');
  const titleY = canvasHeight - config.margin / 2;
  svgParts.push(generateLabel(canvasWidth / 2, titleY, 'Passes (columns) × Noise offset (rows)', 3));

  // Close SVG
  svgParts.push(`
  </g>
</svg>`);

  return svgParts.join('\n');
}

// Generate and output
const svg = generateTestPattern();
console.log(svg);
