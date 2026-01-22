/**
 * UI initialization and event handlers
 */

import { loadSVGFile, loadSVGFromURL } from '../utils/svg-loader.js';
import { processPaths } from '../utils/processor.js';
import { buildSVG, downloadSVG, generateFilename } from '../utils/svg-exporter.js';
import { generateSampleShapes, getSampleDescription } from '../utils/sample-shapes.js';
import { initProgressPanel } from './progress-panel.js';
import { initGlobalProgress, showProgress, updateProgress, hideProgress, showComplete } from '../utils/global-progress.js';
import { DEFAULT_CONFIG } from '../state/store.js';
import { PathLengthHistogram } from './histogram.js';

// Module-level histogram instance and path lengths cache
let pathLengthHistogram = null;
let currentPathLengths = [];

// AbortController for cancelling processing
let processingAbortController = null;

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
 * Update the detected layers display in the UI
 */
function updateDetectedLayersDisplay(layers) {
  const layersInfo = document.getElementById('detected-layers-info');
  const layersList = document.getElementById('detected-layers-list');

  if (layers && layers.length > 0) {
    layersInfo.style.display = 'block';
    layersList.textContent = layers.join(', ');
    console.log(`Detected ${layers.length} layers: ${layers.join(', ')}`);
  } else {
    layersInfo.style.display = 'none';
    layersList.textContent = '';
  }
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
  } else if (config.fillMode === 'shape-fill') {
    if (config.shapeType && config.shapeType !== 'circle') parts.push(`--shape-type ${config.shapeType}`);
    if (config.shapeFillMode && config.shapeFillMode !== 'filled') parts.push(`--shape-fill-mode ${config.shapeFillMode}`);
    if (config.shapeSpacing !== undefined && config.shapeSpacing !== 1.0) parts.push(`--shape-spacing ${config.shapeSpacing}`);
    if (config.shapeMaxWidth !== undefined && config.shapeMaxWidth !== 3.0) parts.push(`--shape-max-width ${config.shapeMaxWidth}`);
    if (config.shapeMinWidth !== undefined && config.shapeMinWidth !== 0.0) parts.push(`--shape-min-width ${config.shapeMinWidth}`);
  } else if (config.fillMode === 'barber-pole') {
    if (config.barberPoleStyle && config.barberPoleStyle !== 'smooth') parts.push(`--barber-pole-style ${config.barberPoleStyle}`);
    if (config.barberPoleEdgeSoftness !== undefined && config.barberPoleEdgeSoftness !== 0.15) parts.push(`--barber-pole-edge-softness ${config.barberPoleEdgeSoftness}`);
    if (config.stripeCount !== undefined && config.stripeCount !== 3) parts.push(`--stripe-count ${config.stripeCount}`);
    if (config.twistFrequency !== undefined && config.twistFrequency !== 0.2) parts.push(`--twist-frequency ${config.twistFrequency}`);
    if (config.twistRateMode && config.twistRateMode !== 'inverse') parts.push(`--twist-rate-mode ${config.twistRateMode}`);
    if (config.occlusionMode && config.occlusionMode !== 'smooth') parts.push(`--occlusion-mode ${config.occlusionMode}`);
    if (config.minOcclusion !== undefined && config.minOcclusion !== 0.0) parts.push(`--min-occlusion ${config.minOcclusion}`);
    if (config.barberPoleMaxWidth !== undefined && config.barberPoleMaxWidth !== 3.0) parts.push(`--barber-pole-max-width ${config.barberPoleMaxWidth}`);
    if (config.barberPoleMinWidth !== undefined && config.barberPoleMinWidth !== 0.0) parts.push(`--barber-pole-min-width ${config.barberPoleMinWidth}`);
    if (config.stripeHeight !== null && config.stripeHeight !== undefined) parts.push(`--stripe-height ${config.stripeHeight}`);
    if (config.stripeGapRatio !== undefined && config.stripeGapRatio !== 1.0) parts.push(`--stripe-gap-ratio ${config.stripeGapRatio}`);
    if (config.lineSpacing !== undefined && config.lineSpacing !== 0.3) parts.push(`--line-spacing ${config.lineSpacing}`);
    if (config.stripeTaperEdgeSharpness !== undefined && config.stripeTaperEdgeSharpness !== 1.0) parts.push(`--stripe-taper-edge-sharpness ${config.stripeTaperEdgeSharpness}`);
    if (config.stripeTaperMiddleAngle !== undefined && config.stripeTaperMiddleAngle !== 1.0) parts.push(`--stripe-taper-middle-angle ${config.stripeTaperMiddleAngle}`);
    if (config.tipAngle !== undefined && config.tipAngle !== 0) parts.push(`--tip-angle ${config.tipAngle}`);
    if (config.gapPhaseOffset !== undefined && config.gapPhaseOffset !== 0) parts.push(`--gap-phase-offset ${config.gapPhaseOffset}`);
    if (config.showGapOutlines) parts.push(`--show-gap-outlines`);
    if (config.braidVariant && config.braidVariant !== 'two-strand') parts.push(`--braid-variant ${config.braidVariant}`);
    if (config.barberProfile && config.barberProfile !== 'sigmoid') parts.push(`--barber-profile ${config.barberProfile}`);
    if (config.braidTightness !== undefined && config.braidTightness !== 1.0) parts.push(`--braid-tightness ${config.braidTightness}`);
    if (config.braidOcclusionThreshold !== undefined && config.braidOcclusionThreshold !== 0.5) parts.push(`--braid-occlusion-threshold ${config.braidOcclusionThreshold}`);
    if (config.visibleFamilies && config.visibleFamilies.length > 0 && config.visibleFamilies.length < 3) parts.push(`--visible-families ${config.visibleFamilies.join(',')}`);
  } else if (config.fillMode === 'curly') {
    if (config.curlyLoopFrequency !== undefined && config.curlyLoopFrequency !== 1.0) parts.push(`--curly-loop-frequency ${config.curlyLoopFrequency}`);
    if (config.curlyLoopAmplitude !== undefined && config.curlyLoopAmplitude !== 1.0) parts.push(`--curly-loop-amplitude ${config.curlyLoopAmplitude}`);
    if (config.curlyMinWidth !== undefined && config.curlyMinWidth !== 0.5) parts.push(`--curly-min-width ${config.curlyMinWidth}`);
    if (config.curlyStrands !== undefined && config.curlyStrands !== 1) parts.push(`--curly-strands ${config.curlyStrands}`);
    if (config.curlyMaxWidth !== undefined && config.curlyMaxWidth !== 4.0) parts.push(`--curly-max-width ${config.curlyMaxWidth}`);
    if (config.curlyLeanMode && config.curlyLeanMode !== 'none') parts.push(`--curly-lean-mode ${config.curlyLeanMode}`);
    if (config.curlyLeanStrength !== undefined && config.curlyLeanStrength !== 0.5) parts.push(`--curly-lean-strength ${config.curlyLeanStrength}`);
    if (config.curlyDynamicModulation !== undefined && config.curlyDynamicModulation !== 0) parts.push(`--curly-dynamic-modulation ${config.curlyDynamicModulation}`);
    if (config.curlySlantAngle !== undefined && config.curlySlantAngle !== 0) parts.push(`--curly-slant-angle ${config.curlySlantAngle}`);
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
    if (config.outlineOffset !== undefined && config.outlineOffset !== 0.25) {
      parts.push(`--outline-offset ${config.outlineOffset}`);
    }
    if (config.outlinePasses !== undefined && config.outlinePasses !== 1) {
      parts.push(`--outline-passes ${config.outlinePasses}`);
    }
    if (config.outlineMinLength !== null && config.outlineMinLength !== undefined) {
      parts.push(`--outline-min-length ${config.outlineMinLength}`);
    }
    if (config.outlineMaxLength !== null && config.outlineMaxLength !== undefined) {
      parts.push(`--outline-max-length ${config.outlineMaxLength}`);
    }
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
  // Initialize path length histogram
  pathLengthHistogram = new PathLengthHistogram('path-length-histogram', 'path-length-histogram-container');

  // Shared path processing function
  const processPathsInternal = async () => {
    const originalPaths = store.getState('originalPaths');
    const config = store.getState('config');

    if (!originalPaths || originalPaths.length === 0) {
      return;
    }

    // Create new AbortController for this processing run
    processingAbortController = new AbortController();
    const cancelBtn = document.getElementById('btn-cancel-processing');

    try {
      store.setState({ processing: true, configDirty: false });

      // Add visual feedback to both buttons
      const processBtn = document.getElementById('btn-process');
      const processHeaderBtn = document.getElementById('btn-process-header');
      processBtn.classList.add('processing');
      processBtn.disabled = true;
      if (processHeaderBtn) {
        processHeaderBtn.classList.add('processing');
        processHeaderBtn.classList.remove('dirty');
        processHeaderBtn.disabled = true;
      }

      // Enable cancel button
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.style.opacity = '1';
      }

      showProgress(`Processing ${originalPaths.length} paths...`, 0);
      console.log('Processing paths with config:', config);

      // Get attractor state
      const useAttractors = store.getState('useAttractors');
      const attractors = store.getState('attractors');
      const attractorConfig = store.getState('attractorConfig');

      // Get viewBox for focus blur mode
      const viewBox = store.getState('svgBounds');

      // Process with or without attractors, with progress callback and abort signal
      const result = await processPaths(
        originalPaths,
        config,
        useAttractors ? attractors : [],
        useAttractors ? attractorConfig : null,
        viewBox,
        (current, total) => {
          // Update progress bar during processing
          const percent = Math.floor((current / total) * 100);
          updateProgress(`Processing ${current} / ${total} paths (${percent}%)...`, percent);
        },
        processingAbortController.signal
      );

      store.setState({
        processedPaths: result.paths,
        detectedMinLength: result.detectedMinLength,
        detectedMaxLength: result.detectedMaxLength,
        processing: false
      });

      updateProgress('Rendering processed paths...', 100);

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

      // Remove visual feedback from both buttons
      processBtn.classList.remove('processing');
      processBtn.disabled = false;
      if (processHeaderBtn) {
        processHeaderBtn.classList.remove('processing');
        processHeaderBtn.disabled = false;
      }

    } catch (err) {
      // Handle cancellation differently from other errors
      if (err.name === 'AbortError') {
        console.log('Processing was cancelled');
        showComplete('Processing cancelled');
      } else {
        console.error('Processing error:', err);
        hideProgress();
      }
      store.setState({ processing: false });

      // Remove visual feedback on error from both buttons
      const processBtn = document.getElementById('btn-process');
      const processHeaderBtn = document.getElementById('btn-process-header');
      processBtn.classList.remove('processing');
      processBtn.disabled = false;
      if (processHeaderBtn) {
        processHeaderBtn.classList.remove('processing');
        processHeaderBtn.disabled = false;
      }
    } finally {
      // Always disable cancel button when done
      if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.style.opacity = '0.5';
      }
      processingAbortController = null;
    }
  };

  // Throttled version for live preview (500ms delay)
  const throttledProcess = throttle(processPathsInternal, 500);

  // Update header process button state based on dirty flag and content
  const updateHeaderProcessButton = () => {
    const processHeaderBtn = document.getElementById('btn-process-header');
    if (!processHeaderBtn) return;

    const configDirty = store.getState('configDirty');
    const originalPaths = store.getState('originalPaths');
    const hasContent = originalPaths && originalPaths.length > 0;

    // Update dirty state visual indicator
    if (configDirty) {
      processHeaderBtn.classList.add('dirty');
    } else {
      processHeaderBtn.classList.remove('dirty');
    }

    // Enable/disable based on content
    processHeaderBtn.disabled = !hasContent;
  };

  // Subscribe to state changes to update button
  store.subscribe(['configDirty', 'originalPaths'], updateHeaderProcessButton);

  // Track config changes to set dirty flag (unless live preview is on)
  store.subscribe('config', () => {
    const livePreview = store.getState('livePreview');
    if (!livePreview) {
      store.setState({ configDirty: true });
    }
  });

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
        originalSvgMetadata: svgData.metadata,
        detectedLayers: svgData.layers || []
      });

      // Update detected layers display
      updateDetectedLayersDisplay(svgData.layers || []);

      updateProgress('Rendering preview...', 75);

      // Render static preview (preview is always visible in split-panel layout)
      console.log('Calling renderer.render()...');
      renderer.render(svgData.paths, svgData.bounds);

      // Update path length histogram
      currentPathLengths = svgData.paths.map(p => p.length);
      const config = store.getState('config');
      pathLengthHistogram.update(currentPathLengths, config.minLength || 0, config.maxLength || 0);

      showComplete(`Loaded ${svgData.paths.length} paths from ${file.name}`);

    } catch (err) {
      fileInfo.innerHTML = `<span style="color: #ff4444">Error: ${err.message}</span>`;
      console.error('SVG load error:', err);
      hideProgress();
    }
  });

  // Test SVG dropdown - populate from test_svgs folder if it exists
  const testSvgContainer = document.getElementById('test-svg-container');
  const testSvgDropdown = document.getElementById('test-svg-dropdown');

  async function populateTestSvgDropdown() {
    try {
      const response = await fetch('/api/test-svgs');
      if (!response.ok) return;

      const data = await response.json();
      if (!data.exists || !data.files || data.files.length === 0) {
        // No test_svgs folder or no files - keep dropdown hidden
        return;
      }

      // Populate dropdown with SVG files
      data.files.forEach(filename => {
        const option = document.createElement('option');
        option.value = filename;
        option.textContent = filename;
        testSvgDropdown.appendChild(option);
      });

      // Show the dropdown container
      testSvgContainer.style.display = 'block';
      console.log(`Found ${data.files.length} test SVGs`);
    } catch (err) {
      // Silently ignore - test_svgs folder doesn't exist or API not available
      console.log('Test SVG folder not available');
    }
  }

  // Populate dropdown on init
  populateTestSvgDropdown();

  // Handle test SVG selection
  testSvgDropdown.addEventListener('change', async (e) => {
    const filename = e.target.value;
    if (!filename) return;

    try {
      fileInfo.textContent = 'Loading...';
      showProgress(`Loading ${filename}...`, 0);

      const svgData = await loadSVGFromURL(`/test_svgs/${encodeURIComponent(filename)}`);

      console.log('Test SVG loaded:', {
        paths: svgData.paths.length,
        bounds: svgData.bounds
      });

      updateProgress(`Loaded ${svgData.paths.length} paths`, 50);

      fileInfo.innerHTML = `
        <strong>Loaded:</strong> ${filename}<br>
        <strong>Paths:</strong> ${svgData.paths.length}<br>
        <strong>Bounds:</strong> ${svgData.bounds.width.toFixed(1)} × ${svgData.bounds.height.toFixed(1)} mm
      `;

      store.setState({
        svg: svgData.raw,
        svgBounds: svgData.bounds,
        originalPaths: svgData.paths,
        originalFilename: filename,
        originalSvgMetadata: svgData.metadata,
        detectedLayers: svgData.layers || []
      });

      // Update detected layers display
      updateDetectedLayersDisplay(svgData.layers || []);

      updateProgress('Rendering preview...', 75);

      renderer.render(svgData.paths, svgData.bounds);

      // Update path length histogram
      currentPathLengths = svgData.paths.map(p => p.length);
      const config = store.getState('config');
      pathLengthHistogram.update(currentPathLengths, config.minLength || 0, config.maxLength || 0);

      showComplete(`Loaded ${svgData.paths.length} paths from ${filename}`);

      // Reset dropdown to placeholder
      testSvgDropdown.value = '';

    } catch (err) {
      fileInfo.innerHTML = `<span style="color: #ff4444">Error: ${err.message}</span>`;
      console.error('Test SVG load error:', err);
      hideProgress();
      testSvgDropdown.value = '';
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

      // Update histogram if length thresholds changed
      if ((key === 'minLength' || key === 'maxLength') && currentPathLengths.length > 0) {
        const updatedConfig = store.getState('config');
        pathLengthHistogram.update(currentPathLengths, updatedConfig.minLength || 0, updatedConfig.maxLength || 0);
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

  // Keep short paths checkbox
  const keepShortPathsCheckbox = document.getElementById('keep-short-paths');
  if (keepShortPathsCheckbox) {
    keepShortPathsCheckbox.addEventListener('change', (e) => {
      const config = store.getState('config');
      store.setState({
        config: { ...config, keepShortPaths: e.target.checked }
      });

      // Update CLI command display
      updateCLICommandDisplay(store.getState('config'));

      // Auto-process if live preview is enabled
      if (store.getState('livePreview')) {
        throttledProcess();
      }
    });
  }

  // Fill mode-specific controls
  const modeSpecificInputs = {
    stripeFilled: document.getElementById('stripe-filled'),
    stripeEmpty: document.getElementById('stripe-empty'),
    twistRate: document.getElementById('twist-rate'),
    twistOffset: document.getElementById('twist-offset'),
    spiralStripeFilled: document.getElementById('spiral-stripe-filled'),
    spiralStripeEmpty: document.getElementById('spiral-stripe-empty'),
    // Shape fill controls
    shapeType: document.getElementById('shape-type'),
    shapeFillMode: document.getElementById('shape-fill-mode'),
    shapeSpacing: document.getElementById('shape-spacing'),
    shapeMaxWidth: document.getElementById('shape-max-width'),
    shapeMinWidth: document.getElementById('shape-min-width'),
    // Barber pole controls
    stripeCount: document.getElementById('stripe-count'),
    twistFrequency: document.getElementById('twist-frequency'),
    twistRateMode: document.getElementById('twist-rate-mode'),
    occlusionMode: document.getElementById('occlusion-mode'),
    minOcclusion: document.getElementById('min-occlusion'),
    barberPoleMaxWidth: document.getElementById('barber-pole-max-width'),
    barberPoleMinWidth: document.getElementById('barber-pole-min-width'),
    barberPoleStyle: document.getElementById('barber-pole-style'),
    barberPoleEdgeSoftness: document.getElementById('barber-pole-edge-softness'),
    stripeHeight: document.getElementById('stripe-height'),
    stripeGapRatio: document.getElementById('stripe-gap-ratio'),
    lineSpacing: document.getElementById('line-spacing'),
    stripeTaperEdgeSharpness: document.getElementById('stripe-taper-edge-sharpness'),
    stripeTaperMiddleAngle: document.getElementById('stripe-taper-middle-angle'),
    tipAngle: document.getElementById('tip-angle'),
    gapPhaseOffset: document.getElementById('gap-phase-offset'),
    showGapOutlines: document.getElementById('show-gap-outlines'),
    braidVariant: document.getElementById('braid-variant'),
    barberProfile: document.getElementById('barber-profile'),
    braidTightness: document.getElementById('braid-tightness'),
    braidOcclusionThreshold: document.getElementById('braid-occlusion-threshold'),
    visibleFamily1: document.getElementById('visible-family-1'),
    visibleFamily2: document.getElementById('visible-family-2'),
    visibleFamily3: document.getElementById('visible-family-3'),
    // Curly mode controls
    curlyLoopFrequency: document.getElementById('curly-loop-frequency'),
    curlyLoopAmplitude: document.getElementById('curly-loop-amplitude'),
    curlyMinWidth: document.getElementById('curly-min-width'),
    curlyStrands: document.getElementById('curly-strands'),
    curlyMaxWidth: document.getElementById('curly-max-width'),
    curlyLeanMode: document.getElementById('curly-lean-mode'),
    curlyLeanStrength: document.getElementById('curly-lean-strength'),
    curlyDynamicModulation: document.getElementById('curly-dynamic-modulation'),
    curlySlantAngle: document.getElementById('curly-slant-angle'),
    curlyCompressionMode: document.getElementById('curly-compression-mode'),
    curlyCompressionAmount: document.getElementById('curly-compression-amount'),
    curlyCurvatureSensitivity: document.getElementById('curly-curvature-sensitivity'),
    curlyPeriodicWavelength: document.getElementById('curly-periodic-wavelength'),
    curlyCompressionInvert: document.getElementById('curly-compression-invert'),
    // Moiré mode controls
    moireMode: document.getElementById('moire-mode'),
    moireSpacingA: document.getElementById('moire-spacing-a'),
    moireSpacingDelta: document.getElementById('moire-spacing-delta'),
    moirePhaseDriftWavelength: document.getElementById('moire-phase-drift-wavelength'),
    moirePhaseDriftAmplitude: document.getElementById('moire-phase-drift-amplitude'),
    moireFamilies: document.getElementById('moire-families'),
    moirePassesPerFamily: document.getElementById('moire-passes-per-family'),
    moireFamilyOffset: document.getElementById('moire-family-offset'),
    moireMaxWidth: document.getElementById('moire-max-width'),
    moireMinWidth: document.getElementById('moire-min-width'),
    moireSamplingDrift: document.getElementById('moire-sampling-drift'),
    moireSamplingDriftWavelength: document.getElementById('moire-sampling-drift-wavelength'),
    moireSamplingDriftAmplitude: document.getElementById('moire-sampling-drift-amplitude'),
    // Woodgrain mode controls
    woodgrainBands: document.getElementById('woodgrain-bands'),
    woodgrainSpacing: document.getElementById('woodgrain-spacing'),
    woodgrainDriftAmplitude: document.getElementById('woodgrain-drift-amplitude'),
    woodgrainDriftWavelength: document.getElementById('woodgrain-drift-wavelength'),
    woodgrainDriftFalloff: document.getElementById('woodgrain-drift-falloff'),
    woodgrainMaxWidth: document.getElementById('woodgrain-max-width'),
    woodgrainMinWidth: document.getElementById('woodgrain-min-width'),
    // Contour echo mode controls
    contourSpacing: document.getElementById('contour-spacing'),
    contourMaxPasses: document.getElementById('contour-max-passes'),
    contourNoiseMax: document.getElementById('contour-noise-max'),
    contourNoiseMin: document.getElementById('contour-noise-min'),
    contourNoiseFrequency: document.getElementById('contour-noise-frequency'),
    contourSymmetric: document.getElementById('contour-symmetric'),
    contourMaxWidth: document.getElementById('contour-max-width'),
    contourMinWidth: document.getElementById('contour-min-width')
  };

  // Add numeric value displays for range sliders
  const rangeInputs = document.querySelectorAll('input[type="range"]');
  rangeInputs.forEach(input => {
    const valueSpan = document.getElementById(input.id + '-value');
    if (valueSpan) {
      const updateValue = () => {
        let val = input.value;
        // Add unit suffix if applicable
        if (input.id.includes('angle')) val += '°';
        if (input.id.includes('wavelength')) val += 'mm';
        valueSpan.textContent = val;
      };
      input.addEventListener('input', updateValue);
      updateValue(); // Set initial value
    }
  });

  Object.entries(modeSpecificInputs).forEach(([key, input]) => {
    if (!input) return; // Skip if element doesn't exist

    input.addEventListener('change', () => {
      const config = store.getState('config');

      // Handle both numeric and string values
      let value;
      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        // Special case: empty stripeHeight should be null (auto-scale)
        if (key === 'stripeHeight' && input.value === '') {
          value = null;
        } else {
          value = parseFloat(input.value);
        }
      } else {
        value = input.value;
      }

      // Map spiral stripe controls to config keys
      const configKey = key === 'spiralStripeFilled' ? 'stripeFilled' :
                        key === 'spiralStripeEmpty' ? 'stripeEmpty' : key;

      // Special handling for visible families checkboxes
      // Build array from all three checkboxes when any of them changes
      if (key === 'visibleFamily1' || key === 'visibleFamily2' || key === 'visibleFamily3') {
        const visibleFamilies = [];
        if (modeSpecificInputs.visibleFamily1?.checked) visibleFamilies.push(1);
        if (modeSpecificInputs.visibleFamily2?.checked) visibleFamilies.push(2);
        if (modeSpecificInputs.visibleFamily3?.checked) visibleFamilies.push(3);

        store.setState({
          config: { ...config, visibleFamilies: visibleFamilies.length > 0 ? visibleFamilies : null }
        });
      }
      // Update fillModeOptions for spiral mode
      else if (key === 'twistRate' || key === 'twistOffset') {
        const fillModeOptions = config.fillModeOptions || {};
        store.setState({
          config: {
            ...config,
            [configKey]: value,
            fillModeOptions: { ...fillModeOptions, [configKey]: value }
          }
        });
      }
      // Special handling for moiré spacing delta - convert percentage to ratio
      else if (key === 'moireSpacingDelta') {
        store.setState({
          config: { ...config, moireSpacingDelta: value / 100 }
        });
      }
      // Special handling for moiré families - convert string to number
      else if (key === 'moireFamilies') {
        store.setState({
          config: { ...config, moireFamilies: parseInt(value, 10) }
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

  // Crosshatch organic parameter controls
  const organicCrosshatchInputs = {
    wiggle: document.getElementById('crosshatch-wiggle'),
    wiggleFreq: document.getElementById('crosshatch-wiggle-freq'),
    angleJitter: document.getElementById('crosshatch-angle-jitter'),
    lengthJitter: document.getElementById('crosshatch-length-jitter'),
    positionJitter: document.getElementById('crosshatch-position-jitter'),
    spacingJitter: document.getElementById('crosshatch-spacing-jitter')
  };

  Object.entries(organicCrosshatchInputs).forEach(([key, input]) => {
    if (!input) return;

    input.addEventListener('change', () => {
      const config = store.getState('config');
      const value = parseFloat(input.value);

      store.setState({
        config: {
          ...config,
          crosshatchOrganic: {
            ...(config.crosshatchOrganic || {}),
            [key]: value
          }
        }
      });

      // Update CLI command display
      updateCLICommandDisplay(store.getState('config'));

      // Auto-process if live preview is enabled
      if (store.getState('livePreview')) {
        throttledProcess();
      }
    });
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
  const outlineThicknessControls = document.getElementById('outline-thickness-controls');

  document.getElementById('add-outline').addEventListener('change', (e) => {
    const config = store.getState('config');
    store.setState({
      config: { ...config, addOutline: e.target.checked }
    });

    // Show/hide outline thickness controls
    outlineThicknessControls.style.display = e.target.checked ? 'block' : 'none';

    // Update CLI command display
    updateCLICommandDisplay(store.getState('config'));

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  });

  // Outline offset controls (number input and slider syncing)
  const outlineOffsetInput = document.getElementById('outline-offset');
  const outlineOffsetSlider = document.getElementById('outline-offset-slider');

  outlineOffsetInput.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    outlineOffsetSlider.value = value;
    const config = store.getState('config');
    store.setState({
      config: { ...config, outlineOffset: value }
    });
    updateCLICommandDisplay(store.getState('config'));

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  });

  outlineOffsetSlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    outlineOffsetInput.value = value;
    const config = store.getState('config');
    store.setState({
      config: { ...config, outlineOffset: value }
    });
    updateCLICommandDisplay(store.getState('config'));

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  });

  // Outline passes controls (number input and slider syncing)
  const outlinePassesInput = document.getElementById('outline-passes');
  const outlinePassesSlider = document.getElementById('outline-passes-slider');

  outlinePassesInput.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    outlinePassesSlider.value = value;
    const config = store.getState('config');
    store.setState({
      config: { ...config, outlinePasses: value }
    });
    updateCLICommandDisplay(store.getState('config'));

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  });

  outlinePassesSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    outlinePassesInput.value = value;
    const config = store.getState('config');
    store.setState({
      config: { ...config, outlinePasses: value }
    });
    updateCLICommandDisplay(store.getState('config'));

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  });

  // Outline min/max length filtering controls
  const outlineMinLengthInput = document.getElementById('outline-min-length');
  const outlineMaxLengthInput = document.getElementById('outline-max-length');

  outlineMinLengthInput.addEventListener('input', (e) => {
    const value = e.target.value === '' ? null : parseFloat(e.target.value);
    const config = store.getState('config');
    store.setState({
      config: { ...config, outlineMinLength: value }
    });
    updateCLICommandDisplay(store.getState('config'));

    // Auto-process if live preview is enabled
    if (store.getState('livePreview')) {
      throttledProcess();
    }
  });

  outlineMaxLengthInput.addEventListener('input', (e) => {
    const value = e.target.value === '' ? null : parseFloat(e.target.value);
    const config = store.getState('config');
    store.setState({
      config: { ...config, outlineMaxLength: value }
    });
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

  // Layer preservation controls
  const preserveLayersCheckbox = document.getElementById('preserve-layers');

  preserveLayersCheckbox.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    const config = store.getState('config');
    store.setState({
      config: { ...config, preserveLayers: enabled }
    });
  });

  // Function to show/hide mode-specific controls
  function updateFillModeControls(mode) {
    const stripedControls = document.getElementById('mode-striped-controls');
    const spiralControls = document.getElementById('mode-spiral-controls');
    const crosshatchControls = document.getElementById('mode-crosshatch-controls');
    const focusBlurControls = document.getElementById('mode-focus-blur-controls');
    const hatchGradientControls = document.getElementById('mode-hatch-gradient-controls');
    const shapeFillControls = document.getElementById('mode-shape-fill-controls');
    const barberPoleControls = document.getElementById('mode-barber-pole-controls');
    const curlyControls = document.getElementById('mode-curly-controls');
    const moireControls = document.getElementById('mode-moire-controls');
    const woodgrainControls = document.getElementById('mode-woodgrain-controls');
    const contourEchoControls = document.getElementById('mode-contour-echo-controls');

    // Hide all mode-specific controls
    stripedControls.style.display = 'none';
    spiralControls.style.display = 'none';
    crosshatchControls.style.display = 'none';
    focusBlurControls.style.display = 'none';
    hatchGradientControls.style.display = 'none';
    shapeFillControls.style.display = 'none';
    barberPoleControls.style.display = 'none';
    curlyControls.style.display = 'none';
    moireControls.style.display = 'none';
    woodgrainControls.style.display = 'none';
    contourEchoControls.style.display = 'none';

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
    } else if (mode === 'shape-fill') {
      shapeFillControls.style.display = 'block';
    } else if (mode === 'barber-pole') {
      barberPoleControls.style.display = 'block';
    } else if (mode === 'curly') {
      curlyControls.style.display = 'block';
    } else if (mode === 'moire') {
      moireControls.style.display = 'block';
    } else if (mode === 'woodgrain') {
      woodgrainControls.style.display = 'block';
    } else if (mode === 'contour-echo') {
      contourEchoControls.style.display = 'block';
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
  // Process button click handler (shared by both buttons)
  const handleProcessClick = async () => {
    const originalPaths = store.getState('originalPaths');

    if (!originalPaths || originalPaths.length === 0) {
      alert('Load an SVG file first!');
      return;
    }

    await processPathsInternal();
  };

  document.getElementById('btn-process').addEventListener('click', handleProcessClick);

  const processHeaderBtn = document.getElementById('btn-process-header');
  if (processHeaderBtn) {
    processHeaderBtn.addEventListener('click', handleProcessClick);
  }

  // Cancel processing
  const cancelBtn = document.getElementById('btn-cancel-processing');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (processingAbortController) {
        processingAbortController.abort();
      }
    });
  }

  // Config modal
  const configModal = document.getElementById('config-modal');
  const configJson = document.getElementById('config-json');
  const btnShowConfig = document.getElementById('btn-show-config');
  const btnConfigCopy = document.getElementById('config-copy');
  const btnConfigClose = document.getElementById('config-modal-close');

  if (btnShowConfig) {
    btnShowConfig.addEventListener('click', () => {
      const config = store.getState('config');
      configJson.value = JSON.stringify(config, null, 2);
      configModal.style.display = 'flex';
    });
  }

  if (btnConfigClose) {
    btnConfigClose.addEventListener('click', () => {
      configModal.style.display = 'none';
    });
  }

  if (configModal) {
    configModal.addEventListener('click', (e) => {
      if (e.target === configModal) {
        configModal.style.display = 'none';
      }
    });
  }

  if (btnConfigCopy) {
    btnConfigCopy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(configJson.value);
        btnConfigCopy.textContent = 'Copied!';
        setTimeout(() => btnConfigCopy.textContent = 'Copy to Clipboard', 2000);
      } catch (err) {
        configJson.select();
        document.execCommand('copy');
        btnConfigCopy.textContent = 'Copied!';
        setTimeout(() => btnConfigCopy.textContent = 'Copy to Clipboard', 2000);
      }
    });
  }

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

  // ============================================================================
  // CONFIG PRESET HANDLERS
  // ============================================================================

  /**
   * Download config as JSON file
   */
  function exportConfig() {
    const config = store.getState('config');
    const configJson = JSON.stringify(config, null, 2);
    const blob = new Blob([configJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `plotter-config-${timestamp}.json`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showPresetStatus(`✓ Config exported: ${filename}`, 'success');
    console.log('Config exported:', filename);
  }

  /**
   * Import config from JSON file
   */
  async function importConfig(file) {
    try {
      const text = await file.text();
      const importedConfig = JSON.parse(text);

      // Validate that it has expected config properties
      if (!importedConfig || typeof importedConfig !== 'object') {
        throw new Error('Invalid config file format');
      }

      // Merge with current config to handle missing properties
      const currentConfig = store.getState('config');
      const mergedConfig = { ...currentConfig, ...importedConfig };

      store.setState({ config: mergedConfig });

      // Update all UI inputs to reflect loaded config
      syncUIFromConfig(mergedConfig);

      showPresetStatus(`✓ Config loaded from ${file.name}`, 'success');
      console.log('Config imported:', file.name, mergedConfig);

      // Auto-process if live preview is enabled
      if (store.getState('livePreview')) {
        throttledProcess();
      }
    } catch (error) {
      showPresetStatus(`✗ Failed to import config: ${error.message}`, 'error');
      console.error('Config import error:', error);
    }
  }

  /**
   * Extract config from SVG metadata
   */
  async function loadConfigFromSVG(file) {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'image/svg+xml');

      // Look for metadata element with id="plotter-config"
      const metadataElement = doc.getElementById('plotter-config');
      if (!metadataElement) {
        throw new Error('No config metadata found in SVG. This SVG was not generated by this tool or was created before config embedding was implemented.');
      }

      // Extract config JSON from the <config> element
      const configElement = metadataElement.querySelector('config');
      if (!configElement) {
        throw new Error('Config element not found in metadata');
      }

      const configJson = configElement.textContent.trim();
      const importedConfig = JSON.parse(configJson);

      // Merge with current config
      const currentConfig = store.getState('config');
      const mergedConfig = { ...currentConfig, ...importedConfig };

      store.setState({ config: mergedConfig });

      // Update all UI inputs
      syncUIFromConfig(mergedConfig);

      showPresetStatus(`✓ Config loaded from SVG: ${file.name}`, 'success');
      console.log('Config loaded from SVG:', file.name, mergedConfig);

      // Auto-process if live preview is enabled
      if (store.getState('livePreview')) {
        throttledProcess();
      }
    } catch (error) {
      showPresetStatus(`✗ Failed to load config from SVG: ${error.message}`, 'error');
      console.error('SVG config load error:', error);
    }
  }

  /**
   * Show status message in preset section
   */
  function showPresetStatus(message, type = 'info') {
    const statusElement = document.getElementById('preset-status');
    statusElement.textContent = message;
    statusElement.style.display = 'block';

    // Color coding
    if (type === 'success') {
      statusElement.style.color = '#2d7a2d';
      statusElement.style.background = 'rgba(45, 122, 45, 0.1)';
    } else if (type === 'error') {
      statusElement.style.color = '#c92a2a';
      statusElement.style.background = 'rgba(201, 42, 42, 0.1)';
    } else {
      statusElement.style.color = '#4a90e2';
      statusElement.style.background = 'rgba(74, 144, 226, 0.1)';
    }

    // Auto-hide after 5 seconds
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 5000);
  }

  /**
   * Sync all UI inputs from config object
   * This updates all input fields to match the loaded config
   */
  function syncUIFromConfig(config) {
    // Basic controls (from fillInputs, not modeSpecificInputs)
    if (fillInputs.baseOffset) fillInputs.baseOffset.value = config.baseOffset || 0.25;
    if (fillInputs.minPasses) fillInputs.minPasses.value = config.minPasses || 1;
    if (fillInputs.maxPasses) fillInputs.maxPasses.value = config.maxPasses || 10;
    if (fillInputs.fillMode) fillInputs.fillMode.value = config.fillMode || 'offset';
    if (fillInputs.envelope) fillInputs.envelope.value = config.envelope || 'sinTaperBoth';
    if (fillInputs.curve) fillInputs.curve.value = config.curve || 'linear';
    if (fillInputs.noise) fillInputs.noise.value = config.noise || 0;
    if (fillInputs.noiseFrequency) fillInputs.noiseFrequency.value = config.noiseFrequency || 50;
    if (fillInputs.sampleRate) fillInputs.sampleRate.value = config.sampleRate || 2;

    // Length thresholding checkbox
    const keepShortPathsCheckbox = document.getElementById('keep-short-paths');
    if (keepShortPathsCheckbox) keepShortPathsCheckbox.checked = config.keepShortPaths || false;

    // Mode-specific controls
    if (config.fillMode === 'striped') {
      if (modeSpecificInputs.stripeFilled) modeSpecificInputs.stripeFilled.value = config.stripeFilled || 1;
      if (modeSpecificInputs.stripeEmpty) modeSpecificInputs.stripeEmpty.value = config.stripeEmpty || 1;
    } else if (config.fillMode === 'spiral') {
      if (modeSpecificInputs.twistRate) modeSpecificInputs.twistRate.value = config.twistRate || 0.01;
      if (modeSpecificInputs.twistOffset) modeSpecificInputs.twistOffset.value = config.twistOffset || 0;
    } else if (config.fillMode === 'crosshatch') {
      if (modeSpecificInputs.crosshatchAngles) modeSpecificInputs.crosshatchAngles.value = config.crosshatchAngles?.join(',') || '45,135';
      if (modeSpecificInputs.crosshatchSpacing) modeSpecificInputs.crosshatchSpacing.value = config.crosshatchSpacing || 1.0;
    } else if (config.fillMode === 'shape-fill') {
      if (modeSpecificInputs.shapeType) modeSpecificInputs.shapeType.value = config.shapeType || 'circle';
      if (modeSpecificInputs.shapeFillMode) modeSpecificInputs.shapeFillMode.value = config.shapeFillMode || 'filled';
      if (modeSpecificInputs.shapeSpacing) modeSpecificInputs.shapeSpacing.value = config.shapeSpacing !== undefined ? config.shapeSpacing : 1.0;
      if (modeSpecificInputs.shapeMaxWidth) modeSpecificInputs.shapeMaxWidth.value = config.shapeMaxWidth !== undefined ? config.shapeMaxWidth : 3.0;
      if (modeSpecificInputs.shapeMinWidth) modeSpecificInputs.shapeMinWidth.value = config.shapeMinWidth !== undefined ? config.shapeMinWidth : 0.0;
    } else if (config.fillMode === 'curly') {
      if (modeSpecificInputs.curlyLoopFrequency) modeSpecificInputs.curlyLoopFrequency.value = config.curlyLoopFrequency !== undefined ? config.curlyLoopFrequency : 1.0;
      if (modeSpecificInputs.curlyLoopAmplitude) modeSpecificInputs.curlyLoopAmplitude.value = config.curlyLoopAmplitude !== undefined ? config.curlyLoopAmplitude : 1.0;
      if (modeSpecificInputs.curlyMinWidth) modeSpecificInputs.curlyMinWidth.value = config.curlyMinWidth !== undefined ? config.curlyMinWidth : 0.5;
      if (modeSpecificInputs.curlyStrands) modeSpecificInputs.curlyStrands.value = config.curlyStrands !== undefined ? config.curlyStrands : 1;
      if (modeSpecificInputs.curlyMaxWidth) modeSpecificInputs.curlyMaxWidth.value = config.curlyMaxWidth !== undefined ? config.curlyMaxWidth : 4.0;
      if (modeSpecificInputs.curlyLeanMode) modeSpecificInputs.curlyLeanMode.value = config.curlyLeanMode || 'none';
      if (modeSpecificInputs.curlyLeanStrength) modeSpecificInputs.curlyLeanStrength.value = config.curlyLeanStrength !== undefined ? config.curlyLeanStrength : 0.5;
      if (modeSpecificInputs.curlyDynamicModulation) modeSpecificInputs.curlyDynamicModulation.value = config.curlyDynamicModulation !== undefined ? config.curlyDynamicModulation : 0;
      if (modeSpecificInputs.curlySlantAngle) modeSpecificInputs.curlySlantAngle.value = config.curlySlantAngle !== undefined ? config.curlySlantAngle : 0;
    } else if (config.fillMode === 'moire') {
      if (modeSpecificInputs.moireMode) modeSpecificInputs.moireMode.value = config.moireMode || 'spacing';
      if (modeSpecificInputs.moireSpacingA) modeSpecificInputs.moireSpacingA.value = config.moireSpacingA !== undefined ? config.moireSpacingA : 1.0;
      // Convert ratio to percentage for display
      if (modeSpecificInputs.moireSpacingDelta) modeSpecificInputs.moireSpacingDelta.value = (config.moireSpacingDelta !== undefined ? config.moireSpacingDelta : 0.02) * 100;
      if (modeSpecificInputs.moirePhaseDriftWavelength) modeSpecificInputs.moirePhaseDriftWavelength.value = config.moirePhaseDriftWavelength !== undefined ? config.moirePhaseDriftWavelength : 80;
      if (modeSpecificInputs.moirePhaseDriftAmplitude) modeSpecificInputs.moirePhaseDriftAmplitude.value = config.moirePhaseDriftAmplitude !== undefined ? config.moirePhaseDriftAmplitude : 0.2;
      if (modeSpecificInputs.moireFamilies) modeSpecificInputs.moireFamilies.value = config.moireFamilies !== undefined ? config.moireFamilies : 2;
      if (modeSpecificInputs.moirePassesPerFamily) modeSpecificInputs.moirePassesPerFamily.value = config.moirePassesPerFamily !== undefined ? config.moirePassesPerFamily : 5;
      if (modeSpecificInputs.moireFamilyOffset) modeSpecificInputs.moireFamilyOffset.value = config.moireFamilyOffset !== undefined ? config.moireFamilyOffset : 0.5;
      if (modeSpecificInputs.moireMaxWidth) modeSpecificInputs.moireMaxWidth.value = config.moireMaxWidth !== undefined ? config.moireMaxWidth : 3.0;
      if (modeSpecificInputs.moireMinWidth) modeSpecificInputs.moireMinWidth.value = config.moireMinWidth !== undefined ? config.moireMinWidth : 0.0;
      if (modeSpecificInputs.moireSamplingDrift) modeSpecificInputs.moireSamplingDrift.checked = config.moireSamplingDrift || false;
      if (modeSpecificInputs.moireSamplingDriftWavelength) modeSpecificInputs.moireSamplingDriftWavelength.value = config.moireSamplingDriftWavelength !== undefined ? config.moireSamplingDriftWavelength : 100;
      if (modeSpecificInputs.moireSamplingDriftAmplitude) modeSpecificInputs.moireSamplingDriftAmplitude.value = config.moireSamplingDriftAmplitude !== undefined ? config.moireSamplingDriftAmplitude : 0.5;
    } else if (config.fillMode === 'woodgrain') {
      if (modeSpecificInputs.woodgrainBands) modeSpecificInputs.woodgrainBands.value = config.woodgrainBands !== undefined ? config.woodgrainBands : 8;
      if (modeSpecificInputs.woodgrainSpacing) modeSpecificInputs.woodgrainSpacing.value = config.woodgrainSpacing !== undefined ? config.woodgrainSpacing : 1.0;
      if (modeSpecificInputs.woodgrainDriftAmplitude) modeSpecificInputs.woodgrainDriftAmplitude.value = config.woodgrainDriftAmplitude !== undefined ? config.woodgrainDriftAmplitude : 0.5;
      if (modeSpecificInputs.woodgrainDriftWavelength) modeSpecificInputs.woodgrainDriftWavelength.value = config.woodgrainDriftWavelength !== undefined ? config.woodgrainDriftWavelength : 60;
      if (modeSpecificInputs.woodgrainDriftFalloff) modeSpecificInputs.woodgrainDriftFalloff.value = config.woodgrainDriftFalloff !== undefined ? config.woodgrainDriftFalloff : 0.5;
      if (modeSpecificInputs.woodgrainMaxWidth) modeSpecificInputs.woodgrainMaxWidth.value = config.woodgrainMaxWidth !== undefined ? config.woodgrainMaxWidth : 5.0;
      if (modeSpecificInputs.woodgrainMinWidth) modeSpecificInputs.woodgrainMinWidth.value = config.woodgrainMinWidth !== undefined ? config.woodgrainMinWidth : 0.0;
    } else if (config.fillMode === 'contour-echo') {
      if (modeSpecificInputs.contourSpacing) modeSpecificInputs.contourSpacing.value = config.contourSpacing !== undefined ? config.contourSpacing : 0.5;
      if (modeSpecificInputs.contourMaxPasses) modeSpecificInputs.contourMaxPasses.value = config.contourMaxPasses !== undefined ? config.contourMaxPasses : 10;
      if (modeSpecificInputs.contourNoiseMax) modeSpecificInputs.contourNoiseMax.value = config.contourNoiseMax !== undefined ? config.contourNoiseMax : 0.3;
      if (modeSpecificInputs.contourNoiseMin) modeSpecificInputs.contourNoiseMin.value = config.contourNoiseMin !== undefined ? config.contourNoiseMin : 0.0;
      if (modeSpecificInputs.contourNoiseFrequency) modeSpecificInputs.contourNoiseFrequency.value = config.contourNoiseFrequency !== undefined ? config.contourNoiseFrequency : 20;
      if (modeSpecificInputs.contourSymmetric) modeSpecificInputs.contourSymmetric.checked = config.contourSymmetric !== undefined ? config.contourSymmetric : true;
      if (modeSpecificInputs.contourMaxWidth) modeSpecificInputs.contourMaxWidth.value = config.contourMaxWidth !== undefined ? config.contourMaxWidth : 5.0;
      if (modeSpecificInputs.contourMinWidth) modeSpecificInputs.contourMinWidth.value = config.contourMinWidth !== undefined ? config.contourMinWidth : 0.0;
    }

    // Update fill mode controls visibility
    updateFillModeControls(config.fillMode || 'offset');

    // Update CLI command display
    updateCLICommandDisplay(config);

    console.log('UI synced from config');
  }

  /**
   * Save config to localStorage
   */
  function saveConfigToLocalStorage(config) {
    try {
      localStorage.setItem('plotterThickenerLastConfig', JSON.stringify(config));
    } catch (error) {
      console.warn('Failed to save config to localStorage:', error);
    }
  }

  /**
   * Load config from localStorage
   */
  function loadConfigFromLocalStorage() {
    try {
      const saved = localStorage.getItem('plotterThickenerLastConfig');
      if (saved) {
        const config = JSON.parse(saved);
        console.log('Loaded config from localStorage');
        return config;
      }
    } catch (error) {
      console.warn('Failed to load config from localStorage:', error);
    }
    return null;
  }

  // Subscribe to config changes to auto-save to localStorage
  store.subscribe('config', (state) => {
    saveConfigToLocalStorage(state.config);
  });

  // Load saved config on startup (if exists)
  const savedConfig = loadConfigFromLocalStorage();
  if (savedConfig) {
    const currentConfig = store.getState('config');
    const mergedConfig = { ...currentConfig, ...savedConfig };
    store.setState({ config: mergedConfig });
    syncUIFromConfig(mergedConfig);
    console.log('✓ Restored last session config from localStorage');
  }

  // Export Config button
  document.getElementById('btn-export-config').addEventListener('click', () => {
    exportConfig();
  });

  // Import Config button
  document.getElementById('btn-import-config').addEventListener('click', () => {
    document.getElementById('config-file-input').click();
  });

  // Config file input handler
  document.getElementById('config-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importConfig(file);
    }
    // Reset input so same file can be loaded again
    e.target.value = '';
  });

  // Load from SVG button
  document.getElementById('btn-load-from-svg').addEventListener('click', () => {
    document.getElementById('svg-config-input').click();
  });

  // SVG config input handler
  document.getElementById('svg-config-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      loadConfigFromSVG(file);
    }
    // Reset input so same file can be loaded again
    e.target.value = '';
  });

  // Reset to Defaults button
  document.getElementById('btn-reset-config').addEventListener('click', () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      // Create a fresh copy of the default config
      const defaultConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

      // Update store with default config
      store.setState({ config: defaultConfig });

      // Sync all UI inputs
      syncUIFromConfig(defaultConfig);

      // Clear localStorage so defaults persist on refresh
      localStorage.removeItem('plotterThickenerLastConfig');

      // Reset the preset dropdown
      document.getElementById('builtin-presets').value = '';

      showPresetStatus('All settings reset to defaults', 'success');
      console.log('Config reset to defaults');
    }
  });

  // Built-in presets dropdown
  document.getElementById('builtin-presets').addEventListener('change', async (e) => {
    const presetName = e.target.value;
    if (!presetName) return;

    try {
      // Fetch the preset JSON from the shared/config/presets directory
      const response = await fetch(`/shared/config/presets/${presetName}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load preset: ${response.statusText}`);
      }

      const presetConfig = await response.json();

      // Merge with current config
      const currentConfig = store.getState('config');
      const mergedConfig = { ...currentConfig, ...presetConfig };

      store.setState({ config: mergedConfig });

      // Update all UI inputs
      syncUIFromConfig(mergedConfig);

      showPresetStatus(`✓ Loaded preset: ${e.target.options[e.target.selectedIndex].text}`, 'success');
      console.log('Built-in preset loaded:', presetName, mergedConfig);

      // Auto-process if live preview is enabled
      if (store.getState('livePreview')) {
        throttledProcess();
      }
    } catch (error) {
      showPresetStatus(`✗ Failed to load preset: ${error.message}`, 'error');
      console.error('Preset load error:', error);
    }

    // Reset dropdown
    e.target.value = '';
  });

  // ============================================================================
  // END CONFIG PRESET HANDLERS
  // ============================================================================

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

    // Auto-process if no processed paths exist OR if config has changed
    const configDirty = store.getState('configDirty');
    if (!processedPaths || processedPaths.length === 0 || configDirty) {
      if (configDirty) {
        console.log('Config has changed since last process - reprocessing before export...');
      } else {
        console.log('No processed paths found - auto-processing before export...');
      }
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
        outputSize,
        config,  // Pass full config for embedding in metadata
        config.preserveLayers || false  // Preserve input layer structure
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

  // Exclude paths outside attractors checkbox
  document.getElementById('exclude-unaffected-paths').addEventListener('change', (e) => {
    const attractorConfig = store.getState('attractorConfig');
    store.setState({
      attractorConfig: { ...attractorConfig, excludeUnaffectedPaths: e.target.checked }
    });
    console.log(`Exclude unaffected paths ${e.target.checked ? 'enabled' : 'disabled'}`);

    // Reprocess if attractors enabled and have paths
    if (store.getState('useAttractors') && store.getState('livePreview') && store.getState('originalPaths').length > 0) {
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
