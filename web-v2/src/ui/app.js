/**
 * UI initialization and event handlers
 */

import { loadSVGFile } from '../utils/svg-loader.js';
import { processPaths } from '../utils/processor.js';

export function initUI(store, renderer) {
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
        originalPaths: svgData.paths
      });

      // Auto-switch to preview tab
      document.querySelector('[data-tab="preview"]').click();

      // Render static preview
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
    });
  });

  // Process paths
  document.getElementById('btn-process').addEventListener('click', async () => {
    const originalPaths = store.getState('originalPaths');
    const config = store.getState('config');

    if (!originalPaths || originalPaths.length === 0) {
      alert('Load an SVG file first!');
      return;
    }

    try {
      store.setState({ processing: true });
      console.log('Processing paths with config:', config);

      const processed = await processPaths(originalPaths, config);

      store.setState({
        processedPaths: processed,
        processing: false
      });

      // Render processed paths
      const bounds = store.getState('svgBounds');
      renderer.render(processed, bounds);

      console.log(`Rendered ${processed.length} processed paths`);
    } catch (err) {
      console.error('Processing error:', err);
      alert(`Processing failed: ${err.message}`);
      store.setState({ processing: false });
    }
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

  // Export
  document.getElementById('btn-export').addEventListener('click', () => {
    alert('Export functionality coming soon!');
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
  }

  parts.push(`--sample-rate ${config.sampleRate}`);

  return parts.join(' \\\n  ');
}
