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

  // Offset mode toggle
  document.querySelectorAll('input[name="offset-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      offsetMode = e.target.value;
      useNormalOffset = offsetMode === 'normal';

      // Show/hide envelope controls
      const envelopeControls = document.getElementById('envelope-controls');
      if (envelopeControls) {
        envelopeControls.style.display = useNormalOffset ? 'block' : 'none';
      }

      updateStatus(useNormalOffset ? 'Normal offset mode (arc-length based)' : 'Legacy offset mode');
      needsRedraw = true;
      redraw();
      updateCLICommand();
    });
  });

  // Envelope preset selector
  const envelopeSelect = document.getElementById('envelope-preset');
  if (envelopeSelect) {
    envelopeSelect.addEventListener('change', (e) => {
      envelopePreset = e.target.value;
      needsRedraw = true;
      redraw();
      updateCLICommand();
    });
  }

  // Attractor controls
  document.getElementById('clear-attractors').addEventListener('click', () => {
    attractorSystem.clearAll();
    updateAttractorList();
    needsRedraw = true;
    redraw();
  });

  // Manual attractor entry
  document.getElementById('add-manual-attractor').addEventListener('click', () => {
    const x = parseFloat(document.getElementById('manual-x').value);
    const y = parseFloat(document.getElementById('manual-y').value);
    const strengthInput = document.getElementById('manual-strength').value;
    const radiusInput = document.getElementById('manual-radius').value;

    if (isNaN(x) || isNaN(y)) {
      alert('Please enter valid X and Y coordinates');
      return;
    }

    const strength = strengthInput ? parseFloat(strengthInput) : null;
    const radius = radiusInput ? parseFloat(radiusInput) : null;

    const attractor = attractorSystem.addAttractor(x, y, strength, radius);
    if (attractor) {
      updateAttractorList();
      needsRedraw = true;
      redraw();

      // Clear form
      document.getElementById('manual-x').value = '';
      document.getElementById('manual-y').value = '';
      document.getElementById('manual-strength').value = '';
      document.getElementById('manual-radius').value = '';
    }
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
    const curve = e.target.value;
    attractorSystem.updateConfig({ falloffCurve: curve });

    // Show/hide exponent control
    const exponentControl = document.getElementById('falloff-exponent-control');
    if (exponentControl) {
      exponentControl.style.display = (curve === 'power' || curve === 'gaussian') ? 'block' : 'none';
    }

    needsRedraw = true;
    redraw();
  });

  setupSlider('falloff-exponent', (value) => {
    attractorSystem.updateConfig({ falloffExponent: value });
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

  document.getElementById('weight-blend-mode').addEventListener('change', (e) => {
    attractorSystem.updateConfig({ weightBlendMode: e.target.value });
    needsRedraw = true;
    redraw();
  });

  setupSlider('arc-sample-interval', (value) => {
    attractorSystem.updateConfig({ arcLengthSampleInterval: value });
    needsRedraw = true;
    redraw();
  });

  // Line weight settings
  setupSlider('base-offset', (value) => {
    baseOffset = value;
    needsRedraw = true;
    redraw();
    updateCLICommand();
  });

  setupSlider('noise', (value) => {
    noise = value;
    needsRedraw = true;
    redraw();
    updateCLICommand();
  });

  setupSlider('noise-frequency', (value) => {
    noiseFrequency = value;
    needsRedraw = true;
    redraw();
    updateCLICommand();
  });

  setupSlider('min-passes', (value) => {
    attractorSystem.updateConfig({ minPasses: value });
    needsRedraw = true;
    redraw();
    updateCLICommand();
  });

  setupSlider('max-passes', (value) => {
    attractorSystem.updateConfig({ maxPasses: value });
    needsRedraw = true;
    redraw();
    updateCLICommand();
  });

  // Sample rate slider
  setupSlider('sample-rate', (value) => {
    // Sample rate will be used during export
    // No need to redraw preview (it uses different sampling)
    updateCLICommand();
  });

  // Binning controls
  const enableBinning = document.getElementById('enable-binning');
  const binningControls = document.getElementById('binning-controls');
  const binCount = document.getElementById('bin-count');
  const binCountValue = document.getElementById('bin-count-value');
  const binPreview = document.getElementById('bin-preview');

  enableBinning.addEventListener('change', (e) => {
    binningControls.style.display = e.target.checked ? 'block' : 'none';
    updateCLICommand();
  });

  binCount.addEventListener('input', (e) => {
    const count = parseInt(e.target.value);
    binCountValue.textContent = count;

    // Update preview text
    const bands = [];
    for (let i = 0; i < count; i++) {
      const start = Math.round((i / count) * 100);
      const end = Math.round(((i + 1) / count) * 100);
      bands.push(`${start}-${end}%`);
    }
    binPreview.textContent = bands.join(', ');

    updateCLICommand();
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

  // Preview display mode toggle
  const previewDisplayModeSelect = document.getElementById('preview-display-mode');
  if (previewDisplayModeSelect) {
    previewDisplayModeSelect.addEventListener('change', (e) => {
      previewDisplayMode = e.target.value;
      needsRedraw = true;
      redraw();
    });
  }

  // Focus window controls
  const focusModeCheckbox = document.getElementById('focus-mode-enabled');
  const focusWindowControls = document.getElementById('focus-window-controls');
  if (focusModeCheckbox && focusWindowControls) {
    focusModeCheckbox.addEventListener('change', (e) => {
      focusModeEnabled = e.target.checked;
      focusWindowControls.style.display = focusModeEnabled ? 'block' : 'none';
      needsRedraw = true;
      redraw();
    });
  }

  const showFocusDetailCheckbox = document.getElementById('show-focus-detail');
  if (showFocusDetailCheckbox) {
    showFocusDetailCheckbox.addEventListener('change', (e) => {
      showFocusDetail = e.target.checked;
      needsRedraw = true;
      redraw();
    });
  }

  const clearFocusButton = document.getElementById('clear-focus');
  if (clearFocusButton) {
    clearFocusButton.addEventListener('click', () => {
      focusWindow = null;
      offsetCache.clear();
      document.getElementById('compute-focus').style.display = 'none';
      document.getElementById('show-detail-label').style.display = 'none';
      needsRedraw = true;
      redraw();
    });
  }

  const computeFocusButton = document.getElementById('compute-focus');
  if (computeFocusButton) {
    computeFocusButton.addEventListener('click', () => {
      computeFocusOffsets();
    });
  }

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

  // CLI command generator
  document.getElementById('copy-cli').addEventListener('click', copyCLICommand);

  // CLI single-line toggle
  const cliSingleLineCheckbox = document.getElementById('cli-single-line');
  if (cliSingleLineCheckbox) {
    cliSingleLineCheckbox.addEventListener('change', updateCLICommand);
  }

  // Update CLI command on parameter changes
  updateCLICommand();
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

  // Check binning settings
  const enableBinning = document.getElementById('enable-binning')?.checked || false;
  const binCount = parseInt(document.getElementById('bin-count')?.value) || 4;

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

  // If binning is enabled, collect paths with metadata for binning
  const pathsWithMetadata = [];

  svgData.paths.forEach((path, index) => {
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

    // Get envelope function if using normal mode
    const envelope = useNormalOffset ? getEnvelopePreset(envelopePreset) : null;

    // Collect all paths for this source path
    const sourcePaths = [];

    // Generate offset duplicates with centered distribution
    for (let i = 0; i < passes; i++) {
      const passIndex = Math.floor(i / 2); // Distance from center
      const isRight = i % 2 === 0; // Alternate sides
      const direction = isRight ? 1 : -1;

      const offsetDistance = direction * passIndex * baseOffset;
      const passSeed = seed + i;

      // Generate offset - use normal mode if enabled, otherwise legacy (points-based)
      let offsetPoints;
      if (useNormalOffset) {
        // Normal mode: pass path data string directly with noise frequency
        offsetPoints = generateOffsetPath(path.d, offsetDistance, noise, passSeed, path.id, envelope, true, noiseFrequency);
      } else {
        // Legacy mode: use high-quality points
        offsetPoints = generateOffsetPath(highQualityPoints, offsetDistance, noise, passSeed, path.id, null, false);
      }

      if (offsetPoints) {
        const offsetPathData = pointsToPathString(offsetPoints);
        const pathData = {
          d: offsetPathData,
          stroke: path.stroke,
          fill: path.fill,
          strokeWidth: path.strokeWidth,
        };

        sourcePaths.push(pathData);

        if (!enableBinning) {
          // If not binning, add directly to output
          processedPaths.push(pathData);
        }
      }
    }

    // If binning, store with metadata
    if (enableBinning && sourcePaths.length > 0) {
      pathsWithMetadata.push({
        length: path.length || 0,
        paths: sourcePaths
      });
    }
  });

  console.log(`Generated ${enableBinning ? pathsWithMetadata.reduce((sum, p) => sum + p.paths.length, 0) : processedPaths.length} total processed paths from ${svgData.paths.length} source paths`);

  // Build SVG with error handling
  let svgContent;
  try {
    if (enableBinning) {
      svgContent = buildBinnedSVGContent(pathsWithMetadata, binCount);
    } else {
      svgContent = buildSVGContent(processedPaths);
    }

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
 * Build SVG content with binning (grouped by length)
 */
function buildBinnedSVGContent(pathsWithMetadata, binCount) {
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

  console.log(`Building binned SVG: ${width}x${height}mm, ${binCount} bins`);

  // Compute quantile boundaries
  const sortedLengths = pathsWithMetadata.map(p => p.length).sort((a, b) => a - b);
  const boundaries = [];
  for (let i = 0; i <= binCount; i++) {
    const quantile = i / binCount;
    const index = Math.floor(quantile * (sortedLengths.length - 1));
    boundaries.push(sortedLengths[index]);
  }
  boundaries[boundaries.length - 1] = sortedLengths[sortedLengths.length - 1];

  console.log(`Bin boundaries: ${boundaries.map(b => b.toFixed(2)).join(', ')}`);

  // Assign paths to bins
  const bins = Array.from({ length: binCount }, () => []);
  pathsWithMetadata.forEach(item => {
    let binIndex = 0;
    for (let i = 0; i < boundaries.length - 1; i++) {
      if (item.length >= boundaries[i] && item.length <= boundaries[i + 1]) {
        binIndex = i;
        break;
      }
    }
    bins[binIndex].push(item);
  });

  // Build SVG
  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  parts.push(`<svg width="${width}mm" height="${height}mm" viewBox="${vbX} ${vbY} ${vbWidth} ${vbHeight}" xmlns="http://www.w3.org/2000/svg">`);
  parts.push(`  <!-- Generated by plotter-line-thickener (${useAttractors ? 'Attractor-based' : 'Length-based'}, ${binCount} bins) -->`);
  parts.push('  <g id="processed-paths">');

  // Write each bin as a group
  bins.forEach((bin, binIndex) => {
    const minVal = boundaries[binIndex];
    const maxVal = boundaries[binIndex + 1];
    const minPct = Math.round((binIndex / binCount) * 100);
    const maxPct = Math.round(((binIndex + 1) / binCount) * 100);

    const groupId = `length-band-${minPct}-${maxPct}pct`;
    const groupLabel = `Length: ${minVal.toFixed(2)} - ${maxVal.toFixed(2)} (${minPct}-${maxPct}%, ${bin.length} source paths)`;

    parts.push(`    <g id="${groupId}" data-length-range="${minVal.toFixed(2)}-${maxVal.toFixed(2)}">`);
    parts.push(`      <!-- ${groupLabel} -->`);

    // Write all paths in this bin
    let pathCount = 0;
    bin.forEach(item => {
      item.paths.forEach(path => {
        if (!path.d || typeof path.d !== 'string') {
          return;
        }

        const escapedD = path.d.replace(/[<>&"']/g, char => {
          const escapeMap = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
          return escapeMap[char];
        });

        const fill = path.fill || 'none';
        const stroke = path.stroke || 'black';
        const strokeWidth = path.strokeWidth || 0.1;

        parts.push(`      <path d="${escapedD}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`);
        pathCount++;
      });
    });

    parts.push(`    </g>`);
    console.log(`  Band ${minPct}-${maxPct}%: ${bin.length} source paths, ${pathCount} total paths`);
  });

  parts.push('  </g>');
  parts.push('</svg>');

  return parts.join('\n');
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

  if (config.falloffExponent !== undefined) {
    document.getElementById('falloff-exponent').value = config.falloffExponent;
    document.getElementById('falloff-exponent-value').textContent = config.falloffExponent;
  }

  // Show/hide exponent control based on curve type
  const exponentControl = document.getElementById('falloff-exponent-control');
  if (exponentControl) {
    exponentControl.style.display = (config.falloffCurve === 'power' || config.falloffCurve === 'gaussian') ? 'block' : 'none';
  }

  document.getElementById('attractor-mode').value = config.mode;
  document.getElementById('multi-mode').value = config.multiMode;

  if (config.weightBlendMode !== undefined) {
    document.getElementById('weight-blend-mode').value = config.weightBlendMode;
  }

  if (config.arcLengthSampleInterval !== undefined) {
    document.getElementById('arc-sample-interval').value = config.arcLengthSampleInterval;
    document.getElementById('arc-sample-interval-value').textContent = config.arcLengthSampleInterval;
  }

  document.getElementById('min-passes').value = config.minPasses;
  document.getElementById('min-passes-value').textContent = config.minPasses;

  document.getElementById('max-passes').value = config.maxPasses;
  document.getElementById('max-passes-value').textContent = config.maxPasses;
}

/**
 * Generate CLI command from current settings
 */
function generateCLICommand() {
  const params = [];

  // Get current parameter values
  const offset = parseFloat(document.getElementById('base-offset')?.value) || 0.2;
  // Use ?? instead of || to allow 0 as a valid value
  const noiseValue = document.getElementById('noise')?.value;
  const noise = noiseValue !== undefined && noiseValue !== null ? parseFloat(noiseValue) : 0.1;
  const noiseFreq = parseInt(document.getElementById('noise-frequency')?.value) || 50;
  const minPasses = parseInt(document.getElementById('min-passes')?.value) || 1;
  const maxPasses = parseInt(document.getElementById('max-passes')?.value) || 20;
  const sampleRate = parseFloat(document.getElementById('sample-rate')?.value) || 2;

  // Get offset mode
  const offsetModeRadios = document.getElementsByName('offset-mode');
  let offsetMode = 'legacy';
  offsetModeRadios.forEach(radio => {
    if (radio.checked) offsetMode = radio.value;
  });

  // Get envelope preset
  const envelopeSelect = document.getElementById('envelope-preset');
  const envelope = envelopeSelect?.value || 'flat';

  // Get binning settings
  const enableBinning = document.getElementById('enable-binning')?.checked || false;
  const binCount = parseInt(document.getElementById('bin-count')?.value) || 4;

  // Build command
  params.push(`--offset ${offset}`);
  params.push(`--noise ${noise}`);

  if (offsetMode === 'normal') {
    params.push(`--noise-frequency ${noiseFreq}`);
    params.push(`--offset-mode normal`);
    if (envelope !== 'flat') {
      params.push(`--envelope ${envelope}`);
    }
  }

  params.push(`--min-passes ${minPasses}`);
  params.push(`--max-passes ${maxPasses}`);

  // Add sample rate if not default
  if (sampleRate !== 2) {
    params.push(`--sample-rate ${sampleRate}`);
  }

  // Add binning if enabled
  if (enableBinning) {
    params.push(`--bins ${binCount}`);
  }

  // Check if single-line format is requested
  const singleLine = document.getElementById('cli-single-line')?.checked ?? true;

  let command;
  if (singleLine) {
    // Single-line format (ready to paste in terminal)
    command = `node process-svg.js input.svg output.svg ${params.join(' ')}`;
  } else {
    // Multi-line format with backslashes for readability
    command = `node process-svg.js input.svg output.svg \\\n  ${params.join(' \\\n  ')}`;
  }

  return command;
}

/**
 * Update CLI command display
 */
function updateCLICommand() {
  const textarea = document.getElementById('cli-command');
  if (textarea) {
    textarea.value = generateCLICommand();
  }
}

/**
 * Copy CLI command to clipboard
 */
function copyCLICommand() {
  const textarea = document.getElementById('cli-command');
  if (textarea) {
    textarea.select();
    document.execCommand('copy');

    // Visual feedback
    const button = document.getElementById('copy-cli');
    const originalText = button.textContent;
    button.textContent = '✓ Copied!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  }
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
