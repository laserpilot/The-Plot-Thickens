/**
 * SVG processor for path length-based weight manipulation
 */

const fs = require('fs');
const { measurePathLength, generatePasses, lengthToWeight } = require('./path-utils');

/**
 * Parse SVG and extract all path elements
 * @param {string} svgContent - Raw SVG content
 * @returns {Object} Parsed SVG data
 */
function parseSVG(svgContent) {
  // Extract SVG attributes
  const svgMatch = svgContent.match(/<svg[^>]*>/);
  if (!svgMatch) {
    throw new Error('Invalid SVG: No <svg> element found');
  }

  const svgTag = svgMatch[0];

  // Extract viewBox
  const viewBoxMatch = svgTag.match(/viewBox=["']([^"']+)["']/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : null;

  // Extract width/height
  const widthMatch = svgTag.match(/width=["']([^"']+)["']/);
  const heightMatch = svgTag.match(/height=["']([^"']+)["']/);
  const width = widthMatch ? widthMatch[1] : null;
  const height = heightMatch ? heightMatch[1] : null;

  // Check for non-path elements
  const nonPathShapes = ['polygon', 'polyline', 'line', 'rect', 'circle', 'ellipse'];
  const foundNonPath = [];

  for (const shape of nonPathShapes) {
    const regex = new RegExp(`<${shape}[^>]*>`, 'i');
    if (regex.test(svgContent)) {
      const count = (svgContent.match(new RegExp(`<${shape}[^>]*>`, 'gi')) || []).length;
      foundNonPath.push(`${count} <${shape}>`);
    }
  }

  if (foundNonPath.length > 0) {
    console.warn('\n⚠️  WARNING: Found non-path elements in SVG:');
    foundNonPath.forEach(item => console.warn(`   - ${item} elements`));
    console.warn('   These will be IGNORED. Run flatten-svg.js first to convert all shapes to paths:');
    console.warn('   node flatten-svg.js input.svg\n');
  }

  // Extract all path elements
  const pathRegex = /<path[^>]*\sd=["']([^"']+)["'][^>]*\/?>|<path[^>]*\sd=["']([^"']+)["'][^>]*>[\s\S]*?<\/path>/gi;
  const paths = [];
  let match;

  while ((match = pathRegex.exec(svgContent)) !== null) {
    const pathData = match[1] || match[2];
    if (pathData) {
      // Extract other attributes (stroke, fill, etc.)
      const pathElement = match[0];
      const strokeMatch = pathElement.match(/stroke=["']([^"']+)["']/);
      const fillMatch = pathElement.match(/fill=["']([^"']+)["']/);
      const strokeWidthMatch = pathElement.match(/stroke-width=["']([^"']+)["']/);

      paths.push({
        d: pathData,
        stroke: strokeMatch ? strokeMatch[1] : 'black',
        fill: fillMatch ? fillMatch[1] : 'none',
        strokeWidth: strokeWidthMatch ? strokeWidthMatch[1] : '0.3',
      });
    }
  }

  return {
    viewBox,
    width,
    height,
    paths,
  };
}

/**
 * Process SVG paths based on their lengths and stream to output
 * @param {Object} svgData - Parsed SVG data
 * @param {Object} config - Processing configuration
 * @param {Object} stream - Write stream for output (optional, for streaming)
 * @returns {Object} Processing stats
 */
function processPaths(svgData, config, stream = null) {
  // First pass: measure all paths to determine length range
  const lengths = svgData.paths.map((path) => ({
    path,
    length: measurePathLength(path.d),
  }));

  // Calculate min/max if not provided
  const allLengths = lengths.map((l) => l.length);
  const minLength = config.minLength ?? Math.min(...allLengths);
  const maxLength = config.maxLength ?? Math.max(...allLengths);

  console.log(`Path length range: ${minLength.toFixed(2)} - ${maxLength.toFixed(2)}`);

  let totalOutputPaths = 0;

  // Second pass: generate weighted duplicates and stream output
  lengths.forEach(({ path, length }, index) => {
    const passes = lengthToWeight(length, {
      minLength,
      maxLength,
      minPasses: config.minPasses,
      maxPasses: config.maxPasses,
      curve: config.curve,
      exponent: config.exponent,
    });

    // Log progress every 1000 paths
    if ((index + 1) % 1000 === 0) {
      console.log(`Processed ${index + 1}/${lengths.length} paths...`);
    }

    // Generate offset passes
    const duplicates = generatePasses(
      path.d,
      passes,
      config.baseOffset,
      config.noise
    );

    // Stream output directly if stream is provided
    if (stream) {
      duplicates.forEach((duplicatePath) => {
        stream.write(`    <path d="${duplicatePath}" fill="${path.fill}" stroke="${path.stroke}" stroke-width="${path.strokeWidth}" />\n`);
        totalOutputPaths++;
      });
    }
  });

  return { totalOutputPaths };
}

/**
 * Stream output SVG header to file
 * @param {Object} svgData - Original SVG data
 * @param {Object} stream - Write stream
 */
function writeSVGHeader(svgData, stream) {
  stream.write('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n');

  let svgOpenTag = '<svg xmlns="http://www.w3.org/2000/svg"';
  if (svgData.width) svgOpenTag += ` width="${svgData.width}"`;
  if (svgData.height) svgOpenTag += ` height="${svgData.height}"`;
  if (svgData.viewBox) svgOpenTag += ` viewBox="${svgData.viewBox}"`;
  svgOpenTag += '>';

  stream.write(svgOpenTag + '\n');
  stream.write('  <!-- Generated by plotter-line-thickener (Phase 2: Length-based weight) -->\n');
  stream.write('  <g id="processed-paths">\n');
}

/**
 * Stream output SVG footer to file
 * @param {Object} stream - Write stream
 */
function writeSVGFooter(stream) {
  stream.write('  </g>\n');
  stream.write('</svg>\n');
}

/**
 * Main processing function
 * @param {string} inputPath - Input SVG file path
 * @param {string} outputPath - Output SVG file path
 * @param {Object} config - Processing configuration
 */
function processFile(inputPath, outputPath, config) {
  console.log(`Processing: ${inputPath}`);
  console.log('Configuration:', JSON.stringify(config, null, 2));

  // Read input file
  const svgContent = fs.readFileSync(inputPath, 'utf-8');

  // Parse SVG
  const svgData = parseSVG(svgContent);
  console.log(`Found ${svgData.paths.length} paths`);

  // Create write stream for output
  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });

  // Write SVG header
  writeSVGHeader(svgData, writeStream);

  // Process paths and stream output
  const stats = processPaths(svgData, config, writeStream);
  console.log(`Generated ${stats.totalOutputPaths} total paths`);

  // Write SVG footer
  writeSVGFooter(writeStream);

  // Close stream
  writeStream.end();
  console.log(`Output written to: ${outputPath}`);
}

module.exports = {
  parseSVG,
  processPaths,
  writeSVGHeader,
  writeSVGFooter,
  processFile,
};
