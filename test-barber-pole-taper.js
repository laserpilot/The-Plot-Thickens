#!/usr/bin/env node

/**
 * Barber Pole Taper Test Matrix Generator
 *
 * Generates an SVG showing a grid of barber pole samples with different
 * stripe taper parameters to help visualize the effect of:
 * - Edge sharpness: How pointy the stripe pinch is at transitions
 * - Middle angle: How steep the diagonal slope is in the middle
 *
 * Usage:
 *   node test-barber-pole-taper.js [output.svg]
 *   node test-barber-pole-taper.js --edge-range 0.5,3,0.5 --angle-range 0.5,2,0.5
 *
 * Options:
 *   --edge-range min,max,step   Range for edge sharpness (default: 0.5,3,0.5)
 *   --angle-range min,max,step  Range for middle angle (default: 0.5,2,0.5)
 *   --sample-path simple|wavy   Sample path type (default: wavy)
 */

import { generateBarberPoleSmooth } from './shared/geometry/path-utils.js';
import fs from 'fs';

// Parse command line arguments
const args = process.argv.slice(2);
let outputFile = 'barber-pole-taper-test.svg';
let edgeRange = [0.5, 3, 0.5];  // min, max, step
let angleRange = [0.5, 2, 0.5];
let samplePathType = 'wavy';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--edge-range' && args[i + 1]) {
    edgeRange = args[i + 1].split(',').map(parseFloat);
    i++;
  } else if (args[i] === '--angle-range' && args[i + 1]) {
    angleRange = args[i + 1].split(',').map(parseFloat);
    i++;
  } else if (args[i] === '--sample-path' && args[i + 1]) {
    samplePathType = args[i + 1];
    i++;
  } else if (!args[i].startsWith('--')) {
    outputFile = args[i];
  }
}

// Generate parameter value arrays
const edgeValues = [];
for (let v = edgeRange[0]; v <= edgeRange[1]; v += edgeRange[2]) {
  edgeValues.push(Math.round(v * 100) / 100);
}

const angleValues = [];
for (let v = angleRange[0]; v <= angleRange[1]; v += angleRange[2]) {
  angleValues.push(Math.round(v * 100) / 100);
}

console.log(`Generating ${edgeValues.length} x ${angleValues.length} test matrix...`);
console.log(`Edge sharpness values: ${edgeValues.join(', ')}`);
console.log(`Middle angle values: ${angleValues.join(', ')}`);

// Sample path generator
function generateSamplePath(type, centerX, centerY, width, height) {
  if (type === 'simple') {
    // Simple horizontal line
    return `M ${centerX - width/2} ${centerY} L ${centerX + width/2} ${centerY}`;
  } else {
    // Wavy path (sine wave)
    const points = [];
    const segments = 20;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = centerX - width/2 + t * width;
      const y = centerY + Math.sin(t * Math.PI * 2) * (height / 4);
      points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
    }
    return points.join(' ');
  }
}

// Grid layout
const cellWidth = 80;
const cellHeight = 80;
const padding = 15;
const labelHeight = 20;
const headerHeight = 30;
const leftLabelWidth = 50;

const gridWidth = edgeValues.length * cellWidth + leftLabelWidth + padding * 2;
const gridHeight = angleValues.length * cellHeight + headerHeight + padding * 2;

// SVG header
const svgParts = [];
svgParts.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
svgParts.push(`<svg width="${gridWidth}mm" height="${gridHeight}mm" viewBox="0 0 ${gridWidth} ${gridHeight}" xmlns="http://www.w3.org/2000/svg">`);
svgParts.push('  <style>');
svgParts.push('    text { font-family: monospace; font-size: 3px; fill: #333; }');
svgParts.push('    .header { font-size: 4px; font-weight: bold; }');
svgParts.push('    .cell-border { fill: none; stroke: #ddd; stroke-width: 0.1; }');
svgParts.push('  </style>');

// Title
svgParts.push(`  <text x="${gridWidth/2}" y="8" text-anchor="middle" class="header">Barber Pole Stripe Taper Test Matrix</text>`);
svgParts.push(`  <text x="${gridWidth/2}" y="13" text-anchor="middle" style="font-size: 2.5px;">Edge Sharpness (horizontal) vs Middle Angle (vertical)</text>`);

// Column headers (edge sharpness values)
svgParts.push('  <g id="column-headers">');
for (let i = 0; i < edgeValues.length; i++) {
  const x = leftLabelWidth + padding + i * cellWidth + cellWidth / 2;
  const y = headerHeight - 5;
  svgParts.push(`    <text x="${x}" y="${y}" text-anchor="middle">edge=${edgeValues[i]}</text>`);
}
svgParts.push('  </g>');

// Generate grid cells
for (let row = 0; row < angleValues.length; row++) {
  const angleValue = angleValues[row];
  const cellY = headerHeight + padding + row * cellHeight;

  // Row header (middle angle value)
  const labelX = leftLabelWidth - 5;
  const labelY = cellY + cellHeight / 2 + 2;
  svgParts.push(`  <text x="${labelX}" y="${labelY}" text-anchor="end">angle=${angleValue}</text>`);

  for (let col = 0; col < edgeValues.length; col++) {
    const edgeValue = edgeValues[col];
    const cellX = leftLabelWidth + padding + col * cellWidth;

    // Cell border
    svgParts.push(`  <rect x="${cellX}" y="${cellY}" width="${cellWidth}" height="${cellHeight}" class="cell-border"/>`);

    // Generate sample barber pole with these parameters
    const samplePath = generateSamplePath(
      samplePathType,
      cellX + cellWidth / 2,
      cellY + cellHeight / 2,
      cellWidth - 20,
      cellHeight - 20
    );

    try {
      const barberPolePaths = generateBarberPoleSmooth(samplePath, {
        stripeCount: 2,
        twistFrequency: 0.3,
        twistRateMode: 'constant',
        envelope: 'sinTaperBoth',
        maxWidth: 8,
        minWidth: 0,
        stripeHeight: null,  // auto
        stripeGapRatio: 0.5,
        lineSpacing: 0.5,
        stripeTaperEdgeSharpness: edgeValue,
        stripeTaperMiddleAngle: angleValue,
        showGapOutlines: false,
        sampleRate: 0.5
      });

      // Render paths
      svgParts.push(`  <g id="cell-${row}-${col}">`);
      barberPolePaths.forEach(pathD => {
        svgParts.push(`    <path d="${pathD}" fill="none" stroke="black" stroke-width="0.1"/>`);
      });
      svgParts.push('  </g>');

    } catch (err) {
      // If generation fails, show error
      svgParts.push(`  <text x="${cellX + cellWidth/2}" y="${cellY + cellHeight/2}" text-anchor="middle" fill="red" font-size="2px">ERROR</text>`);
      console.error(`Error at edge=${edgeValue}, angle=${angleValue}:`, err.message);
    }
  }
}

svgParts.push('</svg>');

// Write to file
const svgContent = svgParts.join('\n');
fs.writeFileSync(outputFile, svgContent, 'utf8');

console.log(`✓ Test matrix generated: ${outputFile}`);
console.log(`  Grid size: ${edgeValues.length} columns × ${angleValues.length} rows`);
console.log(`  SVG dimensions: ${gridWidth.toFixed(1)}mm × ${gridHeight.toFixed(1)}mm`);
