/**
 * UI initialization and event handlers
 */

import { loadSVGFile } from '../utils/svg-loader.js';
import { processPaths } from '../utils/processor.js';
import { buildSVG, downloadSVG, generateFilename } from '../utils/svg-exporter.js';
import { generateSampleShapes, getSampleDescription } from '../utils/sample-shapes.js';
import { initProgressPanel } from './progress-panel.js';
import { initGlobalProgress, showProgress, updateProgress, hideProgress, showComplete } from '../utils/global-progress.js';

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

/**
 * Build CLI command from current config
 */
function buildCLICommand(config) {
  const parts = ['node process-svg.js input.svg output.svg'];

  parts.push(`--offset ${config.baseOffset}`);
  parts.push(`--min-passes ${config.minPasses}`);
  parts.push(`--max-passes ${config.maxPasses}`);

  if (config.fillMode !== 'offset') {
    parts.push(`--fill-mode ${config.fillMode}`);
  }

  if (config.envelope && config.envelope !== 'flat') {
    parts.push(`--envelope ${config.envelope}`);
  }

  if (config.curve && config.curve !== 'linear') {
    parts.push(`--curve ${config.curve}`);
  }

  if (config.noise > 0) {
    parts.push(`--noise ${config.noise}`);
    parts.push(`--noise-frequency ${config.noiseFrequency}`);
  }

  // Noise gradient parameters
  if (config.noiseGradientMode && config.noiseGradientMode !== 'flat') {
    parts.push(`--noise-gradient ${config.noiseGradientMode}`);
    parts.push(`--noise-min ${config.noiseMin}`);
    parts.push(`--noise-max ${config.noiseMax}`);
    parts.push(`--freq-min ${config.freqMin}`);
    parts.push(`--freq-max ${config.freqMax}`);
    if (config.gradientCurve && config.gradientCurve !== 'linear') {
      parts.push(`--gradient-curve ${config.gradientCurve}`);
    }
  }

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

  parts.push(`--sample-rate ${config.sampleRate}`);

  // Length thresholding
  if (config.minLength && config.minLength > 0) {
    parts.push(`--min-length ${config.minLength}`);
  }
  if (config.maxLength && config.maxLength > 0) {
    parts.push(`--max-length ${config.maxLength}`);
  }

  // Outline extraction
  if (config.addOutline) {
    parts.push(`--add-outline`);
  }

  // Output size
  if (config.outputSize && config.outputSize !== 'original') {
    parts.push(`--output-size ${config.outputSize}`);
  }

  return parts.join(' \\\n  ');
}

/**
 * Update the CLI command display
 */
function updateCLICommandDisplay(config) {
  const cliCommandInput = document.getElementById('cli-command');
  if (cliCommandInput) {
    cliCommandInput.value = buildCLICommand(config);
  }
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

      showProgress(`Processing ${originalPaths.length} paths...`, 0);
      console.log('Processing paths with config:', config);

      // Get attractor state
      const useAttractors = store.getState('useAttractors');
      const attractors = store.getState('attractors');
      const attractorConfig = store.getState('attractorConfig');

      // Get viewBox for focus blur mode
      const viewBox = store.getState('svgBounds');

      // Process with or without attractors
      const result = await processPaths(
        originalPaths,
        config,
        useAttractors ? attractors : [],
        useAttractors ? attractorConfig : null,
        viewBox
      );

      store.setState({
        processedPaths: result.paths,
        detectedMinLength: result.detectedMinLength,
        detectedMaxLength: result.detectedMaxLength,
        processing: false
      });

      updateProgress('Rendering processed paths...', 75);

      // Render processed paths (unless fast preview is enabled)
      const bounds = store.getState('svgBounds');
      const fastPreview = store.getState('fastPreview');

      if (fastPreview) {
        // In fast preview mode, show original paths with color coding
        renderer.renderFastPreview(originalPaths, bounds);
      } else {
        // Normal mode: show fully processed paths
        renderer.render(result.paths, bounds);
      }

      console.log(`Rendered ${result.paths.length} processed paths`);

      showComplete(`Generated ${result.paths.length} paths from ${originalPaths.length} originals`);

      // Remove visual feedback
      processBtn.classList.remove('processing');
      processBtn.disabled = false;

    } catch (err) {
      console.error('Processing error:', err);
      store.setState({ processing: false });
      hideProgress();

      // Remove visual feedback on error
      const processBtn = document.getElementById('btn-process');
      processBtn.classList.remove('processing');
      processBtn.disabled = false;
    }
  };

  // Throttled version for live preview (500ms delay)
  const throttledProcess = throttle(processPathsInternal, 500);

  // Accordion toggle functionality
  const accordionHeaders = document.querySelectorAll('.accordion-header');
  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const section = header.closest('.accordion-section');
      const isExpanded = section.classList.contains('expanded');
      const indicator = header.querySelector('.accordion-indicator');

      // Toggle expanded state
      section.classList.toggle('expanded');

      // Update indicator
      if (indicator) {
        indicator.textContent = section.classList.contains('expanded') ? '▼' : '▶';
      }

      // Update store
      const expandedSections = store.getState('expandedSections') || new Set();
      const sectionId = section.id;

      if (section.classList.contains('expanded')) {
        expandedSections.add(sectionId);
      } else {
        expandedSections.delete(sectionId);
      }

      store.setState({ expandedSections });
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
      showProgress('Loading SVG file...', 0);
      console.log('Loading SVG file:', file.name);

      const svgData = await loadSVGFile(file);

      console.log('SVG loaded:', {
        paths: svgData.paths.length,
        bounds: svgData.bounds,
        firstPath: svgData.paths[0]
      });

      updateProgress(`Loaded ${svgData.paths.length} paths`, 50);

      fileInfo.innerHTML = `
        <strong>Loaded:</strong> ${file.name}<br>
        <strong>Paths:</strong> ${svgData.paths.length}<br>
        <strong>Bounds:</strong> ${svgData.bounds.width.toFixed(1)} × ${svgData.bounds.height.toFixed(1)} mm
      `;

      store.setState({
        svg: svgData.raw,
        svgBounds: svgData.bounds,
        originalPaths: svgData.paths,
        originalFilename: file.name,
        originalSvgMetadata: svgData.metadata
      });

      updateProgress('Rendering preview...', 75);

      // Render static preview (preview is always visible in split-panel layout)
      console.log('Calling renderer.render()...');
      renderer.render(svgData.paths, svgData.bounds);

      showComplete(`Loaded ${svgData.paths.length} paths from ${file.name}`);

    } catch (err) {
      fileInfo.innerHTML = `<span style="color: #ff4444">Error: ${err.message}</span>`;
      console.error('SVG load error:', err);
      hideProgress();
    }
  });

  // Sample preview handlers
  const btnLoadSample = document.getElementById('btn-load-sample');
  const btnBackToSvg = document.getElementById('btn-back-to-svg');
  const sampleInfo = document.getElementById('sample-info');
  const sampleInfoText = document.getElementById('sample-info-text');

  btnLoadSample.addEventListener('click', () => {
    const shapeType = document.getElementById('sample-shape').value;
    const size = parseFloat(document.getElementById('sample-size').value) || 50;
    const complexity = document.getElementById('sample-complexity').value;

    console.log(`Loading sample: ${shapeType}, size: ${size}, complexity: ${complexity}`);

    try {
      // Generate sample shapes
      const { paths, bounds } = generateSampleShapes(shapeType, size, complexity);

      // Backup user's SVG if this is first time entering sample mode
      const isSampleMode = store.getState('isSampleMode');
      if (!isSampleMode) {
        const userSvgBackup = {
          svg: store.getState('svg'),
          svgBounds: store.getState('svgBounds'),
          originalPaths: store.getState('originalPaths'),
          processedPaths: store.getState('processedPaths'),
          originalFilename: store.getState('originalFilename')
        };
        store.setState({ userSvgBackup });
      }

      // Set sample mode state
      store.setState({
        isSampleMode: true,
        samplePaths: paths,
        sampleBounds: bounds,
        originalPaths: paths,
        svgBounds: bounds,
        processedPaths: [] // Clear processed paths
      });

      // Update UI
      const description = getSampleDescription(shapeType, complexity);
      sampleInfoText.textContent = description;
      sampleInfo.style.display = 'block';
      btnBackToSvg.style.display = 'inline-block';

      // Render sample
      const fastPreview = store.getState('fastPreview');
      if (fastPreview) {
        renderer.renderFastPreview(paths, bounds);
      } else {
        renderer.render(paths, bounds);
      }

      console.log(`Sample loaded: ${paths.length} paths`);
    } catch (err) {
      console.error('Error loading sample:', err);
      alert(`Error loading sample: ${err.message}`);
    }
  });

  btnBackToSvg.addEventListener('click', () => {
    const backup = store.getState('userSvgBackup');

    if (!backup) {
      console.warn('No user SVG backup found');
      return;
    }

    // Restore user's SVG
    store.setState({
      isSampleMode: false,
      svg: backup.svg,
      svgBounds: backup.svgBounds,
      originalPaths: backup.originalPaths,
      processedPaths: backup.processedPaths,
      originalFilename: backup.originalFilename,
      samplePaths: [],
      sampleBounds: null
    });

    // Update UI
    sampleInfo.style.display = 'none';
    btnBackToSvg.style.display = 'none';

    // Render original SVG
    const fastPreview = store.getState('fastPreview');
    if (fastPreview) {
      renderer.renderFastPreview(backup.originalPaths, backup.svgBounds);
    } else {
      const pathsToShow = backup.processedPaths.length > 0 ? backup.processedPaths : backup.originalPaths;
      renderer.render(pathsToShow, backup.svgBounds);
    }

    console.log('Restored user SVG');
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
    sampleRate: document.getElementById('sample-rate'),
    minLength: document.getElementById('min-length'),
    maxLength: document.getElementById('max-length'),
    envelope: document.getElementById('envelope'),
    curve: document.getElementById('curve')
  };

  Object.entries(fillInputs).forEach(([key, input]) => {
    if (!input) return; // Skip if element doesn't exist

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

      // Update CLI command display
      updateCLICommandDisplay(store.getState('config'));

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
    if (!input) return; // Skip if element doesn't exist

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

      // Update CLI command display
      updateCLICommandDisplay(store.getState('config'));

      // Auto-process if live preview is enabled
      const livePreview = store.getState('livePreview');
      if (livePreview) {
        throttledProcess();
      }
    });
  });

  // Noise gradient controls
  const enableNoiseGradientCheckbox = document.getElementById('enable-noise-gradient');
  const noiseGradientControls = document.getElementById('noise-gradient-controls');
  const noiseGradientInputs = {
    noiseGradientMode: document.getElementById('noise-gradient-mode'),
    noiseMin: document.getElementById('noise-min'),
    noiseMax: document.getElementById('noise-max'),
    freqMin: document.getElementById('freq-min'),
    freqMax: document.getElementById('freq-max'),
    gradientCurve: document.getElementById('gradient-curve')
  };

  // Toggle noise gradient controls visibility
  enableNoiseGradientCheckbox.addEventListener('change', () => {
    const enabled = enableNoiseGradientCheckbox.checked;
    noiseGradientControls.style.display = enabled ? 'block' : 'none';

    // Update config
    const config = store.getState('config');
    store.setState({
      config: {
        ...config,
        noiseGradientMode: enabled ? 'fuzzy-crisp' : 'flat'
      }
    });

    // Update CLI command display
    updateCLICommandDisplay(store.getState('config'));

    // Auto-process if live preview is enabled
    const livePreview = store.getState('livePreview');
    if (livePreview) {
      throttledProcess();
    }
  });

  // Wire up noise gradient control handlers
  Object.entries(noiseGradientInputs).forEach(([key, input]) => {
    if (!input) return;

    input.addEventListener('change', () => {
      const config = store.getState('config');
      const value = input.type === 'number' ? parseFloat(input.value) : input.value;

      store.setState({
        config: { ...config, [key]: value }
      });

      // Update CLI command display
      updateCLICommandDisplay(store.getState('config'));

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

    // Update CLI command display
    updateCLICommandDisplay(store.getState('config'));

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

    // Update CLI command display
    updateCLICommandDisplay(store.getState('config'));

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  });

  // Focus blur controls
  const focusBlurLightModeSelect = document.getElementById('focus-blur-light-mode');
  const focusBlurDirectionalControls = document.getElementById('focus-blur-directional-controls');
  const focusBlurPointControls = document.getElementById('focus-blur-point-controls');
  const focusBlurPassesControls = document.getElementById('focus-blur-passes-controls');

  // Helper to update focus blur config
  const updateFocusBlurConfig = (updates) => {
    const config = store.getState('config');
    store.setState({
      config: {
        ...config,
        focusBlur: { ...config.focusBlur, ...updates }
      }
    });

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  };

  // Light mode selector
  focusBlurLightModeSelect.addEventListener('change', () => {
    const mode = focusBlurLightModeSelect.value;
    updateFocusBlurConfig({ lightMode: mode });

    // Toggle visibility of mode-specific controls
    if (mode === 'directional') {
      focusBlurDirectionalControls.style.display = 'block';
      focusBlurPointControls.style.display = 'none';
    } else {
      focusBlurDirectionalControls.style.display = 'none';
      focusBlurPointControls.style.display = 'block';
    }
  });

  // Light angle (directional)
  document.getElementById('focus-blur-light-angle').addEventListener('change', (e) => {
    updateFocusBlurConfig({ lightAngle: parseFloat(e.target.value) });
  });

  // Light position (point)
  document.getElementById('focus-blur-light-pos-x').addEventListener('change', (e) => {
    updateFocusBlurConfig({ lightPosX: parseFloat(e.target.value) });
  });

  document.getElementById('focus-blur-light-pos-y').addEventListener('change', (e) => {
    updateFocusBlurConfig({ lightPosY: parseFloat(e.target.value) });
  });

  document.getElementById('focus-blur-falloff-radius').addEventListener('change', (e) => {
    updateFocusBlurConfig({ falloffRadius: parseFloat(e.target.value) });
  });

  // Noise amplitude
  document.getElementById('focus-noise-min').addEventListener('change', (e) => {
    updateFocusBlurConfig({ noiseMin: parseFloat(e.target.value) });
  });

  document.getElementById('focus-noise-max').addEventListener('change', (e) => {
    updateFocusBlurConfig({ noiseMax: parseFloat(e.target.value) });
  });

  // Noise frequency
  document.getElementById('focus-freq-min').addEventListener('change', (e) => {
    updateFocusBlurConfig({ freqMin: parseFloat(e.target.value) });
  });

  document.getElementById('focus-freq-max').addEventListener('change', (e) => {
    updateFocusBlurConfig({ freqMax: parseFloat(e.target.value) });
  });

  // Pass modulation checkbox
  document.getElementById('focus-blur-modulate-passes').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    updateFocusBlurConfig({ modulatePasses: enabled });

    // Show/hide pass multiplier controls
    focusBlurPassesControls.style.display = enabled ? 'block' : 'none';
  });

  // Pass multipliers
  document.getElementById('focus-passes-min').addEventListener('change', (e) => {
    updateFocusBlurConfig({ passesMin: parseFloat(e.target.value) });
  });

  document.getElementById('focus-passes-max').addEventListener('change', (e) => {
    updateFocusBlurConfig({ passesMax: parseFloat(e.target.value) });
  });

  // Hatch gradient controls
  const hatchLightModeSelect = document.getElementById('hatch-light-mode');
  const hatchDirectionalControls = document.getElementById('hatch-directional-controls');
  const hatchPointControls = document.getElementById('hatch-point-controls');

  // Helper to update hatch gradient config
  const updateHatchGradientConfig = (updates) => {
    const config = store.getState('config');
    store.setState({
      config: {
        ...config,
        hatchGradient: { ...config.hatchGradient, ...updates }
      }
    });

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  };

  // Light mode selector
  hatchLightModeSelect.addEventListener('change', () => {
    const mode = hatchLightModeSelect.value;
    updateHatchGradientConfig({ lightMode: mode });

    // Toggle visibility of mode-specific controls
    if (mode === 'directional') {
      hatchDirectionalControls.style.display = 'block';
      hatchPointControls.style.display = 'none';
    } else {
      hatchDirectionalControls.style.display = 'none';
      hatchPointControls.style.display = 'block';
    }
  });

  // Light angle (directional)
  document.getElementById('hatch-light-angle').addEventListener('change', (e) => {
    updateHatchGradientConfig({ lightAngle: parseFloat(e.target.value) });
  });

  // Light position (point)
  document.getElementById('hatch-light-pos-x').addEventListener('change', (e) => {
    updateHatchGradientConfig({ lightPosX: parseFloat(e.target.value) });
  });

  document.getElementById('hatch-light-pos-y').addEventListener('change', (e) => {
    updateHatchGradientConfig({ lightPosY: parseFloat(e.target.value) });
  });

  document.getElementById('hatch-falloff-radius').addEventListener('change', (e) => {
    updateHatchGradientConfig({ falloffRadius: parseFloat(e.target.value) });
  });

  // Light strength
  document.getElementById('hatch-light-strength').addEventListener('change', (e) => {
    updateHatchGradientConfig({ lightStrength: parseFloat(e.target.value) });
  });

  // Base density
  document.getElementById('hatch-base-weight').addEventListener('change', (e) => {
    updateHatchGradientConfig({ baseWeight: parseFloat(e.target.value) });
  });

  // Shadow softness
  document.getElementById('hatch-shadow-softness').addEventListener('change', (e) => {
    updateHatchGradientConfig({ shadowSoftness: parseFloat(e.target.value) });
  });

  // Outline extraction control
  document.getElementById('add-outline').addEventListener('change', (e) => {
    const config = store.getState('config');
    store.setState({
      config: { ...config, addOutline: e.target.checked }
    });

    // Update CLI command display
    updateCLICommandDisplay(store.getState('config'));

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  });

  // Output size controls
  const outputSizeRadios = document.querySelectorAll('input[name="output-size"]');
  outputSizeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        const config = store.getState('config');
        store.setState({
          config: { ...config, outputSize: radio.value }
        });

        // Update CLI command display
        updateCLICommandDisplay(store.getState('config'));
      }
    });
  });

  // Length binning controls
  const enableBinningCheckbox = document.getElementById('enable-binning');
  const binningControls = document.getElementById('binning-controls');
  const binCountSlider = document.getElementById('bin-count');
  const binCountValue = document.getElementById('bin-count-value');
  const binPreview = document.getElementById('bin-preview');

  enableBinningCheckbox.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    const config = store.getState('config');
    store.setState({
      config: { ...config, enableBinning: enabled }
    });

    // Show/hide binning controls
    binningControls.style.display = enabled ? 'block' : 'none';
  });

  binCountSlider.addEventListener('input', (e) => {
    const count = parseInt(e.target.value);
    binCountValue.textContent = count;

    // Update preview text
    const percentages = [];
    for (let i = 0; i < count; i++) {
      const start = Math.round((i / count) * 100);
      const end = Math.round(((i + 1) / count) * 100);
      percentages.push(`${start}-${end}%`);
    }
    binPreview.textContent = percentages.join(', ');

    // Update config
    const config = store.getState('config');
    store.setState({
      config: { ...config, binCount: count }
    });
  });

  // Function to show/hide mode-specific controls
  function updateFillModeControls(mode) {
    const stripedControls = document.getElementById('mode-striped-controls');
    const spiralControls = document.getElementById('mode-spiral-controls');
    const crosshatchControls = document.getElementById('mode-crosshatch-controls');
    const focusBlurControls = document.getElementById('mode-focus-blur-controls');
    const hatchGradientControls = document.getElementById('mode-hatch-gradient-controls');

    // Hide all mode-specific controls
    stripedControls.style.display = 'none';
    spiralControls.style.display = 'none';
    crosshatchControls.style.display = 'none';
    focusBlurControls.style.display = 'none';
    hatchGradientControls.style.display = 'none';

    // Show relevant controls
    if (mode === 'striped') {
      stripedControls.style.display = 'block';
    } else if (mode === 'spiral') {
      spiralControls.style.display = 'block';
    } else if (mode === 'crosshatch') {
      crosshatchControls.style.display = 'block';
    } else if (mode === 'focus-blur') {
      focusBlurControls.style.display = 'block';
    } else if (mode === 'hatch-gradient') {
      hatchGradientControls.style.display = 'block';
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

  // Fast preview toggle
  const fastPreviewCheckbox = document.getElementById('fast-preview');
  const fastPreviewInfo = document.getElementById('fast-preview-info');

  fastPreviewCheckbox.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    store.setState({ fastPreview: enabled });

    // Show/hide info box
    if (fastPreviewInfo) {
      fastPreviewInfo.style.display = enabled ? 'block' : 'none';
    }

    console.log(`Fast preview ${enabled ? 'enabled' : 'disabled'}`);

    // Trigger render update
    const originalPaths = store.getState('originalPaths');
    const bounds = store.getState('svgBounds');

    if (originalPaths && originalPaths.length > 0) {
      if (enabled) {
        // Switch to fast preview mode
        renderer.renderFastPreview(originalPaths, bounds);
      } else {
        // Switch back to regular rendering
        const processedPaths = store.getState('processedPaths');
        const pathsToShow = processedPaths.length > 0 ? processedPaths : originalPaths;
        renderer.render(pathsToShow, bounds);
      }
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
    const cliCommandInput = document.getElementById('cli-command');
    if (cliCommandInput) {
      const cmd = cliCommandInput.value;
      navigator.clipboard.writeText(cmd).then(() => {
        alert('CLI command copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy CLI command:', err);
        alert('Failed to copy to clipboard. Please copy manually.');
      });
    }
  });

  // Export SVG
  document.getElementById('btn-export').addEventListener('click', async () => {
    const processedPaths = store.getState('processedPaths');
    const originalPaths = store.getState('originalPaths');
    const bounds = store.getState('svgBounds');
    const config = store.getState('config');

    if (!originalPaths || originalPaths.length === 0) {
      alert('No paths to export! Load an SVG file first.');
      return;
    }

    // Auto-process if no processed paths exist
    if (!processedPaths || processedPaths.length === 0) {
      console.log('No processed paths found - auto-processing before export...');
      await processPathsInternal();
    }

    // Get the processed paths after processing
    const pathsToExport = store.getState('processedPaths');

    if (!pathsToExport || pathsToExport.length === 0) {
      alert('Processing failed! Check console for errors.');
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

      // Build SVG with optional binning
      const originalSvgMetadata = store.getState('originalSvgMetadata') || {};
      const outputSize = config.outputSize || 'original';

      const svgContent = buildSVG(
        pathsToExport,
        bounds,
        metadata,
        config.enableBinning || false,
        config.binCount || 4,
        originalPaths,
        originalSvgMetadata,
        outputSize
      );

      // Generate filename
      const originalFilename = store.getState('originalFilename') || 'processed.svg';
      const baseName = originalFilename.replace('.svg', '');
      const filename = generateFilename(baseName, metadata);

      // Trigger download
      downloadSVG(svgContent, filename);

      console.log(`✓ Exported ${pathsToExport.length} paths${config.enableBinning ? ` (binned into ${config.binCount} groups)` : ''}`);

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
        strength: null,  // Use global default
        radius: null     // Use global default
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

  // Set up attractor drag handlers
  renderer.setAttractorDragHandlers(
    // During drag: update position in real-time
    (index, x, y) => {
      const attractors = store.getState('attractors');
      if (index >= 0 && index < attractors.length) {
        const newAttractors = [...attractors];
        newAttractors[index] = { ...newAttractors[index], x, y };
        store.setState({ attractors: newAttractors });
        // Don't update list during drag for performance
      }
    },
    // On drag end: finalize and reprocess
    (index) => {
      updateAttractorList();
      // Auto-reprocess if live preview enabled
      if (store.getState('livePreview') && store.getState('useAttractors')) {
        throttledProcess();
      }
    }
  );

  // Update attractor list UI with editable properties
  function updateAttractorList() {
    const attractors = store.getState('attractors');
    const attractorConfig = store.getState('attractorConfig');
    const listEl = document.getElementById('attractor-list');
    const countEl = document.getElementById('attractor-count');

    // Update count
    if (countEl) {
      countEl.textContent = `(${attractors.length}/10)`;
    }

    if (attractors.length === 0) {
      listEl.innerHTML = '<p style="color: #666; font-size: 0.85rem; margin-top: 0.5rem;">No attractors placed</p>';
      return;
    }

    listEl.innerHTML = attractors.map((attractor, index) => {
      const hasCustomStrength = attractor.strength !== null && attractor.strength !== undefined && attractor.strength !== attractorConfig.strength;
      const hasCustomRadius = attractor.radius !== null && attractor.radius !== undefined && attractor.radius !== attractorConfig.falloffRadius;
      const hasCustom = hasCustomStrength || hasCustomRadius;
      const customLabel = hasCustom ? ' ★' : '';

      return `
        <details class="attractor-item ${hasCustom ? 'has-custom' : ''}" data-index="${index}" style="margin-bottom: 8px;">
          <summary style="cursor: pointer; padding: 8px; background: ${hasCustom ? 'rgba(74, 158, 255, 0.08)' : 'var(--bg)'}; border: 1px solid var(--border); border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
            <span style="flex: 1;">
              <strong style="color: ${attractor.mode === 'repel' ? '#ff6464' : '#4a9eff'};">#${index + 1}${customLabel}</strong>
              <span style="font-family: monospace; font-size: 0.85em; color: #888; margin-left: 8px;">
                (${attractor.x.toFixed(1)}, ${attractor.y.toFixed(1)})
              </span>
            </span>
            <button class="attractor-remove" data-index="${index}" style="padding: 4px 8px; font-size: 0.8rem; background: #ff4444; color: white; border: none; border-radius: 3px; cursor: pointer; margin-left: 8px;" onclick="event.stopPropagation();">×</button>
          </summary>
          <div style="padding: 12px; background: var(--bg); border: 1px solid var(--border); border-top: none; border-radius: 0 0 4px 4px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9em;">
              <label style="display: flex; flex-direction: column;">
                X (mm)
                <input type="number" class="attractor-x" data-index="${index}" value="${attractor.x.toFixed(1)}" step="1" style="margin-top: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 3px; background: var(--bg-dark); color: var(--fg);">
              </label>
              <label style="display: flex; flex-direction: column;">
                Y (mm)
                <input type="number" class="attractor-y" data-index="${index}" value="${attractor.y.toFixed(1)}" step="1" style="margin-top: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 3px; background: var(--bg-dark); color: var(--fg);">
              </label>
              <label style="display: flex; flex-direction: column;">
                Strength <span style="font-size: 0.8em; color: #888;">(${attractorConfig.strength} default)</span>
                <input type="number" class="attractor-strength" data-index="${index}" value="${attractor.strength !== null && attractor.strength !== undefined ? attractor.strength : ''}" placeholder="${attractorConfig.strength}" step="0.1" min="0" max="5" style="margin-top: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 3px; background: var(--bg-dark); color: var(--fg);">
              </label>
              <label style="display: flex; flex-direction: column;">
                Radius (mm) <span style="font-size: 0.8em; color: #888;">(${attractorConfig.falloffRadius} default)</span>
                <input type="number" class="attractor-radius" data-index="${index}" value="${attractor.radius !== null && attractor.radius !== undefined ? attractor.radius : ''}" placeholder="${attractorConfig.falloffRadius}" step="5" min="5" max="300" style="margin-top: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 3px; background: var(--bg-dark); color: var(--fg);">
              </label>
            </div>
          </div>
        </details>
      `;
    }).join('');

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

    // Wire up property editors
    listEl.querySelectorAll('.attractor-x, .attractor-y, .attractor-strength, .attractor-radius').forEach(input => {
      input.addEventListener('change', () => {
        const index = parseInt(input.dataset.index);
        const attractors = store.getState('attractors');
        const attractor = attractors[index];

        if (!attractor) return;

        const property = input.classList.contains('attractor-x') ? 'x' :
                        input.classList.contains('attractor-y') ? 'y' :
                        input.classList.contains('attractor-strength') ? 'strength' :
                        'radius';

        let value = input.value.trim();

        // Empty value means use global default (set to null)
        if (value === '') {
          value = null;
        } else {
          value = parseFloat(value);
          if (isNaN(value)) return;
        }

        // Update attractor
        const newAttractors = [...attractors];
        newAttractors[index] = { ...attractor, [property]: value };

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
    curve: document.getElementById('attractor-curve'),
    multiMode: document.getElementById('multi-mode')
  };

  Object.entries(attractorInputs).forEach(([key, input]) => {
    input.addEventListener('change', () => {
      const attractorConfig = store.getState('attractorConfig');
      const value = input.type === 'number' ? parseFloat(input.value) : input.value;

      // Map UI keys to config keys
      const configKey = key === 'radius' ? 'falloffRadius' :
                        key === 'curve' ? 'falloffCurve' :
                        key;

      store.setState({
        attractorConfig: { ...attractorConfig, [configKey]: value }
      });

      // Show/hide falloff exponent control
      if (key === 'curve') {
        const exponentControl = document.getElementById('falloff-exponent-control');
        exponentControl.style.display = (value === 'power' || value === 'gaussian') ? 'block' : 'none';
      }

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

  // Falloff exponent slider
  const falloffExponentSlider = document.getElementById('falloff-exponent');
  const falloffExponentValue = document.getElementById('falloff-exponent-value');

  falloffExponentSlider.addEventListener('input', () => {
    falloffExponentValue.textContent = parseFloat(falloffExponentSlider.value).toFixed(1);
  });

  falloffExponentSlider.addEventListener('change', () => {
    const attractorConfig = store.getState('attractorConfig');
    const value = parseFloat(falloffExponentSlider.value);

    store.setState({
      attractorConfig: { ...attractorConfig, falloffExponent: value }
    });

    renderer.redraw();

    const useAttractors = store.getState('useAttractors');
    const livePreview = store.getState('livePreview');
    if (useAttractors && livePreview) {
      throttledProcess();
    }
  });

  // Advanced filtering controls
  const advancedInputs = {
    minInfluenceThreshold: document.getElementById('min-influence-threshold'),
    minCoveragePercent: document.getElementById('min-coverage-percent'),
    influenceCalcMode: document.getElementById('influence-calc-mode')
  };

  Object.entries(advancedInputs).forEach(([key, input]) => {
    input.addEventListener('change', () => {
      const attractorConfig = store.getState('attractorConfig');
      const value = input.type === 'number' ? parseFloat(input.value) : input.value;

      store.setState({
        attractorConfig: { ...attractorConfig, [key]: value }
      });

      const useAttractors = store.getState('useAttractors');
      const livePreview = store.getState('livePreview');
      if (useAttractors && livePreview) {
        throttledProcess();
      }
    });
  });

  // Manual attractor entry
  document.getElementById('add-manual-attractor').addEventListener('click', () => {
    const xInput = document.getElementById('manual-x');
    const yInput = document.getElementById('manual-y');
    const strengthInput = document.getElementById('manual-strength');
    const radiusInput = document.getElementById('manual-radius');

    const x = parseFloat(xInput.value);
    const y = parseFloat(yInput.value);
    const strength = strengthInput.value.trim() !== '' ? parseFloat(strengthInput.value) : null;
    const radius = radiusInput.value.trim() !== '' ? parseFloat(radiusInput.value) : null;

    if (isNaN(x) || isNaN(y)) {
      alert('Please enter valid X and Y coordinates');
      return;
    }

    const attractors = store.getState('attractors');
    if (attractors.length >= 10) {
      alert('Maximum of 10 attractors reached');
      return;
    }

    const attractorConfig = store.getState('attractorConfig');
    const newAttractor = {
      id: nextAttractorId++,
      x,
      y,
      mode: attractorConfig.mode,
      strength,
      radius
    };

    const newAttractors = [...attractors, newAttractor];
    store.setState({ attractors: newAttractors });
    renderer.updateAttractors(newAttractors);
    updateAttractorList();

    // Clear inputs
    xInput.value = '';
    yInput.value = '';
    strengthInput.value = '';
    radiusInput.value = '';

    // Auto-reprocess if live preview enabled
    if (store.getState('livePreview') && store.getState('useAttractors')) {
      throttledProcess();
    }
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

  // Subscribe to detected length changes
  store.subscribe('detectedMinLength', (state) => {
    const minLengthDisplay = document.getElementById('detected-min-length');
    if (minLengthDisplay && state.detectedMinLength !== undefined) {
      minLengthDisplay.textContent = state.detectedMinLength.toFixed(2);
    }
  });

  store.subscribe('detectedMaxLength', (state) => {
    const maxLengthDisplay = document.getElementById('detected-max-length');
    if (maxLengthDisplay && state.detectedMaxLength !== undefined) {
      maxLengthDisplay.textContent = state.detectedMaxLength.toFixed(2);
    }
  });

  // Subscribe to config changes to update CLI command
  store.subscribe('config', (state) => {
    updateCLICommandDisplay(state.config);
  });

  // Initialize attractor list
  updateAttractorList();

  // Initialize global progress indicator
  initGlobalProgress();

  // Initialize progress panel for backend export
  initProgressPanel();

  // Initialize CLI command display
  updateCLICommandDisplay(store.getState('config'));

  console.log('✓ UI initialized');
}
