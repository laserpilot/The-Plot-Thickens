/**
 * UI initialization and event handlers
 */

import { loadSVGFile } from '../utils/svg-loader.js';
import { processPaths } from '../utils/processor.js';
import { buildSVG, downloadSVG, generateFilename } from '../utils/svg-exporter.js';

/**
 * Throttle function to limit how often a function can be called
 * @param {Function} func - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, delay) {
  let timeoutId = null;
  let lastCall = 0;

  return function (...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      func.apply(this, args);
    } else {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func.apply(this, args);
      }, delay - timeSinceLastCall);
    }
  };
}

export function initUI(store, renderer) {
  // Shared path processing function
  const processPathsInternal = async () => {
    const originalPaths = store.getState('originalPaths');
    const config = store.getState('config');

    if (!originalPaths || originalPaths.length === 0) {
      return;
    }

    try {
      store.setState({ processing: true });

      // Add visual feedback
      const processBtn = document.getElementById('btn-process');
      processBtn.classList.add('processing');
      processBtn.disabled = true;

      console.log('Processing paths with config:', config);

      // Get attractor state
      const useAttractors = store.getState('useAttractors');
      const attractors = store.getState('attractors');
      const attractorConfig = store.getState('attractorConfig');

      // Process with or without attractors
      const processed = await processPaths(
        originalPaths,
        config,
        useAttractors ? attractors : [],
        useAttractors ? attractorConfig : null
      );

      store.setState({
        processedPaths: processed,
        processing: false
      });

      // Render processed paths
      const bounds = store.getState('svgBounds');
      renderer.render(processed, bounds);

      console.log(`Rendered ${processed.length} processed paths`);

      // Remove visual feedback
      processBtn.classList.remove('processing');
      processBtn.disabled = false;

    } catch (err) {
      console.error('Processing error:', err);
      store.setState({ processing: false });

      // Remove visual feedback on error
      const processBtn = document.getElementById('btn-process');
      processBtn.classList.remove('processing');
      processBtn.disabled = false;
    }
  };

  // Throttled version for live preview (500ms delay)
  const throttledProcess = throttle(processPathsInternal, 500);

  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      // Update active states
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${targetTab}`).classList.add('active');

      store.setState({ activeTab: targetTab });
    });
  });

  // File input
  const fileInput = document.getElementById('file-input');
  const fileInfo = document.getElementById('file-info');

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      fileInfo.textContent = 'Loading...';
      console.log('Loading SVG file:', file.name);
      const svgData = await loadSVGFile(file);

      console.log('SVG loaded:', {
        paths: svgData.paths.length,
        bounds: svgData.bounds,
        firstPath: svgData.paths[0]
      });

      fileInfo.innerHTML = `
        <strong>Loaded:</strong> ${file.name}<br>
        <strong>Paths:</strong> ${svgData.paths.length}<br>
        <strong>Bounds:</strong> ${svgData.bounds.width.toFixed(1)} × ${svgData.bounds.height.toFixed(1)} mm
      `;

      store.setState({
        svg: svgData.raw,
        svgBounds: svgData.bounds,
        originalPaths: svgData.paths,
        originalFilename: file.name
      });

      // Render static preview (preview is always visible in split-panel layout)
      console.log('Calling renderer.render()...');
      renderer.render(svgData.paths, svgData.bounds);

    } catch (err) {
      fileInfo.innerHTML = `<span style="color: #ff4444">Error: ${err.message}</span>`;
      console.error('SVG load error:', err);
    }
  });

  // Preview controls
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    const zoom = store.getState('zoom');
    store.setState({ zoom: Math.min(zoom * 1.5, 10) });
    renderer.updateView(store.getState());
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    const zoom = store.getState('zoom');
    store.setState({ zoom: Math.max(zoom / 1.5, 0.1) });
    renderer.updateView(store.getState());
  });

  document.getElementById('btn-reset-view').addEventListener('click', () => {
    store.setState({ zoom: 1, panX: 0, panY: 0 });
    renderer.updateView(store.getState());
  });

  // Fill controls
  const fillInputs = {
    fillMode: document.getElementById('fill-mode'),
    baseOffset: document.getElementById('base-offset'),
    minPasses: document.getElementById('min-passes'),
    maxPasses: document.getElementById('max-passes'),
    noise: document.getElementById('noise'),
    noiseFrequency: document.getElementById('noise-frequency'),
    sampleRate: document.getElementById('sample-rate')
  };

  Object.entries(fillInputs).forEach(([key, input]) => {
    input.addEventListener('change', () => {
      const config = store.getState('config');
      const value = input.type === 'number' ? parseFloat(input.value) : input.value;

      store.setState({
        config: { ...config, [key]: value }
      });

      // If fill mode changed, show/hide mode-specific controls
      if (key === 'fillMode') {
        updateFillModeControls(value);
      }

      // Auto-process if live preview is enabled
      const livePreview = store.getState('livePreview');
      if (livePreview) {
        throttledProcess();
      }
    });
  });

  // Fill mode-specific controls
  const modeSpecificInputs = {
    stripeFilled: document.getElementById('stripe-filled'),
    stripeEmpty: document.getElementById('stripe-empty'),
    twistRate: document.getElementById('twist-rate'),
    twistOffset: document.getElementById('twist-offset'),
    spiralStripeFilled: document.getElementById('spiral-stripe-filled'),
    spiralStripeEmpty: document.getElementById('spiral-stripe-empty')
  };

  Object.entries(modeSpecificInputs).forEach(([key, input]) => {
    input.addEventListener('change', () => {
      const config = store.getState('config');
      const value = parseFloat(input.value);

      // Map spiral stripe controls to config keys
      const configKey = key === 'spiralStripeFilled' ? 'stripeFilled' :
                        key === 'spiralStripeEmpty' ? 'stripeEmpty' : key;

      // Update fillModeOptions for spiral mode
      if (key === 'twistRate' || key === 'twistOffset') {
        const fillModeOptions = config.fillModeOptions || {};
        store.setState({
          config: {
            ...config,
            [configKey]: value,
            fillModeOptions: { ...fillModeOptions, [configKey]: value }
          }
        });
      } else {
        store.setState({
          config: { ...config, [configKey]: value }
        });
      }

      // Auto-process if live preview is enabled
      const livePreview = store.getState('livePreview');
      if (livePreview) {
        throttledProcess();
      }
    });
  });

  // Crosshatch mode controls
  const crosshatchAnglesInput = document.getElementById('crosshatch-angles');
  const crosshatchSpacingInput = document.getElementById('crosshatch-spacing');

  crosshatchAnglesInput.addEventListener('change', () => {
    const config = store.getState('config');
    const anglesStr = crosshatchAnglesInput.value.trim();

    // Parse comma-separated angles
    const angles = anglesStr.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));

    if (angles.length === 0) {
      alert('Please enter at least one angle (e.g., "45,135")');
      crosshatchAnglesInput.value = config.crosshatchAngles.join(',');
      return;
    }

    store.setState({
      config: { ...config, crosshatchAngles: angles }
    });

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  });

  crosshatchSpacingInput.addEventListener('change', () => {
    const config = store.getState('config');
    const value = parseFloat(crosshatchSpacingInput.value);

    store.setState({
      config: { ...config, crosshatchSpacing: value }
    });

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  });

  // Function to show/hide mode-specific controls
  function updateFillModeControls(mode) {
    const stripedControls = document.getElementById('mode-striped-controls');
    const spiralControls = document.getElementById('mode-spiral-controls');
    const crosshatchControls = document.getElementById('mode-crosshatch-controls');

    // Hide all mode-specific controls
    stripedControls.style.display = 'none';
    spiralControls.style.display = 'none';
    crosshatchControls.style.display = 'none';

    // Show relevant controls
    if (mode === 'striped') {
      stripedControls.style.display = 'block';
    } else if (mode === 'spiral') {
      spiralControls.style.display = 'block';
    } else if (mode === 'crosshatch') {
      crosshatchControls.style.display = 'block';
    }
  }

  // Initialize with current mode
  const currentMode = store.getState('config').fillMode;
  updateFillModeControls(currentMode);

  // Live preview toggle
  const livePreviewCheckbox = document.getElementById('live-preview');
  livePreviewCheckbox.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    store.setState({ livePreview: enabled });

    console.log(`Live preview ${enabled ? 'enabled' : 'disabled'}`);

    // If enabling and we have paths, process immediately
    if (enabled && store.getState('originalPaths').length > 0) {
      processPathsInternal();
    }
  });

  // Process paths (manual button)
  document.getElementById('btn-process').addEventListener('click', async () => {
    const originalPaths = store.getState('originalPaths');

    if (!originalPaths || originalPaths.length === 0) {
      alert('Load an SVG file first!');
      return;
    }

    await processPathsInternal();
  });

  // Reset to original
  document.getElementById('btn-reset-preview').addEventListener('click', () => {
    const originalPaths = store.getState('originalPaths');
    const bounds = store.getState('svgBounds');

    if (originalPaths && originalPaths.length > 0) {
      store.setState({ processedPaths: [] });
      renderer.render(originalPaths, bounds);
      console.log('Reset to original paths');
    }
  });

  // CLI command generation
  document.getElementById('btn-copy-cli').addEventListener('click', () => {
    const config = store.getState('config');
    const cmd = generateCLICommand(config);
    navigator.clipboard.writeText(cmd);
    alert('CLI command copied to clipboard!');
  });

  // Export SVG
  document.getElementById('btn-export').addEventListener('click', () => {
    const processedPaths = store.getState('processedPaths');
    const originalPaths = store.getState('originalPaths');
    const bounds = store.getState('svgBounds');
    const config = store.getState('config');

    // Use processed paths if available, otherwise original paths
    const pathsToExport = processedPaths && processedPaths.length > 0
      ? processedPaths
      : originalPaths;

    if (!pathsToExport || pathsToExport.length === 0) {
      alert('No paths to export! Load an SVG file first.');
      return;
    }

    if (!bounds) {
      alert('No SVG bounds available. Try reloading the file.');
      return;
    }

    try {
      // Build SVG content
      const metadata = {
        fillMode: config.fillMode,
        baseOffset: config.baseOffset,
        passes: `${config.minPasses}-${config.maxPasses}`
      };

      const svgContent = buildSVG(pathsToExport, bounds, metadata);

      // Generate filename
      const originalFilename = store.getState('originalFilename') || 'processed.svg';
      const baseName = originalFilename.replace('.svg', '');
      const filename = generateFilename(baseName, metadata);

      // Trigger download
      downloadSVG(svgContent, filename);

      console.log(`✓ Exported ${pathsToExport.length} paths`);

    } catch (err) {
      console.error('Export error:', err);
      alert(`Export failed: ${err.message}`);
    }
  });

  // Attractor UI
  let nextAttractorId = 0;

  // Set up attractor click handler on canvas
  renderer.setAttractorClickHandler((x, y, isRemoveMode) => {
    const attractors = store.getState('attractors');
    const useAttractors = store.getState('useAttractors');

    if (!useAttractors) return;

    if (isRemoveMode) {
      // Find and remove closest attractor
      const attractorConfig = store.getState('attractorConfig');
      const removeRadius = 10; // Click within 10mm to remove

      const closest = attractors.reduce((best, attractor, index) => {
        const dx = x - attractor.x;
        const dy = y - attractor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < removeRadius && (!best || dist < best.dist)) {
          return { attractor, index, dist };
        }
        return best;
      }, null);

      if (closest) {
        const newAttractors = attractors.filter((_, i) => i !== closest.index);
        store.setState({ attractors: newAttractors });
        renderer.updateAttractors(newAttractors);
        updateAttractorList();

        // Auto-reprocess if live preview enabled
        if (store.getState('livePreview')) {
          throttledProcess();
        }
      }
    } else {
      // Add new attractor
      const attractorConfig = store.getState('attractorConfig');
      const newAttractor = {
        id: nextAttractorId++,
        x,
        y,
        mode: attractorConfig.mode,
        strength: attractorConfig.strength,
        radius: attractorConfig.falloffRadius
      };

      const newAttractors = [...attractors, newAttractor];
      store.setState({ attractors: newAttractors });
      renderer.updateAttractors(newAttractors);
      updateAttractorList();

      // Auto-reprocess if live preview enabled
      if (store.getState('livePreview')) {
        throttledProcess();
      }
    }
  });

  // Update attractor list UI
  function updateAttractorList() {
    const attractors = store.getState('attractors');
    const listEl = document.getElementById('attractor-list');

    if (attractors.length === 0) {
      listEl.innerHTML = '<p style="color: #666; font-size: 0.85rem;">No attractors placed</p>';
      return;
    }

    listEl.innerHTML = attractors.map((attractor, index) => `
      <div class="attractor-item">
        <span>
          <strong>#${index + 1}</strong>
          <span class="attractor-coords">
            (${attractor.x.toFixed(1)}, ${attractor.y.toFixed(1)})
          </span>
          - ${attractor.mode}
        </span>
        <button class="attractor-remove" data-index="${index}">Remove</button>
      </div>
    `).join('');

    // Wire up remove buttons
    listEl.querySelectorAll('.attractor-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const attractors = store.getState('attractors');
        const newAttractors = attractors.filter((_, i) => i !== index);
        store.setState({ attractors: newAttractors });
        renderer.updateAttractors(newAttractors);
        updateAttractorList();

        if (store.getState('livePreview')) {
          throttledProcess();
        }
      });
    });
  }

  // Use attractors checkbox
  document.getElementById('use-attractors').addEventListener('change', (e) => {
    store.setState({ useAttractors: e.target.checked });
    console.log(`Attractors ${e.target.checked ? 'enabled' : 'disabled'}`);

    // Update cursor hint
    const canvas = document.getElementById('preview-canvas');
    canvas.style.cursor = e.target.checked ? 'crosshair' : 'grab';

    // Reprocess if enabled and have paths
    if (e.target.checked && store.getState('livePreview') && store.getState('originalPaths').length > 0) {
      processPathsInternal();
    }
  });

  // Attractor config changes
  const attractorInputs = {
    mode: document.getElementById('attractor-mode'),
    strength: document.getElementById('attractor-strength'),
    radius: document.getElementById('attractor-radius'),
    curve: document.getElementById('attractor-curve')
  };

  Object.entries(attractorInputs).forEach(([key, input]) => {
    input.addEventListener('change', () => {
      const attractorConfig = store.getState('attractorConfig');
      const value = input.type === 'number' ? parseFloat(input.value) : input.value;

      // Map UI keys to config keys
      const configKey = key === 'radius' ? 'falloffRadius' : key === 'curve' ? 'falloffCurve' : key;

      store.setState({
        attractorConfig: { ...attractorConfig, [configKey]: value }
      });

      // Redraw to update visualization
      renderer.redraw();

      // Auto-reprocess if live preview enabled and attractors in use
      const useAttractors = store.getState('useAttractors');
      const livePreview = store.getState('livePreview');
      if (useAttractors && livePreview) {
        throttledProcess();
      }
    });
  });

  // Clear all attractors
  document.getElementById('btn-clear-attractors').addEventListener('click', () => {
    store.setState({ attractors: [] });
    renderer.updateAttractors([]);
    updateAttractorList();

    if (store.getState('livePreview')) {
      throttledProcess();
    }
  });

  // Subscribe to attractor state changes
  store.subscribe('attractors', (state) => {
    renderer.updateAttractors(state.attractors);
  });

  console.log('✓ UI initialized');
}

function generateCLICommand(config) {
  const parts = ['node process-svg.js input.svg output.svg'];

  parts.push(`--offset ${config.baseOffset}`);
  parts.push(`--min-passes ${config.minPasses}`);
  parts.push(`--max-passes ${config.maxPasses}`);

  if (config.noise > 0) {
    parts.push(`--noise ${config.noise}`);
    parts.push(`--noise-frequency ${config.noiseFrequency}`);
  }

  if (config.fillMode !== 'offset') {
    parts.push(`--fill-mode ${config.fillMode}`);

    // Add mode-specific parameters
    if (config.fillMode === 'striped') {
      if (config.stripeFilled !== 1) parts.push(`--stripe-filled ${config.stripeFilled}`);
      if (config.stripeEmpty !== 1) parts.push(`--stripe-empty ${config.stripeEmpty}`);
    } else if (config.fillMode === 'spiral') {
      if (config.twistRate !== 0.01) parts.push(`--twist-rate ${config.twistRate}`);
      if (config.twistOffset !== 0) parts.push(`--twist-offset ${config.twistOffset}`);
      if (config.stripeFilled !== 1) parts.push(`--stripe-filled ${config.stripeFilled}`);
      if (config.stripeEmpty !== 1) parts.push(`--stripe-empty ${config.stripeEmpty}`);
    } else if (config.fillMode === 'crosshatch') {
      if (config.crosshatchAngles && config.crosshatchAngles.length > 0) {
        parts.push(`--crosshatch-angles ${config.crosshatchAngles.join(',')}`);
      }
      if (config.crosshatchSpacing !== 1.0) {
        parts.push(`--crosshatch-spacing ${config.crosshatchSpacing}`);
      }
    }
  }

  parts.push(`--sample-rate ${config.sampleRate}`);

  return parts.join(' \\\n  ');
}
