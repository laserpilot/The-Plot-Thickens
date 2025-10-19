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
    });
  });

  // Attractor controls
  document.getElementById('clear-attractors').addEventListener('click', () => {
    attractorSystem.clearAll();
    updateAttractorList();
  });

  // Attractor settings
  setupSlider('strength', (value) => {
    attractorSystem.updateConfig({ strength: value });
  });

  setupSlider('falloff-radius', (value) => {
    attractorSystem.updateConfig({ falloffRadius: value });
  });

  document.getElementById('falloff-curve').addEventListener('change', (e) => {
    attractorSystem.updateConfig({ falloffCurve: e.target.value });
  });

  document.getElementById('attractor-mode').addEventListener('change', (e) => {
    attractorSystem.updateConfig({ mode: e.target.value });
  });

  document.getElementById('multi-mode').addEventListener('change', (e) => {
    attractorSystem.updateConfig({ multiMode: e.target.value });
  });

  // Line weight settings
  setupSlider('base-offset', (value) => {
    baseOffset = value;
  });

  setupSlider('noise', (value) => {
    noise = value;
  });

  setupSlider('min-passes', (value) => {
    attractorSystem.updateConfig({ minPasses: value });
  });

  setupSlider('max-passes', (value) => {
    attractorSystem.updateConfig({ maxPasses: value });
  });

  // Display toggles
  document.getElementById('show-attractors').addEventListener('change', (e) => {
    showAttractors = e.target.checked;
  });

  document.getElementById('show-influence').addEventListener('change', (e) => {
    showInfluence = e.target.checked;
  });

  document.getElementById('preview-mode').addEventListener('change', (e) => {
    previewMode = e.target.checked;
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
function exportSVG() {
  if (!svgData) {
    alert('No SVG loaded');
    return;
  }

  console.log('Generating processed SVG...');

  // Generate processed paths
  const processedPaths = [];

  svgData.paths.forEach(path => {
    let passes;

    if (useAttractors) {
      passes = attractorSystem.calculatePathWeight(path.points);
    } else {
      passes = calculateLengthBasedWeight(path.length);
    }

    console.log(`Path ${path.id}: ${passes} passes`);

    // Generate offset duplicates
    for (let i = 0; i < passes; i++) {
      const offsetPathData = generateOffsetPath(path.d, i, baseOffset, noise);
      processedPaths.push({
        d: offsetPathData,
        stroke: path.stroke,
        fill: path.fill,
        strokeWidth: path.strokeWidth,
      });
    }
  });

  // Build SVG
  const svgContent = buildSVGContent(processedPaths);

  // Download
  const filename = useAttractors ? 'processed-attractor.svg' : 'processed-length.svg';
  downloadFile(svgContent, filename, 'image/svg+xml');
  console.log(`Exported ${processedPaths.length} paths (${useAttractors ? 'attractor' : 'length'} mode)`);
}

/**
 * Generate offset version of a path
 * Simplified version - adds small random variations
 */
function generateOffsetPath(pathData, passIndex, baseOffset, noise) {
  // This is a simplified approach
  // For production, use proper perpendicular offset algorithm
  const offsetAmount = passIndex * baseOffset * 0.1;
  const noiseAmount = noise * (Math.random() - 0.5) * 2;

  // Simple coordinate offset (not true perpendicular offset)
  const offsetPattern = /([0-9.-]+)/g;
  let coordIndex = 0;

  return pathData.replace(offsetPattern, (match) => {
    const num = parseFloat(match);
    const isX = coordIndex % 2 === 0;
    coordIndex++;

    const variation = (Math.random() - 0.5) * noise;
    const offset = offsetAmount + noiseAmount + variation;

    return (num + (isX ? offset * 0.5 : offset * 0.5)).toFixed(3);
  });
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
  downloadFile(json, 'attractor-preset.json', 'application/json');
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
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
