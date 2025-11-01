/**
 * Canvas renderer for SVG preview
 */

export function initRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let currentPaths = [];
  let currentBounds = null;
  let viewState = { zoom: 1, panX: 0, panY: 0 };

  // Set canvas size to match container
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    console.log('Resizing canvas - rect:', rect);

    // Use fallback if rect has no dimensions yet
    const width = rect.width > 0 ? rect.width : 800;
    const height = rect.height > 0 ? rect.height : 600;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    // Reset transform after resize
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    console.log('Canvas resized:', { width, height, dpr, actualWidth: canvas.width, actualHeight: canvas.height });
  }

  // Delay resize to ensure CSS has loaded
  setTimeout(resizeCanvas, 10);
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (currentPaths.length > 0) {
      draw();
    }
  });

  // Pan/zoom interaction
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener('mousedown', (e) => {
    isPanning = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isPanning) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    viewState.panX += dx;
    viewState.panY += dy;

    lastX = e.clientX;
    lastY = e.clientY;

    draw();
  });

  canvas.addEventListener('mouseup', () => {
    isPanning = false;
  });

  canvas.addEventListener('mouseleave', () => {
    isPanning = false;
  });

  // Wheel zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    viewState.zoom *= zoomFactor;
    viewState.zoom = Math.max(0.1, Math.min(10, viewState.zoom));
    draw();
  });

  /**
   * Draw paths on canvas
   */
  function draw() {
    const rect = canvas.getBoundingClientRect();

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!currentBounds || currentPaths.length === 0) {
      console.log('Draw skipped - no bounds or paths', { currentBounds, pathCount: currentPaths.length });
      return;
    }

    console.log('Drawing', currentPaths.length, 'paths with bounds', currentBounds);

    // Calculate transform to fit bounds in canvas
    // Optimize for A3 landscape (420mm x 297mm) aspect ratio
    const padding = 40;
    const availWidth = rect.width - padding * 2;
    const availHeight = rect.height - padding * 2;

    const scaleX = availWidth / currentBounds.width;
    const scaleY = availHeight / currentBounds.height;
    const baseScale = Math.min(scaleX, scaleY);

    // Apply view transforms
    ctx.save();
    ctx.translate(
      rect.width / 2 + viewState.panX,
      rect.height / 2 + viewState.panY
    );
    ctx.scale(baseScale * viewState.zoom, baseScale * viewState.zoom);
    ctx.translate(-currentBounds.cx, -currentBounds.cy);

    // Draw paths - black on white for plotter preview
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.5 / viewState.zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const pathData of currentPaths) {
      drawPath(ctx, pathData);
    }

    ctx.restore();

    // Draw info overlay - semi-transparent background for readability
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(5, 5, 280, 75);

    ctx.fillStyle = '#333';
    ctx.font = '12px monospace';
    ctx.fillText(`Zoom: ${(viewState.zoom * 100).toFixed(0)}%`, 10, 20);
    ctx.fillText(`Paths: ${currentPaths.length}`, 10, 35);
    ctx.fillText(`Bounds: ${currentBounds.width.toFixed(1)} x ${currentBounds.height.toFixed(1)} mm`, 10, 50);
    ctx.fillText(`Scale: ${baseScale.toFixed(3)}`, 10, 65);
    ctx.restore();
  }

  /**
   * Draw a single path from d attribute string
   */
  function drawPath(ctx, pathData) {
    const d = pathData.d;
    if (!d) return;

    const path = new Path2D(d);
    ctx.stroke(path);
  }

  return {
    /**
     * Render new paths
     */
    render(paths, bounds) {
      console.log('Renderer.render() called with', paths.length, 'paths and bounds', bounds);
      currentPaths = paths;
      currentBounds = bounds;

      // Ensure canvas is properly sized before drawing
      resizeCanvas();
      draw();
    },

    /**
     * Update view state
     */
    updateView(state) {
      viewState = {
        zoom: state.zoom,
        panX: state.panX,
        panY: state.panY
      };
      draw();
    },

    /**
     * Clear canvas
     */
    clear() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      currentPaths = [];
      currentBounds = null;
    }
  };
}
