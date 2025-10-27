/**
 * SVG processor for path length-based weight manipulation
 */

const fs = require('fs');
const { measurePathLength, generatePasses, lengthToWeight, getEnvelopePreset } = require('./path-utils');
const { AttractorSystem } = require('./attractor');
const { pathToAbsolute, getPointAtLength, getTotalLength } = require('svg-path-commander');

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
 * Sample points along a path for attractor weight calculation
 * @param {string} pathData - SVG path d attribute
 * @param {number} sampleInterval - Distance between samples in mm (default: 5)
 * @returns {Array} Array of {x, y} points
 */
function samplePathPoints(pathData, sampleInterval = 5) {
  try {
    const absolutePath = pathToAbsolute(pathData);
    const totalLength = getTotalLength(absolutePath);

    if (totalLength === 0) {
      return [];
    }

    const numSamples = Math.max(5, Math.ceil(totalLength / sampleInterval));
    const points = [];

    for (let i = 0; i <= numSamples; i++) {
      const arcLength = (i / numSamples) * totalLength;
      const point = getPointAtLength(absolutePath, arcLength);
      if (point && !isNaN(point.x) && !isNaN(point.y)) {
        points.push({ x: point.x, y: point.y });
      }
    }

    return points;
  } catch (error) {
    console.warn('Failed to sample path points:', error.message);
    return [];
  }
}

/**
 * Compute quantile boundaries for binning
 * @param {number[]} sortedLengths - Sorted array of lengths
 * @param {number} numBins - Number of bins
 * @returns {number[]} Array of bin boundary values (length = numBins + 1)
 */
function computeQuantileBoundaries(sortedLengths, numBins) {
  const boundaries = [];
  for (let i = 0; i <= numBins; i++) {
    const quantile = i / numBins;
    const index = Math.floor(quantile * (sortedLengths.length - 1));
    boundaries.push(sortedLengths[index]);
  }
  // Ensure the last boundary is exactly the max value
  boundaries[boundaries.length - 1] = sortedLengths[sortedLengths.length - 1];
  return boundaries;
}

/**
 * Determine which bin a length belongs to
 * @param {number} length - Path length
 * @param {number[]} boundaries - Bin boundaries
 * @returns {number} Bin index (0-based)
 */
function getBinIndex(length, boundaries) {
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (length >= boundaries[i] && length <= boundaries[i + 1]) {
      return i;
    }
  }
  // Fallback to last bin
  return boundaries.length - 2;
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
  let outlinePaths = []; // Collect outline paths separately for grouping

  // Initialize attractor system if attractors are provided
  let attractorSystem = null;
  if (config.attractorPreset) {
    attractorSystem = new AttractorSystem();
    attractorSystem.importPreset(config.attractorPreset);
    console.log(`Using attractor-based weighting (${attractorSystem.attractors.length} attractors)`);
  }

  // Determine offset mode and envelope
  const useNormalMode = config.offsetMode === 'normal';
  const envelope = useNormalMode ? getEnvelopePreset(config.envelope) : null;

  console.log(`Offset mode: ${config.offsetMode}`);
  if (useNormalMode) {
    console.log(`Envelope: ${config.envelope}`);
  }

  // Binning setup (if enabled)
  let binBoundaries = null;
  let bins = null;
  if (config.bins && config.bins > 0) {
    const sortedLengths = [...allLengths].sort((a, b) => a - b);
    binBoundaries = computeQuantileBoundaries(sortedLengths, config.bins);
    bins = Array.from({ length: config.bins }, () => []);
    console.log(`Binning enabled: ${config.bins} bins`);
    console.log(`Bin boundaries: ${binBoundaries.map(b => b.toFixed(2)).join(', ')}`);
  }

  // Second pass: generate weighted duplicates
  lengths.forEach(({ path, length }, index) => {
    let passes;

    // Calculate weight using attractors or length-based
    if (attractorSystem) {
      // Use attractor-based weighting
      const pathPoints = samplePathPoints(path.d, attractorSystem.config.arcLengthSampleInterval);
      passes = attractorSystem.calculatePathWeight(pathPoints, length);
    } else {
      // Use length-based weighting
      passes = lengthToWeight(length, {
        minLength,
        maxLength,
        minPasses: config.minPasses,
        maxPasses: config.maxPasses,
        curve: config.curve,
        exponent: config.exponent,
      });
    }

    // Log progress every 1000 paths
    if ((index + 1) % 1000 === 0) {
      console.log(`Processed ${index + 1}/${lengths.length} paths...`);
    }

    // Generate offset passes with mode and envelope
    const pathId = `path-${index}`;
    const fillMode = config.fillMode || 'offset';

    // Determine options based on fill mode
    let fillModeOptions = null;
    if (fillMode === 'crosshatch') {
      fillModeOptions = config.crosshatch || null;
    } else if (fillMode === 'hatch-gradient' && config.hatchGradient) {
      // Convert hatch-gradient config to crosshatchOptions format expected by generatePasses
      const lightMode = config.hatchGradient.lightMode || 'directional';

      // Convert % light position to user units for point mode
      const viewBox = parsedSVG.viewBox || { x: 0, y: 0, width: 100, height: 100 };
      const lightPosXUser = (config.hatchGradient.lightPosX / 100) * viewBox.width;
      const lightPosYUser = (config.hatchGradient.lightPosY / 100) * viewBox.height;

      fillModeOptions = {
        angles: config.hatchGradient.angles || [0, 45, 90],
        spacing: config.hatchGradient.spacing || 1,
        lightMode: lightMode,
        lightAngle: config.hatchGradient.lightAngle || 45,
        lightPosX: lightPosXUser,
        lightPosY: lightPosYUser,
        falloffRadius: config.hatchGradient.falloffRadius || 100,
        lightStrength: config.hatchGradient.lightStrength || 0.8,
        baseWeight: config.hatchGradient.baseWeight || 0.2,
        shadowSoftness: config.hatchGradient.shadowSoftness || 0.5
      };
    } else if (fillMode === 'stippling') {
      fillModeOptions = config.stippling || null;
    }

    const extractOutline = config.addOutline || false;

    const stripeFilled = fillMode === 'striped' ? (config.stripeFilled || 1) : 1;
    const stripeEmpty = fillMode === 'striped' ? (config.stripeEmpty || 1) : 1;

    const result = generatePasses(
      path.d,
      passes,
      config.baseOffset,
      config.noise,
      null, // seed (auto-generated)
      pathId,
      envelope,
      useNormalMode,
      config.noiseFrequency || 50, // Noise wavelength
      config.sampleRate || 2, // Sample rate in mm
      fillMode, // Fill mode: 'offset', 'crosshatch', 'stippling', 'hatch-gradient', or 'striped'
      fillModeOptions, // Fill mode specific options
      extractOutline, // Extract outline if requested
      stripeFilled, // Number of filled paths in stripe pattern
      stripeEmpty // Number of empty paths in stripe pattern
    );

    // Handle result (either array or {fills, outlines} object)
    let duplicates, outlines;
    if (extractOutline && result.fills) {
      duplicates = result.fills;
      outlines = result.outlines || [];
    } else {
      duplicates = Array.isArray(result) ? result : [];
      outlines = [];
    }

    // Collect paths for binning or write directly
    if (bins && binBoundaries) {
      const binIndex = getBinIndex(length, binBoundaries);
      bins[binIndex].push({ duplicates, outlines, path });
      totalOutputPaths += duplicates.length + outlines.length;
    } else if (stream) {
      // Direct streaming (no binning)
      // Write fill paths immediately
      duplicates.forEach((duplicatePath) => {
        stream.write(`    <path d="${duplicatePath}" fill="${path.fill}" stroke="${path.stroke}" stroke-width="${path.strokeWidth}" />\n`);
        totalOutputPaths++;
      });
      // Collect outline paths for separate group
      outlines.forEach((outlinePath) => {
        outlinePaths.push({
          d: outlinePath,
          fill: 'none',
          stroke: path.stroke,
          strokeWidth: path.strokeWidth
        });
        totalOutputPaths++;
      });
    }
  });

  return { totalOutputPaths, bins, binBoundaries, outlinePaths };
}

/**
 * Stream output SVG header to file
 * @param {Object} svgData - Original SVG data
 * @param {Object} stream - Write stream
 * @param {Object} config - Processing configuration
 */
function writeSVGHeader(svgData, stream, config = {}) {
  stream.write('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n');

  let svgOpenTag = '<svg xmlns="http://www.w3.org/2000/svg"';
  if (svgData.width) svgOpenTag += ` width="${svgData.width}"`;
  if (svgData.height) svgOpenTag += ` height="${svgData.height}"`;
  if (svgData.viewBox) svgOpenTag += ` viewBox="${svgData.viewBox}"`;
  svgOpenTag += '>';

  stream.write(svgOpenTag + '\n');

  const mode = config.offsetMode === 'normal' ? 'Normal-based offset' : 'Length-based weight';
  const envelopeInfo = config.offsetMode === 'normal' ? `, envelope: ${config.envelope}` : '';
  stream.write(`  <!-- Generated by plotter-line-thickener (${mode}${envelopeInfo}) -->\n`);
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

  // Write SVG header with config info
  writeSVGHeader(svgData, writeStream, config);

  // Process paths (with or without binning)
  const stats = processPaths(svgData, config, config.bins ? null : writeStream);
  console.log(`Generated ${stats.totalOutputPaths} total paths`);

  // If binning is enabled, write binned output
  if (stats.bins && stats.binBoundaries) {
    const binOutlines = writeBinnedOutput(writeStream, stats.bins, stats.binBoundaries);
    // Write outline group after binned fills
    if (binOutlines && binOutlines.length > 0) {
      writeOutlineGroup(writeStream, binOutlines);
    }
  } else if (stats.outlinePaths && stats.outlinePaths.length > 0) {
    // Write outline group after non-binned fills
    writeOutlineGroup(writeStream, stats.outlinePaths);
  }

  // Write SVG footer
  writeSVGFooter(writeStream);

  // Close stream
  writeStream.end();
  console.log(`Output written to: ${outputPath}`);
}

/**
 * Write binned paths to stream with group tags
 * @param {Object} stream - Write stream
 * @param {Array[]} bins - Array of bins containing path data
 * @param {number[]} boundaries - Bin boundaries
 * @returns {Array} Collected outline paths
 */
function writeBinnedOutput(stream, bins, boundaries) {
  const collectedOutlines = [];

  bins.forEach((bin, binIndex) => {
    const minVal = boundaries[binIndex];
    const maxVal = boundaries[binIndex + 1];
    const minPct = Math.round((binIndex / bins.length) * 100);
    const maxPct = Math.round(((binIndex + 1) / bins.length) * 100);

    const groupId = `length-band-${minPct}-${maxPct}pct`;
    const groupLabel = `Length: ${minVal.toFixed(2)} - ${maxVal.toFixed(2)} (${minPct}-${maxPct}%, ${bin.length} paths)`;

    stream.write(`    <g id="${groupId}" data-length-range="${minVal.toFixed(2)}-${maxVal.toFixed(2)}">\n`);
    stream.write(`      <!-- ${groupLabel} -->\n`);

    // Write all paths in this bin
    bin.forEach(({ duplicates, outlines, path }) => {
      // Write fill paths
      duplicates.forEach((duplicatePath) => {
        stream.write(`      <path d="${duplicatePath}" fill="${path.fill}" stroke="${path.stroke}" stroke-width="${path.strokeWidth}" />\n`);
      });
      // Collect outline paths for separate group
      if (outlines && outlines.length > 0) {
        outlines.forEach((outlinePath) => {
          collectedOutlines.push({
            d: outlinePath,
            fill: 'none',
            stroke: path.stroke,
            strokeWidth: path.strokeWidth
          });
        });
      }
    });

    stream.write(`    </g>\n`);
  });

  console.log(`\nBin distribution:`);
  bins.forEach((bin, i) => {
    const minPct = Math.round((i / bins.length) * 100);
    const maxPct = Math.round(((i + 1) / bins.length) * 100);
    console.log(`  Band ${minPct}-${maxPct}%: ${bin.length} source paths`);
  });

  return collectedOutlines;
}

/**
 * Write outline paths in a separate group
 * @param {Object} stream - Write stream
 * @param {Array} outlinePaths - Array of outline path objects {d, fill, stroke, strokeWidth}
 */
function writeOutlineGroup(stream, outlinePaths) {
  if (!outlinePaths || outlinePaths.length === 0) return;

  stream.write(`    <g id="outlines">\n`);
  stream.write(`      <!-- Outline strokes (${outlinePaths.length} paths) -->\n`);

  outlinePaths.forEach(({ d, fill, stroke, strokeWidth }) => {
    stream.write(`      <path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />\n`);
  });

  stream.write(`    </g>\n`);
  console.log(`\nWrote ${outlinePaths.length} outline paths in separate group`);
}

module.exports = {
  parseSVG,
  processPaths,
  writeSVGHeader,
  writeSVGFooter,
  processFile,
};
