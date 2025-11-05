/**
 * UI Controls and event handlers
 */

// Store prepared download to allow two-click pattern (avoids extension blocking)
let preparedDownload = null;

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
  initializeControls();
});

/**
 * Initialize all UI controls and event listeners
 */
function initializeControls() {
  // File upload
  const svgUpload = document.getElementById('svg-upload');
  svgUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      loadSVGFile(file);
    }
  });

  document.getElementById('clear-svg').addEventListener('click', clearSVG);
  document.getElementById('process-paths').addEventListener('click', processPaths);

  // Weight mode toggle
  document.querySelectorAll('input[name="weight-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      weightMode = e.target.value;
      useAttractors = weightMode === 'attractor';

      // Show/hide attractor controls
      const attractorControls = document.querySelectorAll('.attractor-controls');
      attractorControls.forEach(control => {
        control.style.display = useAttractors ? 'block' : 'none';
      });

      updateStatus(useAttractors ? 'Attractor mode (click to place)' : 'Length-based mode');
      needsRedraw = true;
      redraw();
    });
  });

  // Fill mode toggle
  document.querySelectorAll('input[name="fill-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      fillMode = e.target.value;

      // Show/hide shape fill controls
      const shapeFillControls = document.querySelectorAll('.shape-fill-controls');
      shapeFillControls.forEach(control => {
        control.style.display = fillMode === 'shape-fill' ? 'block' : 'none';
      });

      updateStatus(fillMode === 'shape-fill' ? 'Shape fill mode' : 'Offset mode');
      needsRedraw = true;
      redraw();
    });
  });

  // Shape fill controls
  document.getElementById('shape-type').addEventListener('change', (e) => {
    shapeType = e.target.value;
    needsRedraw = true;
    redraw();
  });

  document.getElementById('shape-fill-mode').addEventListener('change', (e) => {
    shapeFillMode = e.target.value;
    needsRedraw = true;
    redraw();
  });

  setupSlider('shape-spacing', (value) => {
    shapeSpacing = value;
    needsRedraw = true;
    redraw();
  });

  document.getElementById('envelope-type').addEventListener('change', (e) => {
    envelope = e.target.value;
    needsRedraw = true;
    redraw();
  });

  setupSlider('max-width', (value) => {
    maxWidth = value;
    needsRedraw = true;
    redraw();
  });

  setupSlider('min-width', (value) => {
    minWidth = value;
    needsRedraw = true;
    redraw();
  });

  // Attractor controls
  document.getElementById('clear-attractors').addEventListener('click', () => {
    attractorSystem.clearAll();
    updateAttractorList();
    needsRedraw = true;
    redraw();
  });

  // Attractor settings
  setupSlider('strength', (value) => {
    attractorSystem.updateConfig({ strength: value });
    needsRedraw = true;
    redraw();
  });

  setupSlider('falloff-radius', (value) => {
    attractorSystem.updateConfig({ falloffRadius: value });
    needsRedraw = true;
    redraw();
  });

  document.getElementById('falloff-curve').addEventListener('change', (e) => {
    attractorSystem.updateConfig({ falloffCurve: e.target.value });
    needsRedraw = true;
    redraw();
  });

  document.getElementById('attractor-mode').addEventListener('change', (e) => {
    attractorSystem.updateConfig({ mode: e.target.value });
    needsRedraw = true;
    redraw();
  });

  document.getElementById('multi-mode').addEventListener('change', (e) => {
    attractorSystem.updateConfig({ multiMode: e.target.value });
    needsRedraw = true;
    redraw();
  });

  // Line weight settings
  setupSlider('base-offset', (value) => {
    baseOffset = value;
    needsRedraw = true;
    redraw();
  });

  setupSlider('noise', (value) => {
    noise = value;
    needsRedraw = true;
    redraw();
  });

  setupSlider('min-passes', (value) => {
    attractorSystem.updateConfig({ minPasses: value });
    needsRedraw = true;
    redraw();
  });

  setupSlider('max-passes', (value) => {
    attractorSystem.updateConfig({ maxPasses: value });
    needsRedraw = true;
    redraw();
  });

  // Display toggles
  document.getElementById('show-attractors').addEventListener('change', (e) => {
    showAttractors = e.target.checked;
    needsRedraw = true;
    redraw();
  });

  document.getElementById('show-influence').addEventListener('change', (e) => {
    showInfluence = e.target.checked;
    needsRedraw = true;
    redraw();
  });

  document.getElementById('preview-mode').addEventListener('change', (e) => {
    previewMode = e.target.checked;
    needsRedraw = true;
    redraw();
  });

  // Export controls - two-click pattern to avoid extension blocking
  document.getElementById('export-svg').addEventListener('click', handleExportClick);
  document.getElementById('save-preset').addEventListener('click', savePreset);
  document.getElementById('load-preset').addEventListener('click', () => {
    document.getElementById('preset-upload').click();
  });

  document.getElementById('preset-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      loadPreset(file);
    }
  });
}

/**
 * Setup slider with value display
 */
function setupSlider(id, callback) {
  const slider = document.getElementById(id);
  const valueDisplay = document.getElementById(`${id}-value`);

  slider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    valueDisplay.textContent = value;
    callback(value);
  });
}

/**
 * Handle export button click - two-click pattern to avoid extension blocking
 */
async function handleExportClick() {
  const exportButton = document.getElementById('export-svg');

  // If download is ready, execute it now (second click - direct user gesture)
  if (preparedDownload) {
    try {
      triggerDownload(preparedDownload.content, preparedDownload.filename);
      exportButton.textContent = 'Export SVG';
      preparedDownload = null;
      updateStatus('Download complete');
    } catch (error) {
      console.error('Download failed:', error);
      alert(`Download failed: ${error.message}`);
      exportButton.textContent = 'Export SVG';
      preparedDownload = null;
    }
    return;
  }

  // Otherwise, prepare the export (first click - async processing)
  await prepareExport();
}

/**
 * Prepare export (async processing) - saves download for second click
 */
async function prepareExport() {
  // Check if SVG is loaded
  if (!svgRawData && !svgData) {
    alert('Please load an SVG file first');
    return;
  }

  // If paths haven't been processed yet, process them now
  if (!pathsProcessed && svgRawData) {
    console.log('Paths not yet processed - processing now for export...');

    // Call the global processPaths() function from sketch.js
    if (typeof processPaths === 'function') {
      try {
        await processPaths();
        // Wait a bit to ensure pathsProcessed flag is updated
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Failed to process paths for export:', error);
        alert('Failed to process SVG paths. Check console for details.');
        return;
      }
    } else {
      alert('Please click "Process Paths" button first, then export.');
      return;
    }
  }

  // Double-check we have processed data
  if (!svgData || !pathsProcessed) {
    alert('Please click "Process Paths" button first, then try export again.');
    return;
  }

  console.log('Generating processed SVG...');
  updateStatus('Exporting SVG...');

  // Generate processed paths
  const processedPaths = [];

  // Calculate min/max lengths for normalization
  const lengths = svgData.paths.map(p => p.length || 0).filter(l => l > 0);
  const autoMinLength = lengths.length > 0 ? Math.min(...lengths) : 0;
  const autoMaxLength = lengths.length > 0 ? Math.max(...lengths) : 100;

  // Check for manual overrides
  const minLengthInput = document.getElementById('min-length-threshold');
  const maxLengthInput = document.getElementById('max-length-threshold');
  const minLength = (minLengthInput && minLengthInput.value && parseFloat(minLengthInput.value) > 0)
    ? parseFloat(minLengthInput.value)
    : autoMinLength;
  const maxLength = (maxLengthInput && maxLengthInput.value && parseFloat(maxLengthInput.value) > 0)
    ? parseFloat(maxLengthInput.value)
    : autoMaxLength;

  console.log(`Using length range: ${minLength.toFixed(1)} - ${maxLength.toFixed(1)}mm`);

  // Re-process paths with high quality for export
  console.log('Re-processing paths with high resolution for export...');

  svgData.paths.forEach((path, index) => {
    // Check fill mode
    if (fillMode === 'shape-fill') {
      // Shape fill mode: generate sequential shapes along path
      const shapePaths = generateShapeFill(path.d, {
        shapeType: shapeType,
        shapeFillMode: shapeFillMode,
        shapeSpacing: shapeSpacing,
        baseOffset: baseOffset,
        envelope: envelope,
        maxWidth: maxWidth,
        minWidth: minWidth,
      });

      // Add all generated shape paths
      shapePaths.forEach(shapePath => {
        processedPaths.push({
          d: shapePath,
          stroke: path.stroke,
          fill: path.fill,
          strokeWidth: path.strokeWidth,
        });
      });

      // Only log first 5 and last 5 paths
      const totalPaths = svgData.paths.length;
      if (index < 5 || index >= totalPaths - 5) {
        console.log(`Path ${path.id}: generated ${shapePaths.length} shapes`);
      } else if (index === 5) {
        console.log(`... (logging only first 5 and last 5 of ${totalPaths} paths)`);
      }

    } else {
      // Traditional offset mode
      // Re-sample path with high quality for export
      const highQualityPoints = svgParser.pathToPoints(path.d, true);

      let passes;

      if (useAttractors) {
        passes = attractorSystem.calculatePathWeight(highQualityPoints);
      } else {
        // Length-based weight calculation (inline to avoid scope issues)
        const pathLength = path.length || 0;

        if (pathLength === 0 || maxLength === minLength) {
          passes = attractorSystem.config.minPasses;
        } else {
          const normalized = (pathLength - minLength) / (maxLength - minLength);
          passes = Math.round(
            attractorSystem.config.minPasses +
            normalized * (attractorSystem.config.maxPasses - attractorSystem.config.minPasses)
          );
          passes = Math.max(attractorSystem.config.minPasses, Math.min(attractorSystem.config.maxPasses, passes));
        }
      }

      // Only log first 5 and last 5 paths to avoid console spam
      const totalPaths = svgData.paths.length;
      if (index < 5 || index >= totalPaths - 5) {
        console.log(`Path ${path.id}: ${highQualityPoints.length} HQ points, length=${path.length}, passes=${passes}`);
      } else if (index === 5) {
        console.log(`... (logging only first 5 and last 5 of ${totalPaths} paths)`);
      }

      // Generate deterministic seed from path data
      const seed = hashString(path.d);

      // Generate offset duplicates with centered distribution
      for (let i = 0; i < passes; i++) {
        const passIndex = Math.floor(i / 2); // Distance from center
        const isRight = i % 2 === 0; // Alternate sides
        const direction = isRight ? 1 : -1;

        const offsetDistance = direction * passIndex * baseOffset;
        const passSeed = seed + i;

        // Generate offset using high-quality points
        const offsetPoints = generateOffsetPath(highQualityPoints, offsetDistance, noise, passSeed);

        if (offsetPoints) {
          const offsetPathData = pointsToPathString(offsetPoints);
          processedPaths.push({
            d: offsetPathData,
            stroke: path.stroke,
            fill: path.fill,
            strokeWidth: path.strokeWidth,
          });
        }
      }
    }
  });

  console.log(`Generated ${processedPaths.length} total processed paths from ${svgData.paths.length} source paths`);

  // Build SVG with error handling
  let svgContent;
  try {
    svgContent = buildSVGContent(processedPaths);

    if (!svgContent || svgContent.length === 0) {
      alert('Failed to generate SVG content - result is empty');
      updateStatus('Export failed: empty SVG content');
      return;
    }

    const sizeMB = (svgContent.length / 1024 / 1024).toFixed(2);
    console.log(`Generated SVG: ${svgContent.length} bytes (${sizeMB} MB)`);
  } catch (error) {
    console.error('Error building SVG content:', error);
    alert(`Failed to build SVG: ${error.message}`);
    updateStatus('Export failed: error building SVG');
    return;
  }

  // Store prepared download (don't execute yet - wait for second click)
  // Add timestamp to filename for versioning
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: 2025-10-20T14-30-45
  const mode = useAttractors ? 'attractor' : 'length';
  const filename = `processed-${mode}-${timestamp}.svg`;

  preparedDownload = {
    content: svgContent,
    filename: filename
  };

  // Update UI to indicate download is ready
  const exportButton = document.getElementById('export-svg');
  exportButton.textContent = 'Download Ready – Click to Save';

  const message = `Export ready: ${processedPaths.length} paths (${(svgContent.length / 1024 / 1024).toFixed(2)} MB) - Click again to download`;
  console.log(message);
  updateStatus(message);
}

/**
 * Build SVG content from processed paths
 */
function buildSVGContent(paths) {
  // Validate svgData exists and has required properties
  if (!svgData) {
    throw new Error('svgData is not defined');
  }

  if (!svgData.viewBox) {
    throw new Error('svgData.viewBox is not defined');
  }

  // Use fallback values if dimensions are missing
  const width = svgData.width || 100;
  const height = svgData.height || 100;
  const vbX = svgData.viewBox.x ?? 0;
  const vbY = svgData.viewBox.y ?? 0;
  const vbWidth = svgData.viewBox.width ?? width;
  const vbHeight = svgData.viewBox.height ?? height;

  console.log(`Building SVG: ${width}x${height}mm, viewBox: ${vbX} ${vbY} ${vbWidth} ${vbHeight}`);

  const parts = [];

  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  parts.push(`<svg width="${width}mm" height="${height}mm" viewBox="${vbX} ${vbY} ${vbWidth} ${vbHeight}" xmlns="http://www.w3.org/2000/svg">`);
  parts.push(`  <!-- Generated by plotter-line-thickener (${useAttractors ? 'Attractor-based' : 'Length-based'}) -->`);
  parts.push('  <g id="processed-paths">');

  paths.forEach((path, index) => {
    // Validate path attributes to prevent HTML injection
    if (!path.d || typeof path.d !== 'string') {
      console.warn(`Path ${index}: invalid d attribute, skipping`);
      return;
    }

    // Escape any HTML characters in path data
    const escapedD = path.d.replace(/[<>&"']/g, char => {
      const escapeMap = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
      return escapeMap[char];
    });

    const fill = path.fill || 'none';
    const stroke = path.stroke || 'black';
    const strokeWidth = path.strokeWidth || 0.1;

    parts.push(`    <path d="${escapedD}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`);
  });

  parts.push('  </g>');
  parts.push('</svg>');

  const result = parts.join('\n');

  // Debug: Log first 500 chars to verify it's pure SVG
  console.log('SVG content preview (first 500 chars):');
  console.log(result.substring(0, 500));

  // Validate it starts with XML declaration
  if (!result.startsWith('<?xml')) {
    console.error('ERROR: SVG does not start with XML declaration!');
    console.error('First 200 chars:', result.substring(0, 200));
    throw new Error('Generated invalid SVG content');
  }

  return result;
}

/**
 * Save current attractor configuration as preset
 */
function savePreset() {
  const preset = attractorSystem.exportPreset();
  preset.lineSettings = {
    baseOffset,
    noise,
  };

  const json = JSON.stringify(preset, null, 2);
  triggerDownload(json, 'attractor-preset.json');
  console.log('Preset saved');
}

/**
 * Load preset from file
 */
function loadPreset(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const preset = JSON.parse(e.target.result);
      attractorSystem.importPreset(preset);

      // Update line settings
      if (preset.lineSettings) {
        baseOffset = preset.lineSettings.baseOffset || baseOffset;
        noise = preset.lineSettings.noise || noise;

        // Update UI
        document.getElementById('base-offset').value = baseOffset;
        document.getElementById('base-offset-value').textContent = baseOffset;
        document.getElementById('noise').value = noise;
        document.getElementById('noise-value').textContent = noise;
      }

      // Update all UI controls
      updateUIFromConfig();
      updateAttractorList();

      // Trigger redraw
      needsRedraw = true;
      redraw();

      console.log('Preset loaded successfully');
    } catch (error) {
      console.error('Failed to load preset:', error);
      alert('Failed to load preset file');
    }
  };
  reader.readAsText(file);
}

/**
 * Update UI controls from attractor config
 */
function updateUIFromConfig() {
  const config = attractorSystem.config;

  document.getElementById('strength').value = config.strength;
  document.getElementById('strength-value').textContent = config.strength;

  document.getElementById('falloff-radius').value = config.falloffRadius;
  document.getElementById('falloff-radius-value').textContent = config.falloffRadius;

  document.getElementById('falloff-curve').value = config.falloffCurve;
  document.getElementById('attractor-mode').value = config.mode;
  document.getElementById('multi-mode').value = config.multiMode;

  document.getElementById('min-passes').value = config.minPasses;
  document.getElementById('min-passes-value').textContent = config.minPasses;

  document.getElementById('max-passes').value = config.maxPasses;
  document.getElementById('max-passes-value').textContent = config.maxPasses;
}

/**
 * Download file helper - renamed to avoid conflicts with native functions
 */
function triggerDownload(content, filename) {
  console.log(`🔵 TRIGGER DOWNLOAD CALLED: ${filename} (${content.length} bytes)`);
  alert(`DEBUG: triggerDownload() called for ${filename}`);

  // Validate content
  if (!content || content.length === 0) {
    throw new Error('Cannot download empty content');
  }

  // Determine MIME type from filename extension
  let mimeType = 'text/plain';
  if (filename.endsWith('.svg')) {
    mimeType = 'image/svg+xml';
  } else if (filename.endsWith('.json')) {
    mimeType = 'application/json';
  }

  console.log(`MIME type: ${mimeType}`);

  try {
    const blob = new Blob([content], { type: mimeType });
    console.log(`Created blob: ${blob.size} bytes`);

    const url = URL.createObjectURL(blob);
    console.log(`Created blob URL: ${url}`);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    // Force download attribute to prevent navigation
    link.setAttribute('download', filename);

    document.body.appendChild(link);

    console.log(`Triggering download for ${filename}...`);

    // Now that we're on a direct user gesture (two-click pattern),
    // link.click() should work reliably without being blocked
    link.click();
    console.log('Download triggered');

    // Clean up after a longer delay for large files
    const cleanupDelay = content.length > 1000000 ? 2000 : 500; // 2s for files >1MB
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log(`Download cleanup complete (after ${cleanupDelay}ms)`);
    }, cleanupDelay);
  } catch (error) {
    console.error('Error in downloadFile:', error);
    throw new Error(`Download failed: ${error.message}`);
  }
}
