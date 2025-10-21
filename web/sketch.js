/**
 * P5.js sketch for attractor-based line weight control
 */

let svgParser;
let attractorSystem;
let svgData = null;
let svgRawData = null; // Raw SVG structure before processing

// Display settings
let canvasWidth = 800;
let canvasHeight = 600;
let zoomScale = 1;
let offsetX = 0;
let offsetY = 0;

// UI state
let showAttractors = true;
let showInfluence = true;
let previewMode = true;
let useAttractors = false; // Attractors disabled by default
let weightMode = 'length'; // 'length' or 'attractor'
let pathsProcessed = false; // Track if paths have been converted to points

// Offset mode state
let offsetMode = 'legacy'; // 'legacy' or 'normal'
let useNormalOffset = false; // Use normal-based offset
let envelopePreset = 'flat'; // Envelope preset name

// Drag state
let draggedAttractor = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Pan state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

// Processing settings
let baseOffset = 0.2;
let noise = 0.1;
let noiseFrequency = 50; // Noise wavelength in mm

// Render control
let needsRedraw = true;

function setup() {
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent('p5-container');

  // Initialize systems
  svgParser = new SVGParser();
  attractorSystem = new AttractorSystem();

  // Set rendering
  colorMode(HSB, 360, 100, 100); // Enable HSB for proper color gradients
  strokeWeight(1);
  noFill();

  // Disable continuous rendering - only redraw on demand
  noLoop();
}

function draw() {
  // Only render when needed
  if (!needsRedraw) {
    return;
  }
  needsRedraw = false;

  background(250);

  if (svgData) {
    push();
    translate(offsetX, offsetY);
    scale(zoomScale);

    // Draw influence field if enabled (attractor mode only)
    if (useAttractors && showInfluence && attractorSystem.attractors.length > 0) {
      drawInfluenceField();
    }

    // Draw paths with weight preview
    drawPaths();

    // Draw attractors if enabled (attractor mode only)
    if (useAttractors && showAttractors) {
      drawAttractors();
    }

    pop();
  } else {
    // Show prompt
    fill(150);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(16);
    text('Upload an SVG file to begin', width / 2, height / 2);
  }
}

/**
 * Draw SVG paths with optional weight preview
 */
function drawPaths() {
  svgData.paths.forEach(path => {
    let weight;

    if (useAttractors) {
      // Attractor-based weight
      weight = attractorSystem.calculatePathWeight(path.points);
    } else {
      // Length-based weight
      weight = calculateLengthBasedWeight(path.length);
    }

    if (previewMode) {
      // Color-code by weight (HSB: hue 120=green, 0=red)
      const hue = map(weight, attractorSystem.config.minPasses, attractorSystem.config.maxPasses, 120, 0);
      stroke(hue, 80, 60);
      // Wider stroke range for visibility, scaled by zoom
      const visualWeight = map(weight, attractorSystem.config.minPasses, attractorSystem.config.maxPasses, 0.5, 15);
      strokeWeight(visualWeight);
    } else {
      stroke(path.stroke || 0);
      strokeWeight(path.strokeWidth || 1);
    }

    // Draw path, handling subpath breaks (multiple M commands)
    noFill();
    beginShape();

    path.points.forEach((pt, index) => {
      // If this is a move command (not the first point), end current shape and start new one
      if (pt.move && index > 0) {
        endShape();
        beginShape();
      }
      vertex(pt.x, pt.y);
    });

    endShape();
  });
}

/**
 * Calculate weight based on path length
 */
function calculateLengthBasedWeight(pathLength) {
  if (!svgData || svgData.paths.length === 0) {
    return attractorSystem.config.minPasses;
  }

  // Find min/max lengths in current SVG
  const lengths = svgData.paths.map(p => p.length);
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);

  // Avoid division by zero
  if (maxLength === minLength) {
    return attractorSystem.config.minPasses;
  }

  // Normalize length to 0-1
  const normalized = (pathLength - minLength) / (maxLength - minLength);

  // Map to pass range
  const passes = Math.round(
    attractorSystem.config.minPasses + normalized * (attractorSystem.config.maxPasses - attractorSystem.config.minPasses)
  );

  return Math.max(attractorSystem.config.minPasses, Math.min(attractorSystem.config.maxPasses, passes));
}

/**
 * Draw attractors
 */
function drawAttractors() {
  attractorSystem.attractors.forEach(attractor => {
    const isDragging = draggedAttractor && draggedAttractor.id === attractor.id;

    // Falloff radius circle
    noFill();
    stroke(100, 150, 255, isDragging ? 100 : 50);
    strokeWeight(isDragging ? 2 : 1);
    circle(attractor.x, attractor.y, attractorSystem.config.falloffRadius * 2);

    // Attractor point
    fill(isDragging ? 255 : 100, 150, 255);
    noStroke();
    circle(attractor.x, attractor.y, isDragging ? 10 : 8);

    // Label
    fill(50);
    textAlign(CENTER, CENTER);
    textSize(10);
    text(`#${attractor.id}`, attractor.x, attractor.y - 15);
  });
}

/**
 * Draw influence field as a heatmap
 */
function drawInfluenceField() {
  const gridSize = 20;
  const bounds = svgData ? svgParser.getBounds() : { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  for (let x = bounds.minX; x < bounds.maxX; x += gridSize) {
    for (let y = bounds.minY; y < bounds.maxY; y += gridSize) {
      const influence = attractorSystem.calculateInfluenceAt(x, y);

      if (influence > 0.01) {
        const alpha = map(influence, 0, 1, 0, 100);
        const hue = attractorSystem.config.mode === 'attract' ? 200 : 0;
        fill(hue, 100, 100, alpha);
        noStroke();
        rect(x, y, gridSize, gridSize);
      }
    }
  }
}

/**
 * Handle mouse press - check if clicking on attractor or adding new one
 */
function mousePressed() {
  // Only handle mouse events if they're actually over the canvas
  // This prevents intercepting clicks on UI buttons outside the canvas
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
    return; // Click is outside canvas, ignore it
  }

  if (!svgData) return;

  // Right click or space+click = pan mode
  if (mouseButton === CENTER || (mouseButton === LEFT && keyIsDown(32))) {
    isPanning = true;
    panStartX = mouseX;
    panStartY = mouseY;
    cursor('grab');
    return;
  }

  if (!useAttractors) return;

  // Transform mouse coordinates to SVG space
  const svgX = (mouseX - offsetX) / zoomScale;
  const svgY = (mouseY - offsetY) / zoomScale;

  // Check if clicking on existing attractor
  for (let attractor of attractorSystem.attractors) {
    const dist = Math.sqrt((svgX - attractor.x) ** 2 + (svgY - attractor.y) ** 2);
    if (dist < 10 / zoomScale) { // Hit radius adjusted for zoom
      draggedAttractor = attractor;
      dragOffsetX = svgX - attractor.x;
      dragOffsetY = svgY - attractor.y;
      cursor('grabbing');
      return;
    }
  }

  // Not clicking on attractor - add new one
  attractorSystem.addAttractor(svgX, svgY);
  updateAttractorList();
  needsRedraw = true;
  redraw();
}

/**
 * Handle mouse drag - move attractor or pan canvas
 */
function mouseDragged() {
  // Allow dragging to continue even if mouse leaves canvas (for panning/dragging)
  // But only if we were already in a drag state
  if (!isPanning && !draggedAttractor) {
    // Not currently dragging, check if mouse is over canvas
    if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
      return;
    }
  }

  if (isPanning) {
    const dx = mouseX - panStartX;
    const dy = mouseY - panStartY;
    offsetX += dx;
    offsetY += dy;
    panStartX = mouseX;
    panStartY = mouseY;
    needsRedraw = true;
    redraw();
    return;
  }

  if (draggedAttractor && useAttractors && svgData) {
    const svgX = (mouseX - offsetX) / zoomScale;
    const svgY = (mouseY - offsetY) / zoomScale;

    draggedAttractor.x = svgX - dragOffsetX;
    draggedAttractor.y = svgY - dragOffsetY;

    updateAttractorList();
    needsRedraw = true;
    redraw();
  }
}

/**
 * Handle mouse release - stop dragging or panning
 */
function mouseReleased() {
  if (isPanning) {
    isPanning = false;
    cursor('default');
    needsRedraw = true;
    redraw();
  }

  if (draggedAttractor) {
    draggedAttractor = null;
    cursor('default');
    needsRedraw = true;
    redraw();
  }
}

/**
 * Handle mouse wheel - zoom in/out
 */
function mouseWheel(event) {
  if (!svgData) return false;

  // Get mouse position before zoom
  const mouseXBefore = (mouseX - offsetX) / zoomScale;
  const mouseYBefore = (mouseY - offsetY) / zoomScale;

  // Apply zoom (negative delta = zoom in, positive = zoom out)
  const zoomDelta = event.delta > 0 ? 0.9 : 1.1;
  zoomScale *= zoomDelta;

  // Clamp zoom level
  zoomScale = constrain(zoomScale, 0.1, 10);

  // Adjust offset to keep mouse position stable
  offsetX = mouseX - mouseXBefore * zoomScale;
  offsetY = mouseY - mouseYBefore * zoomScale;

  // Update status to show new zoom level
  const zoomPercent = Math.round(zoomScale * 100);
  updateStatus(`Processed ${svgData.paths.length} paths`);

  needsRedraw = true;
  redraw();

  // Prevent page scroll
  return false;
}

/**
 * Load SVG file (Stage 1: Quick preview)
 */
function loadSVGFile(file) {
  // Show loading indicator
  updateStatus('Loading SVG...');
  showLoadingSpinner(true);

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      // Stage 1: Quick parse to get path count
      svgRawData = svgParser.quickParseSVG(e.target.result);

      console.log(`SVG loaded: ${svgRawData.pathCount} paths found`);
      console.log('ViewBox:', svgRawData.viewBox);

      // Show path count and process button
      const svgInfo = document.getElementById('svg-info');
      const pathCountInfo = document.getElementById('path-count-info');
      if (svgInfo && pathCountInfo) {
        pathCountInfo.innerHTML = `<strong>${svgRawData.pathCount} paths</strong> found in SVG.<br>Click "Process Paths" to calculate lengths and preview.`;
        svgInfo.style.display = 'block';
      }

      updateStatus(`SVG loaded: ${svgRawData.pathCount} paths found (not yet processed)`);
      showLoadingSpinner(false);
      pathsProcessed = false;

    } catch (error) {
      console.error('Failed to load SVG:', error);
      console.error('Error stack:', error.stack);
      updateStatus('Error loading SVG');
      showLoadingSpinner(false);
    }
  };
  reader.readAsText(file);
}

/**
 * Process paths to points (Stage 2: Heavy operation)
 */
async function processPaths() {
  if (!svgRawData) {
    alert('No SVG loaded');
    return;
  }

  if (pathsProcessed) {
    console.log('Paths already processed');
    return;
  }

  // Show progress UI
  updateStatus('Processing paths to points...');
  showLoadingSpinner(false); // Hide spinner, use progress bar instead
  showProcessingProgress(true);

  const startTime = Date.now();
  const totalPaths = svgRawData.paths.length;

  try {
    // Process with progress callback
    svgData = await svgParser.processPathsToPoints(svgRawData.paths, (processed, total) => {
      const percent = Math.round((processed / total) * 100);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      updateProcessingProgress(processed, total, percent, elapsed);
    });

    console.log('SVG Data:', svgData);
    console.log('Bounds:', svgParser.getBounds());
    console.log('First few paths:', svgData.paths.slice(0, 3));

    // Calculate and display length range
    const lengths = svgData.paths.map(p => p.length).filter(l => l && !isNaN(l));
    if (lengths.length > 0) {
      const minLen = Math.min(...lengths);
      const maxLen = Math.max(...lengths);
      console.log(`Path length range: ${minLen.toFixed(1)} - ${maxLen.toFixed(1)}mm`);

      // Update UI hints
      const minInfo = document.getElementById('min-length-info');
      const maxInfo = document.getElementById('max-length-info');
      if (minInfo) minInfo.textContent = `(detected: ${minLen.toFixed(0)})`;
      if (maxInfo) maxInfo.textContent = `(detected: ${maxLen.toFixed(0)})`;
    }

    fitSVGToCanvas();
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    updateStatus(`Processed ${svgData.paths.length} paths in ${totalTime}s`);
    showProcessingProgress(false);
    pathsProcessed = true;

    // Hide process button
    const svgInfo = document.getElementById('svg-info');
    if (svgInfo) svgInfo.style.display = 'none';

    // Trigger redraw
    needsRedraw = true;
    redraw();
  } catch (error) {
    console.error('Failed to process paths:', error);
    console.error('Error stack:', error.stack);
    updateStatus('Error processing paths');
    showProcessingProgress(false);
  }
}

/**
 * Fit SVG to canvas with padding
 */
function fitSVGToCanvas() {
  if (!svgData) return;

  const bounds = svgParser.getBounds();
  const svgWidth = bounds.maxX - bounds.minX;
  const svgHeight = bounds.maxY - bounds.minY;

  const padding = 50;
  const scaleX = (canvasWidth - padding * 2) / svgWidth;
  const scaleY = (canvasHeight - padding * 2) / svgHeight;

  zoomScale = Math.min(scaleX, scaleY);
  offsetX = padding - bounds.minX * zoomScale;
  offsetY = padding - bounds.minY * zoomScale;
}

/**
 * Clear SVG
 */
function clearSVG() {
  svgData = null;
  svgRawData = null;
  pathsProcessed = false;
  attractorSystem.clearAll();
  updateAttractorList();
  updateStatus('SVG cleared');

  // Hide process button
  const svgInfo = document.getElementById('svg-info');
  if (svgInfo) svgInfo.style.display = 'none';

  needsRedraw = true;
  redraw();
}

/**
 * Update status message
 */
function updateStatus(message) {
  const statusEl = document.getElementById('canvas-status');
  if (statusEl) {
    // Add zoom level if SVG is loaded
    if (svgData && pathsProcessed) {
      const zoomPercent = Math.round(zoomScale * 100);
      statusEl.textContent = `${message} | Zoom: ${zoomPercent}% (scroll to zoom, space+drag to pan)`;
    } else {
      statusEl.textContent = message;
    }
  }
}

/**
 * Update attractor list in UI
 */
function updateAttractorList() {
  const listEl = document.getElementById('attractor-list');
  if (!listEl) return;

  if (attractorSystem.attractors.length === 0) {
    listEl.innerHTML = '<p style="color: #999; font-style: italic;">No attractors</p>';
    return;
  }

  listEl.innerHTML = attractorSystem.attractors.map(a => `
    <div class="attractor-item">
      <span>#${a.id}: (${a.x.toFixed(1)}, ${a.y.toFixed(1)})</span>
      <button onclick="removeAttractor(${a.id})">Remove</button>
    </div>
  `).join('');
}

/**
 * Remove attractor by ID (called from HTML)
 */
function removeAttractor(id) {
  attractorSystem.removeAttractor(id);
  updateAttractorList();
  needsRedraw = true;
  redraw();
}

/**
 * Show/hide loading spinner
 */
function showLoadingSpinner(show) {
  const spinner = document.getElementById('loading-spinner');
  if (spinner) {
    spinner.style.display = show ? 'flex' : 'none';
  }
}

/**
 * Show/hide processing progress bar
 */
function showProcessingProgress(show) {
  const progress = document.getElementById('processing-progress');
  if (progress) {
    progress.style.display = show ? 'flex' : 'none';
  }
}

/**
 * Update processing progress
 */
function updateProcessingProgress(processed, total, percent, elapsed) {
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const progressTime = document.getElementById('progress-time');

  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }

  if (progressText) {
    progressText.textContent = `Processing ${processed}/${total} paths (${percent}%)`;
  }

  if (progressTime) {
    progressTime.textContent = `Elapsed: ${elapsed}s`;
  }
}
