/**
 * Canvas renderer for SVG preview
 */

import { measurePathLength, samplePathPoints, lengthToWeight } from '../../../shared/geometry/path-utils.js';
import { AttractorSystem } from '../../../shared/fields/attractor.js';

export function initRenderer(canvas, store) {
  const ctx = canvas.getContext('2d');
  let currentPaths = [];
  let currentBounds = null;
  let viewState = { zoom: 1, panX: 0, panY: 0 };
  let attractors = [];
  let onAttractorClick = null;
  let onAttractorDrag = null;
  let onAttractorDragEnd = null;

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

  // Pan/zoom interaction and attractor dragging
  let isPanning = false;
  let isDraggingAttractor = false;
  let draggedAttractorIndex = -1;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener('mousedown', (e) => {
    const coords = screenToSVG(e.clientX, e.clientY);
    if (!coords) return;

    // Check if we should place an attractor (Ctrl/Cmd + Click)
    const isAttractorMode = e.ctrlKey || e.metaKey;
    const isRemoveMode = e.shiftKey;

    if ((isAttractorMode || isRemoveMode) && onAttractorClick) {
      onAttractorClick(coords.x, coords.y, isRemoveMode);
      return;
    }

    // Check if clicking on an existing attractor to drag it
    if (attractors && attractors.length > 0) {
      const attractorConfig = store ? store.getState('attractorConfig') : { falloffRadius: 50 };

      for (let i = attractors.length - 1; i >= 0; i--) {
        const attractor = attractors[i];
        const radius = attractor.radius || attractorConfig.falloffRadius;
        const dx = coords.x - attractor.x;
        const dy = coords.y - attractor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Check if clicking within attractor center (use reasonable radius for clicking)
        if (dist < Math.min(radius * 0.5, 25)) {
          isDraggingAttractor = true;
          draggedAttractorIndex = i;
          canvas.style.cursor = 'grabbing';
          return;
        }
      }
    }

    // Normal panning
    isPanning = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  canvas.addEventListener('mousemove', (e) => {
    const coords = screenToSVG(e.clientX, e.clientY);

    if (isDraggingAttractor && draggedAttractorIndex >= 0 && coords) {
      // Drag attractor
      const newAttractors = [...attractors];
      newAttractors[draggedAttractorIndex] = {
        ...newAttractors[draggedAttractorIndex],
        x: coords.x,
        y: coords.y
      };
      attractors = newAttractors;
      draw();

      // Notify parent through callback if available
      if (onAttractorDrag) {
        onAttractorDrag(draggedAttractorIndex, coords.x, coords.y);
      }
      return;
    }

    if (isPanning) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;

      viewState.panX += dx;
      viewState.panY += dy;

      lastX = e.clientX;
      lastY = e.clientY;

      draw();
      return;
    }

    // Update cursor based on hover
    if (attractors && attractors.length > 0 && coords) {
      const attractorConfig = store ? store.getState('attractorConfig') : { falloffRadius: 50 };
      let hovering = false;

      for (const attractor of attractors) {
        const radius = attractor.radius || attractorConfig.falloffRadius;
        const dx = coords.x - attractor.x;
        const dy = coords.y - attractor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < Math.min(radius * 0.5, 25)) {
          hovering = true;
          break;
        }
      }

      canvas.style.cursor = hovering ? 'grab' : (store && store.getState('useAttractors') ? 'crosshair' : 'grab');
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (isDraggingAttractor && draggedAttractorIndex >= 0) {
      // Finalize attractor drag
      if (onAttractorDragEnd) {
        onAttractorDragEnd(draggedAttractorIndex);
      }
    }

    isPanning = false;
    isDraggingAttractor = false;
    draggedAttractorIndex = -1;
    canvas.style.cursor = store && store.getState('useAttractors') ? 'crosshair' : 'grab';
  });

  canvas.addEventListener('mouseleave', () => {
    isPanning = false;
    isDraggingAttractor = false;
    draggedAttractorIndex = -1;
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
   * Convert screen coordinates to SVG coordinates
   */
  function screenToSVG(screenX, screenY) {
    if (!currentBounds) return null;

    const rect = canvas.getBoundingClientRect();
    const padding = 40;
    const availWidth = rect.width - padding * 2;
    const availHeight = rect.height - padding * 2;

    const scaleX = availWidth / currentBounds.width;
    const scaleY = availHeight / currentBounds.height;
    const baseScale = Math.min(scaleX, scaleY);
    const scale = baseScale * viewState.zoom;

    // Convert screen to canvas
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    // Reverse the transforms
    const centerX = rect.width / 2 + viewState.panX;
    const centerY = rect.height / 2 + viewState.panY;

    const svgX = (canvasX - centerX) / scale + currentBounds.cx;
    const svgY = (canvasY - centerY) / scale + currentBounds.cy;

    return { x: svgX, y: svgY };
  }

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

    // Draw attractors
    if (attractors && attractors.length > 0) {
      const attractorConfig = store ? store.getState('attractorConfig') : { falloffRadius: 50 };

      attractors.forEach((attractor, index) => {
        const radius = attractor.radius || attractorConfig.falloffRadius;
        const mode = attractor.mode || attractorConfig.mode || 'attract';

        // Draw influence radius with stronger stroke and higher opacity
        ctx.strokeStyle = mode === 'attract' ? 'rgba(74, 158, 255, 0.6)' : 'rgba(255, 100, 100, 0.6)';
        ctx.fillStyle = mode === 'attract' ? 'rgba(74, 158, 255, 0.15)' : 'rgba(255, 100, 100, 0.15)';
        ctx.lineWidth = 2 / viewState.zoom;

        ctx.beginPath();
        ctx.arc(attractor.x, attractor.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw center point
        ctx.fillStyle = mode === 'attract' ? 'rgba(74, 158, 255, 0.9)' : 'rgba(255, 100, 100, 0.9)';
        ctx.beginPath();
        ctx.arc(attractor.x, attractor.y, 4 / viewState.zoom, 0, Math.PI * 2);
        ctx.fill();

        // Draw index label with background for better visibility
        const labelX = attractor.x + 8 / viewState.zoom;
        const labelY = attractor.y - 8 / viewState.zoom;

        ctx.font = `bold ${14 / viewState.zoom}px sans-serif`;
        const label = `${index + 1}`;
        const metrics = ctx.measureText(label);
        const labelWidth = metrics.width;
        const labelHeight = 14 / viewState.zoom;

        // Label background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(
          labelX - 2 / viewState.zoom,
          labelY - labelHeight + 2 / viewState.zoom,
          labelWidth + 4 / viewState.zoom,
          labelHeight
        );

        // Label text
        ctx.fillStyle = mode === 'attract' ? '#4a9eff' : '#ff6464';
        ctx.fillText(label, labelX, labelY);
      });
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

  /**
   * Convert HSB color to RGB
   */
  function hsbToRgb(h, s, b) {
    h = h / 360;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = b * (1 - s);
    const q = b * (1 - f * s);
    const t = b * (1 - (1 - f) * s);

    let r, g, b_;
    switch (i % 6) {
      case 0: r = b; g = t; b_ = p; break;
      case 1: r = q; g = b; b_ = p; break;
      case 2: r = p; g = b; b_ = t; break;
      case 3: r = p; g = q; b_ = b; break;
      case 4: r = t; g = p; b_ = b; break;
      case 5: r = b; g = p; b_ = q; break;
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b_ * 255)
    };
  }

  /**
   * Map value from one range to another
   */
  function map(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
  }

  /**
   * Render fast preview with color-coded stroke widths
   */
  function drawFastPreview() {
    const rect = canvas.getBoundingClientRect();

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!currentBounds || currentPaths.length === 0) {
      console.log('Fast preview skipped - no bounds or paths');
      return;
    }

    console.log('Drawing fast preview for', currentPaths.length, 'paths');

    // Get config from store
    const config = store ? store.getState('config') : {};
    const useAttractors = store ? store.getState('useAttractors') : false;
    const attractorConfig = store ? store.getState('attractorConfig') : {};
    const storeAttractors = store ? store.getState('attractors') : [];

    const baseOffset = config.baseOffset || 0.25;
    const minPasses = config.minPasses || 1;
    const maxPasses = config.maxPasses || 10;
    const previewEmphasis = 2.0; // Make strokes more visible

    // Measure path lengths
    const lengths = currentPaths.map(p => measurePathLength(p.d));
    const minLength = (config.minLength && config.minLength > 0) ? config.minLength : Math.min(...lengths);
    const maxLength = (config.maxLength && config.maxLength > 0) ? config.maxLength : Math.max(...lengths);

    // Set up attractor system if needed
    let attractorSystem = null;
    if (useAttractors && storeAttractors.length > 0) {
      attractorSystem = new AttractorSystem();
      Object.assign(attractorSystem.config, {
        mode: attractorConfig.mode || 'attract',
        strength: attractorConfig.strength || 1.0,
        falloffRadius: attractorConfig.falloffRadius || 50,
        falloffCurve: attractorConfig.falloffCurve || 'linear',
        falloffExponent: attractorConfig.falloffExponent || 2,
        multiMode: attractorConfig.multiMode || 'additive',
        minPasses,
        maxPasses,
        minInfluenceThreshold: attractorConfig.minInfluenceThreshold || 0,
        minCoveragePercent: attractorConfig.minCoveragePercent || 0,
        influenceCalcMode: attractorConfig.influenceCalcMode || 'average'
      });

      storeAttractors.forEach(a => {
        attractorSystem.addAttractor(a.x, a.y, a.strength, a.radius);
      });
    }

    // Calculate transform
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

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw each path with color-coded weight
    currentPaths.forEach((pathData, i) => {
      const length = lengths[i];

      // Calculate weight (number of passes)
      let weight;
      if (attractorSystem) {
        // Sample points along path for influence calculation
        const pathPoints = samplePathPoints(pathData.d, attractorSystem.config.arcLengthSampleInterval || 5);
        weight = attractorSystem.calculatePathWeight(pathPoints, length);
      } else {
        weight = lengthToWeight(length, minPasses, maxPasses, minLength, maxLength, config.curve || 'linear');
      }

      // Map weight to color (HSB: 120=green for min, 0=red for max)
      const hue = map(weight, minPasses, maxPasses, 120, 0);
      const color = hsbToRgb(hue, 80, 60);
      ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;

      // Calculate visual stroke width based on approximate final thickness
      const approximateWidthMM = weight * baseOffset;
      const scaledWeight = (approximateWidthMM * previewEmphasis) / viewState.zoom;
      ctx.lineWidth = scaledWeight;

      // Draw the path
      const path = new Path2D(pathData.d);
      ctx.stroke(path);
    });

    // Draw attractors on top
    if (attractors && attractors.length > 0) {
      const attractorConfig = store ? store.getState('attractorConfig') : { falloffRadius: 50 };

      attractors.forEach((attractor, index) => {
        const radius = attractor.radius || attractorConfig.falloffRadius;
        const mode = attractor.mode || attractorConfig.mode || 'attract';

        ctx.strokeStyle = mode === 'attract' ? 'rgba(74, 158, 255, 0.6)' : 'rgba(255, 100, 100, 0.6)';
        ctx.fillStyle = mode === 'attract' ? 'rgba(74, 158, 255, 0.15)' : 'rgba(255, 100, 100, 0.15)';
        ctx.lineWidth = 2 / viewState.zoom;

        ctx.beginPath();
        ctx.arc(attractor.x, attractor.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = mode === 'attract' ? 'rgba(74, 158, 255, 0.9)' : 'rgba(255, 100, 100, 0.9)';
        ctx.beginPath();
        ctx.arc(attractor.x, attractor.y, 4 / viewState.zoom, 0, Math.PI * 2);
        ctx.fill();

        const labelX = attractor.x + 8 / viewState.zoom;
        const labelY = attractor.y - 8 / viewState.zoom;
        ctx.font = `bold ${14 / viewState.zoom}px sans-serif`;
        const label = `${index + 1}`;
        const metrics = ctx.measureText(label);
        const labelWidth = metrics.width;
        const labelHeight = 14 / viewState.zoom;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(
          labelX - 2 / viewState.zoom,
          labelY - labelHeight + 2 / viewState.zoom,
          labelWidth + 4 / viewState.zoom,
          labelHeight
        );

        ctx.fillStyle = mode === 'attract' ? '#4a9eff' : '#ff6464';
        ctx.fillText(label, labelX, labelY);
      });
    }

    ctx.restore();

    // Draw info overlay
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(5, 5, 280, 90);

    ctx.fillStyle = '#333';
    ctx.font = '12px monospace';
    ctx.fillText(`FAST PREVIEW MODE`, 10, 20);
    ctx.fillText(`Zoom: ${(viewState.zoom * 100).toFixed(0)}%`, 10, 35);
    ctx.fillText(`Paths: ${currentPaths.length}`, 10, 50);
    ctx.fillText(`Range: ${minPasses}-${maxPasses} passes`, 10, 65);
    ctx.fillText(`Green=min, Red=max`, 10, 80);
    ctx.restore();
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
     * Update attractors
     */
    updateAttractors(newAttractors) {
      attractors = newAttractors;
      draw();
    },

    /**
     * Set attractor click handler
     */
    setAttractorClickHandler(handler) {
      onAttractorClick = handler;
    },

    /**
     * Set attractor drag handlers
     */
    setAttractorDragHandlers(dragHandler, dragEndHandler) {
      onAttractorDrag = dragHandler;
      onAttractorDragEnd = dragEndHandler;
    },

    /**
     * Clear canvas
     */
    clear() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      currentPaths = [];
      currentBounds = null;
    },

    /**
     * Redraw (for external state changes)
     */
    redraw() {
      draw();
    },

    /**
     * Render fast preview (color-coded weight visualization)
     */
    renderFastPreview(paths, bounds) {
      console.log('Renderer.renderFastPreview() called with', paths.length, 'paths');
      currentPaths = paths;
      currentBounds = bounds;

      resizeCanvas();
      drawFastPreview();
    }
  };
}
