/**
 * Main application entry point
 */

import { store } from './state/store.js';
import { initUI } from './ui/app.js';
import { initRenderer } from './renderer/canvas.js';

// Initialize application
function init() {
  console.log('Plotter Line Thickener v2 - initializing...');

  // Set up renderer
  const canvas = document.getElementById('preview-canvas');
  if (!canvas) {
    console.error('Canvas element not found!');
    return;
  }
  console.log('Canvas element found:', canvas);

  const renderer = initRenderer(canvas);
  console.log('Renderer initialized');

  // Initialize UI and wire up event handlers
  initUI(store, renderer);

  // Subscribe to state changes for debugging
  if (import.meta.env.DEV) {
    store.subscribe('*', (state, changed) => {
      console.log('State changed:', Array.from(changed), state);
    });
  }

  console.log('✓ Application ready');
}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
