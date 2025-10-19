/**
 * UI Controls and event handlers
 */

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

  // Export controls
  document.getElementById('export-svg').addEventListener('click', exportSVG);
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
 * Export processed SVG with weight-based duplicates
 */
async function exportSVG() {
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

  svgData.paths.forEach(path => {
    let passes;

    if (useAttractors) {
      passes = attractorSystem.calculatePathWeight(path.points);
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

    console.log(`Path ${path.id}: length=${path.length}, passes=${passes}`);

    // Generate deterministic seed from path data
    const seed = hashString(path.d);

    // Generate offset duplicates with centered distribution
    for (let i = 0; i < passes; i++) {
      const passIndex = Math.floor(i / 2); // Distance from center
      const isRight = i % 2 === 0; // Alternate sides
      const direction = isRight ? 1 : -1;

      const offsetDistance = direction * passIndex * baseOffset;
      const passSeed = seed + i;

      // Generate offset using proper perpendicular algorithm
      const offsetPoints = generateOffsetPath(path.points, offsetDistance, noise, passSeed);

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
  });

  // Build SVG
  const svgContent = buildSVGContent(processedPaths);

  // Download
  const filename = useAttractors ? 'processed-attractor.svg' : 'processed-length.svg';
  downloadFile(svgContent, filename);

  const message = `Exported ${processedPaths.length} paths (${useAttractors ? 'attractor' : 'length'} mode)`;
  console.log(message);
  updateStatus(message);
}

/**
 * Build SVG content from processed paths
 */
function buildSVGContent(paths) {
  const parts = [];

  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  parts.push(`<svg width="${svgData.width}mm" height="${svgData.height}mm" viewBox="${svgData.viewBox.x} ${svgData.viewBox.y} ${svgData.viewBox.width} ${svgData.viewBox.height}" xmlns="http://www.w3.org/2000/svg">`);
  parts.push(`  <!-- Generated by plotter-line-thickener (${useAttractors ? 'Attractor-based' : 'Length-based'}) -->`);
  parts.push('  <g id="processed-paths">');

  paths.forEach(path => {
    parts.push(`    <path d="${path.d}" fill="${path.fill}" stroke="${path.stroke}" stroke-width="${path.strokeWidth}" />`);
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
  downloadFile(json, 'attractor-preset.json');
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
 * Download file helper
 */
function downloadFile(content, filename) {
  console.log(`Downloading file: ${filename} (${content.length} bytes)`);

  // Determine MIME type from filename extension
  let mimeType = 'text/plain';
  if (filename.endsWith('.svg')) {
    mimeType = 'image/svg+xml';
  } else if (filename.endsWith('.json')) {
    mimeType = 'application/json';
  }

  console.log(`MIME type: ${mimeType}`);

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Force download attribute to prevent navigation
  link.setAttribute('download', filename);

  document.body.appendChild(link);

  console.log(`Triggering download for ${filename}...`);
  link.click();

  // Clean up after a delay
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log(`Download cleanup complete`);
  }, 200);
}
