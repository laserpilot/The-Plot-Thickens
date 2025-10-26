#!/usr/bin/env node

/**
 * Split Compound Paths Tool
 * Splits SVG compound paths (paths with multiple 'm' move commands) into separate path elements
 */

const { Command } = require('commander');
const fs = require('fs');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

/**
 * Split a compound path into individual subpaths
 * @param {string} pathData - The d attribute value
 * @returns {Array<string>} Array of individual path data strings
 */
function splitCompoundPath(pathData) {
  // Split on 'm' or 'M' commands, keeping the delimiter
  // We use a regex that captures the move command with its coordinates
  const segments = [];
  let currentSegment = '';

  // Match 'm' or 'M' followed by optional whitespace and coordinates
  const moveCommandRegex = /\s*([mM])\s*/g;
  let lastIndex = 0;
  let match;
  let firstCommand = true;

  while ((match = moveCommandRegex.exec(pathData)) !== null) {
    if (!firstCommand) {
      // Save the previous segment (everything before this move command)
      const segmentData = pathData.substring(lastIndex, match.index).trim();
      if (segmentData) {
        currentSegment += ' ' + segmentData;
      }
      if (currentSegment.trim()) {
        segments.push(currentSegment.trim());
      }
      currentSegment = '';
    }

    // Start new segment with the move command
    currentSegment = match[1]; // 'm' or 'M'
    lastIndex = match.index + match[0].length;
    firstCommand = false;
  }

  // Add the final segment
  const finalData = pathData.substring(lastIndex).trim();
  if (finalData) {
    currentSegment += ' ' + finalData;
  }
  if (currentSegment.trim()) {
    segments.push(currentSegment.trim());
  }

  return segments.filter(s => s.length > 0);
}

/**
 * Parse SVG and split compound paths using XML parser
 * @param {string} svgContent - Raw SVG content
 * @returns {Object} Processing statistics and modified SVG
 */
function processCompoundPaths(svgContent) {
  let compoundPathsFound = 0;
  let totalSubpaths = 0;
  let pathsProcessed = 0;

  // Parse SVG as XML
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');

  // Find all path elements
  const paths = doc.getElementsByTagName('path');

  // Process paths in reverse order (so we can replace them without index issues)
  for (let i = paths.length - 1; i >= 0; i--) {
    const pathElement = paths[i];
    pathsProcessed++;

    const pathData = pathElement.getAttribute('d');
    if (!pathData) continue;

    // Count move commands (both 'm' and 'M')
    const moveCommands = (pathData.match(/[mM]\s/g) || []).length;

    // If only one move command, it's not a compound path
    if (moveCommands <= 1) {
      continue;
    }

    // This is a compound path
    compoundPathsFound++;

    // Split into subpaths
    const subpaths = splitCompoundPath(pathData);
    totalSubpaths += subpaths.length;

    // Get parent element
    const parent = pathElement.parentNode;
    if (!parent) continue;

    // Create new path elements for each subpath
    for (let j = 0; j < subpaths.length; j++) {
      const newPath = doc.createElement('path');

      // Copy all attributes except 'd'
      const attrs = pathElement.attributes;
      for (let k = 0; k < attrs.length; k++) {
        const attr = attrs[k];
        if (attr.name !== 'd') {
          newPath.setAttribute(attr.name, attr.value);
        }
      }

      // Set the new path data
      newPath.setAttribute('d', subpaths[j]);

      // Insert before the original path
      parent.insertBefore(newPath, pathElement);
    }

    // Remove the original compound path
    parent.removeChild(pathElement);
  }

  // Serialize back to string
  const serializer = new XMLSerializer();
  const modifiedSVG = serializer.serializeToString(doc);

  return {
    svg: modifiedSVG,
    stats: {
      pathsProcessed,
      compoundPathsFound,
      totalSubpaths,
      averageSubpaths: compoundPathsFound > 0 ? (totalSubpaths / compoundPathsFound).toFixed(1) : 0
    }
  };
}

/**
 * Split compound paths in an SVG file
 */
async function splitCompoundPaths(inputPath, outputPath, options = {}) {
  console.log(`Reading: ${inputPath}`);

  // Read input file
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const svgContent = fs.readFileSync(inputPath, 'utf-8');

  console.log('Processing compound paths...');

  // Process the SVG
  const result = processCompoundPaths(svgContent);

  // Report statistics
  console.log(`\nStatistics:`);
  console.log(`  Paths processed: ${result.stats.pathsProcessed}`);
  console.log(`  Compound paths found: ${result.stats.compoundPathsFound}`);
  console.log(`  Total subpaths extracted: ${result.stats.totalSubpaths}`);
  if (result.stats.compoundPathsFound > 0) {
    console.log(`  Average subpaths per compound path: ${result.stats.averageSubpaths}`);
  }

  // Write output
  fs.writeFileSync(outputPath, result.svg, 'utf-8');
  console.log(`\nOutput written to: ${outputPath}`);

  if (result.stats.compoundPathsFound === 0) {
    console.log('\n✓ No compound paths found - file is already clean!');
  } else {
    console.log(`\n✓ Split ${result.stats.compoundPathsFound} compound paths into ${result.stats.totalSubpaths} individual paths`);
    console.log(`\nNext steps:`);
    console.log(`  node flatten-svg.js "${outputPath}"  # If needed`);
    console.log(`  node process-svg.js "${outputPath}"`);
  }
}

// CLI setup
const program = new Command();

program
  .name('split-compound-paths')
  .description('Split SVG compound paths (paths with multiple move commands) into individual path elements')
  .version('1.0.0')
  .argument('<input>', 'Input SVG file')
  .argument('[output]', 'Output SVG file (defaults to <input>-split.svg)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (input, output, options) => {
    // Determine output path
    const outputPath = output || input.replace(/\.svg$/, '-split.svg');

    // Split the compound paths
    try {
      await splitCompoundPaths(input, outputPath, options);
    } catch (error) {
      console.error('\n✗ Error:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Parse arguments
program.parse();
