/**
 * P5.js sketch for attractor-based line weight control
 */

let svgParser;
let attractorSystem;
let svgData = null;
let svgRawData = null; // Raw SVG structure before processing
let originalFilename = null; // Store original filename for export

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
let previewDisplayMode = 'weight'; // 'weight' or 'offset'
let useAttractors = false; // Attractors disabled by default
let weightMode = 'length'; // 'length' or 'attractor'
let pathsProcessed = false; // Track if paths have been converted to points
let livePreview = true; // Auto-reprocess on attractor changes

// Offset mode state
let offsetMode = 'normal'; // 'legacy' or 'normal'
let useNormalOffset = true; // Use normal-based offset
let envelopePreset = 'sinTaperBoth'; // Envelope preset name

// Fill mode state
let fillMode = 'offset'; // 'offset', 'crosshatch', 'stippling', or 'hatch-gradient'
let hatchAngles = [45, -45]; // Crosshatch angles in degrees
let hatchSpacing = 1; // Spacing between hatch lines in mm

// Stippling state
let dotSpacing = 1.5; // Distance between dots in mm
let dotSize = 0.3; // Radius of each dot in mm

// Hatch gradient state
let lightMode = 'directional'; // 'directional' or 'point'
let lightAngle = 45; // Light direction in degrees (directional mode)
let lightPosX = 25; // Light X position in % (point mode)
let lightPosY = 25; // Light Y position in % (point mode)
let falloffRadius = 100; // Light falloff radius in mm (point mode)
let lightStrength = 0.8; // Light influence strength
let gradientBaseWeight = 0.2; // Minimum density weight
let shadowSoftness = 0.5; // Easing factor for smooth transitions
let gradientHatchAngles = [0, 45, 90]; // Gradient hatch angles
let gradientHatchSpacing = 1; // Base spacing for gradient hatches

// Organic crosshatch state
let organicHatchEnabled = false;
let hatchWiggle = 0.5;
let wiggleFrequency = 20;
let angleJitter = 5;
let lengthJitter = 0.1;
let positionJitter = 0.2;
let spacingJitter = 0.2;

// Drag state
let draggedAttractor = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Pan state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

// Focus window state
let focusModeEnabled = false;
let focusWindow = null; // {x1, y1, x2, y2} in SVG coordinates
let showFocusDetail = false;
let isDraggingFocus = false;
let focusDragStart = null; // {x, y} in SVG coordinates

// Focus window offset cache
let offsetCache = new Map(); // Key: pathId+passes+settings -> value: Array of offset path arrays
let focusPathsCache = null; // Cache of paths in current focus window
let isComputingFocus = false;
let focusComputeProgress = 0;
let lastFocusWindow = null;
let lastOffsetSettings = null;

// Weight cache for attractor performance
let weightsNeedRecalculation = true;

// Processing settings
let baseOffset = 0.25;
let noise = 0.0;
let noiseFrequency = 50; // Noise wavelength in mm

// Preview settings
let previewEmphasis = 1.0; // Multiplier for preview line width (0.5-2.0)

// Export settings
let addOutlineStroke = false; // Add outline strokes in export

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

    // Draw focus window if enabled
    if (focusModeEnabled && focusWindow) {
      drawFocusWindow();
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
 * Check if a bounding box intersects with the focus window
 */
function boundsIntersectFocus(bounds) {
  if (!focusWindow || !bounds) return false;

  return !(bounds.maxX < focusWindow.x1 ||
           bounds.minX > focusWindow.x2 ||
           bounds.maxY < focusWindow.y1 ||
           bounds.minY > focusWindow.y2);
}

/**
 * Draw SVG paths with optional weight preview or offset rendering
 * With focus window support for selective high-res rendering
 */
function drawPaths() {
  // If focus window is enabled and we have a focus region defined
  if (focusModeEnabled && focusWindow && showFocusDetail) {
    // Render with focus window: fast preview outside, high-res inside
    renderWithFocusWindow();
  } else if (previewDisplayMode === 'curvature') {
    // Curvature-based color preview (diagnostic)
    renderCurvaturePreview();
  } else if (previewDisplayMode === 'offset') {
    // Render actual offset paths for all
    renderOffsetPreview();
  } else {
    // Weight-only preview (fast) for all
    renderWeightPreview();
  }
}

/**
 * Render weight preview (color-coded, fast)
 */
function renderWeightPreview() {
  svgData.paths.forEach(path => {
    // Use cached weight if available, otherwise calculate
    let weight;
    if (path.cachedWeight !== undefined) {
      weight = path.cachedWeight;
    } else {
      if (useAttractors) {
        // Attractor-based weight - prefer path data string for arc-length sampling
        weight = attractorSystem.calculatePathWeight(path.d || path.points, path.length);
      } else {
        // Length-based weight (pass path object for curvature)
        weight = calculateLengthBasedWeight(path.length, path);
      }
      path.cachedWeight = weight; // Cache for next time
    }

    if (previewMode) {
      // Color-code by weight (HSB: hue 120=green, 0=red)
      const hue = map(weight, attractorSystem.config.minPasses, attractorSystem.config.maxPasses, 120, 0);
      stroke(hue, 80, 60);
      // Calculate visual width based on actual output dimensions (weight × baseOffset)
      // This makes the preview representative of the final result
      const approximateWidthMM = weight * baseOffset;
      const scaledWeight = (approximateWidthMM * previewEmphasis) / zoomScale;
      strokeWeight(scaledWeight);
    } else {
      stroke(path.stroke || 0);
      strokeWeight((path.strokeWidth || 1) / zoomScale);
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
 * Render curvature preview (color-coded by curvature score)
 */
function renderCurvaturePreview() {
  svgData.paths.forEach(path => {
    // Get curvature score (0-1, where 1 = highest curvature)
    const curvatureScore = path.curvatureScore || 0;

    // Color-code by curvature:
    // Blue (hue 240) = low curvature (straight)
    // Red (hue 0) = high curvature (tight curves)
    const hue = map(curvatureScore, 0, 1, 240, 0);
    const saturation = curvatureScore > 0 ? 80 : 20; // Desaturate paths with no curvature
    stroke(hue, saturation, 70);

    // Use fixed stroke weight for visibility
    strokeWeight(2 / zoomScale);

    // Draw path
    noFill();
    beginShape();
    path.points.forEach((pt, index) => {
      if (pt.move && index > 0) {
        endShape();
        beginShape();
      }
      vertex(pt.x, pt.y);
    });
    endShape();
  });

  // Draw legend in top-right corner
  push();
  resetMatrix(); // Draw in screen space, not SVG space
  const legendX = width - 150;
  const legendY = 20;
  const legendWidth = 130;
  const legendHeight = 80;

  // Background
  fill(255, 255, 255, 200);
  stroke(100);
  strokeWeight(1);
  rect(legendX, legendY, legendWidth, legendHeight, 4);

  // Title
  noStroke();
  fill(0);
  textAlign(LEFT, TOP);
  textSize(12);
  text('Curvature Preview', legendX + 10, legendY + 8);

  // Gradient bar
  const barX = legendX + 10;
  const barY = legendY + 30;
  const barWidth = legendWidth - 20;
  const barHeight = 15;

  for (let i = 0; i < barWidth; i++) {
    const t = i / barWidth;
    const hue = map(t, 0, 1, 240, 0); // Blue to red
    stroke(hue, 80, 70);
    line(barX + i, barY, barX + i, barY + barHeight);
  }

  // Labels
  noStroke();
  fill(0);
  textSize(10);
  textAlign(LEFT, TOP);
  text('Straight', barX, barY + barHeight + 3);
  textAlign(RIGHT, TOP);
  text('Curved', barX + barWidth, barY + barHeight + 3);

  pop();
}

/**
 * Render actual offset paths (accurate but slower)
 */
function renderOffsetPreview() {
  stroke(100); // Gray color
  strokeWeight(0.5 / zoomScale); // Scale stroke weight by zoom
  noFill();

  svgData.paths.forEach((path, pathIndex) => {
    // Use cached weight if available, otherwise calculate
    let weight;
    if (path.cachedWeight !== undefined) {
      weight = path.cachedWeight;
    } else {
      if (useAttractors) {
        weight = attractorSystem.calculatePathWeight(path.d || path.points, path.length);
      } else {
        weight = calculateLengthBasedWeight(path.length, path);
      }
      path.cachedWeight = weight; // Cache for next time
    }

    // Generate deterministic seed
    const seed = hashString(path.d);

    // Get envelope function if using normal mode
    const envelope = useNormalOffset ? getEnvelopePreset(envelopePreset) : null;

    // Route to crosshatch, stippling, or offset fill
    if (fillMode === 'crosshatch') {
      // Crosshatch fill
      const baseWidth = baseOffset * Math.max(1, weight);

      // Build organic options
      const organicOptions = {
        enabled: organicHatchEnabled,
        wiggle: hatchWiggle,
        wiggleFreq: wiggleFrequency,
        angleJitter: angleJitter,
        lengthJitter: lengthJitter,
        positionJitter: positionJitter,
        spacingJitter: spacingJitter
      };

      const hatchPaths = generateCrosshatchFill(path.d, baseWidth, hatchAngles, hatchSpacing, noise, seed, path.id, envelope, noiseFrequency, organicOptions);

      hatchPaths.forEach(hatchPath => {
        // Parse and render hatch line (can be straight or wiggly polyline)
        const pathParts = hatchPath.split(/\s+/);
        if (pathParts.length >= 4 && pathParts[0] === 'M') {
          // Draw polyline
          beginShape();
          for (let i = 1; i < pathParts.length; i += 3) {
            if (pathParts[i - 1] === 'M' || pathParts[i - 1] === 'L') {
              const x = parseFloat(pathParts[i]);
              const y = parseFloat(pathParts[i + 1]);
              vertex(x, y);
            }
          }
          endShape();
        }
      });
    } else if (fillMode === 'stippling') {
      // Stippling fill
      const baseWidth = baseOffset * Math.max(1, weight);
      // For preview, use default sampleRate of 2mm (parameter default)
      const dots = generateStipplingFill(path.d, baseWidth, dotSpacing, dotSize, seed, path.id, envelope, 2, false);

      // Draw dots as circles
      fill(100); // Gray fill for dots
      noStroke();
      dots.forEach(dot => {
        circle(dot.x, dot.y, dot.r * 2); // p5.js circle uses diameter
      });

      // Reset to no fill for other drawing
      noFill();
      stroke(100);
      strokeWeight(0.5 / zoomScale);
    } else if (fillMode === 'hatch-gradient') {
      // Hatch gradient fill
      const baseWidth = baseOffset * Math.max(1, weight);

      // Build organic options (can be extended later if needed)
      const organicOptions = {
        enabled: false // Not implemented for gradient yet, but ready for future
      };

      // Convert light position from % to user units for point mode
      const lightX = svgData ? (lightPosX / 100) * svgData.viewBox.width : 0;
      const lightY = svgData ? (lightPosY / 100) * svgData.viewBox.height : 0;

      const hatchPaths = generateHatchGradientFill(
        path.d, baseWidth, gradientHatchAngles, gradientHatchSpacing,
        lightAngle, lightStrength, gradientBaseWeight, shadowSoftness,
        noise, seed, path.id, envelope, noiseFrequency, organicOptions, false,
        lightMode, lightX, lightY, falloffRadius
      );

      hatchPaths.forEach(hatchPath => {
        // Parse and render hatch line
        const pathParts = hatchPath.split(/\s+/);
        if (pathParts.length >= 4 && pathParts[0] === 'M') {
          // Draw polyline
          beginShape();
          for (let i = 1; i < pathParts.length; i += 3) {
            if (pathParts[i - 1] === 'M' || pathParts[i - 1] === 'L') {
              const x = parseFloat(pathParts[i]);
              const y = parseFloat(pathParts[i + 1]);
              vertex(x, y);
            }
          }
          endShape();
        }
      });
    } else {
      // Offset fill (existing code)
      const maxPreviewPasses = Math.min(weight, 10); // Cap at 10 for performance

      for (let i = 0; i < maxPreviewPasses; i++) {
        const passIndex = Math.floor(i / 2) + 1;
        const isRight = i % 2 === 0;
        const direction = isRight ? 1 : -1;
        const offsetDistance = direction * passIndex * baseOffset;
        const passSeed = seed + i;

        let offsetPoints;

        if (useNormalOffset) {
          // Normal mode: use path data string
          offsetPoints = generateOffsetPath(path.d, offsetDistance, noise, passSeed, path.id, envelope, true, noiseFrequency);
        } else {
          // Legacy mode: use points (low quality for speed)
          const sampledPoints = path.points.filter((_, idx) => idx % 3 === 0); // Subsample for speed
          offsetPoints = generateOffsetPath(sampledPoints, offsetDistance, noise, passSeed, path.id, null, false);
        }

        if (offsetPoints && offsetPoints.length > 0) {
          beginShape();
          offsetPoints.forEach((pt, idx) => {
            if (pt.move && idx > 0) {
              endShape();
              beginShape();
            }
            vertex(pt.x, pt.y);
          });
          endShape();
        }
      }
    }
  });
}

/**
 * Calculate weight based on path length with configurable mapping curves
 * Optionally blends with curvature-based adjustment
 * @param {number} pathLength - Length of the path in mm
 * @param {Object} path - Optional path object with curvatureScore property
 * @returns {number} Number of passes (clamped to min/max range)
 */
function calculateLengthBasedWeight(pathLength, path = null) {
  if (!svgData || svgData.paths.length === 0) {
    return attractorSystem.config.minPasses;
  }

  // Find min/max lengths in current SVG
  const lengths = svgData.paths.map(p => p.length);

  // Apply manual overrides if set
  let minLength = attractorSystem.config.minLengthOverride !== null
    ? attractorSystem.config.minLengthOverride
    : Math.min(...lengths);
  let maxLength = attractorSystem.config.maxLengthOverride !== null
    ? attractorSystem.config.maxLengthOverride
    : Math.max(...lengths);

  // Apply percentile clamping if configured
  if (attractorSystem.config.lengthMappingCurve === 'percentile' &&
      attractorSystem.config.lengthPercentileClamp < 100) {
    const sortedLengths = [...lengths].sort((a, b) => a - b);
    const percentileIndex = Math.floor((attractorSystem.config.lengthPercentileClamp / 100) * (sortedLengths.length - 1));
    maxLength = sortedLengths[percentileIndex];
  }

  // Clamp path length to range
  const clampedLength = Math.max(minLength, Math.min(maxLength, pathLength));

  // Avoid division by zero
  if (maxLength === minLength) {
    return attractorSystem.config.minPasses;
  }

  // Normalize length to 0-1 using selected curve
  let normalized;
  const curve = attractorSystem.config.lengthMappingCurve;

  switch (curve) {
    case 'logarithmic':
      // Logarithmic mapping - compresses high values
      const logMin = Math.log(Math.max(minLength, 0.1)); // Avoid log(0)
      const logMax = Math.log(maxLength);
      const logLength = Math.log(Math.max(clampedLength, 0.1));
      normalized = (logLength - logMin) / (logMax - logMin);
      break;

    case 'power':
      // Power curve - adjustable bias
      const linearNorm = (clampedLength - minLength) / (maxLength - minLength);
      normalized = Math.pow(linearNorm, attractorSystem.config.lengthMappingExponent);
      break;

    case 'percentile':
      // Percentile already handled above, use linear mapping
      normalized = (clampedLength - minLength) / (maxLength - minLength);
      break;

    case 'linear':
    default:
      // Linear mapping
      normalized = (clampedLength - minLength) / (maxLength - minLength);
      break;
  }

  // Map to pass range (base calculation)
  let passes = Math.round(
    attractorSystem.config.minPasses + normalized * (attractorSystem.config.maxPasses - attractorSystem.config.minPasses)
  );

  // Apply curvature influence if enabled and available
  const curvatureInfluence = attractorSystem.config.curvatureInfluence || 0;
  if (curvatureInfluence > 0 && path && path.curvatureScore !== undefined && path.curvatureScore > 0) {
    // High curvature → reduce passes (thinner lines in tight curves)
    // curvatureScore is [0, 1] where 1 = highest curvature
    // Blend: passes = basePasses * (1 - influence * curvature)
    const curvatureMultiplier = 1 - (curvatureInfluence * path.curvatureScore);
    passes = Math.round(passes * curvatureMultiplier);
  }

  return Math.max(attractorSystem.config.minPasses, Math.min(attractorSystem.config.maxPasses, passes));
}

/**
 * Render with focus window: fast preview outside, cached high-res inside
 */
function renderWithFocusWindow() {
  svgData.paths.forEach((path) => {
    const inFocus = boundsIntersectFocus(path.bounds);

    if (inFocus && showFocusDetail && offsetCache.has(path.d)) {
      // Inside focus window: render cached offset detail
      renderCachedOffsets(path);
    } else {
      // Outside focus window OR no cache: fast weight preview
      renderPathWeightOnly(path);
    }
  });

  // Show "computing" message if in progress
  if (isComputingFocus && focusWindow) {
    push();
    fill(0);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(14 / zoomScale);
    const centerX = (focusWindow.x1 + focusWindow.x2) / 2;
    const centerY = (focusWindow.y1 + focusWindow.y2) / 2;
    text(`Computing: ${focusComputeProgress}%`, centerX, centerY);
    pop();
  }
}

/**
 * Render a single path with weight-based color only (fast)
 */
function renderPathWeightOnly(path) {
  // Use cached weight if available, otherwise calculate
  let weight;
  if (path.cachedWeight !== undefined) {
    weight = path.cachedWeight;
  } else {
    if (useAttractors) {
      weight = attractorSystem.calculatePathWeight(path.d || path.points, path.length);
    } else {
      weight = calculateLengthBasedWeight(path.length, path);
    }
    path.cachedWeight = weight; // Cache for next time
  }

  // Color-code by weight (HSB: hue 120=green, 0=red)
  const hue = map(weight, attractorSystem.config.minPasses, attractorSystem.config.maxPasses, 120, 0);
  stroke(hue, 80, 60);
  // Calculate visual width based on actual output dimensions (weight × baseOffset)
  const approximateWidthMM = weight * baseOffset;
  const scaledWeight = (approximateWidthMM * previewEmphasis) / zoomScale;
  strokeWeight(scaledWeight);

  // Draw path
  noFill();
  beginShape();
  path.points.forEach((pt, index) => {
    if (pt.move && index > 0) {
      endShape();
      beginShape();
    }
    vertex(pt.x, pt.y);
  });
  endShape();
}

/**
 * Render cached offset paths (fast, from pre-computed data)
 */
function renderCachedOffsets(path) {
  const cachedOffsets = offsetCache.get(path.d);
  if (!cachedOffsets) {
    console.warn('No cache found for path, falling back to weight preview');
    renderPathWeightOnly(path);
    return;
  }

  // Render each cached offset path
  stroke(100);
  strokeWeight(0.5 / zoomScale);
  noFill();

  cachedOffsets.forEach(offsetPoints => {
    if (offsetPoints && offsetPoints.length > 0) {
      beginShape();
      offsetPoints.forEach(pt => vertex(pt.x, pt.y));
      endShape();
    }
  });
}

/**
 * Compute high-resolution offsets for paths in focus window (async)
 */
async function computeFocusOffsets() {
  if (!focusWindow || !svgData) {
    console.warn('Cannot compute focus offsets: no focus window or SVG data');
    return;
  }

  isComputingFocus = true;
  focusComputeProgress = 0;

  // Update UI
  document.getElementById('compute-focus').style.display = 'none';
  document.getElementById('focus-progress').style.display = 'block';

  // Find paths in focus window
  const pathsInFocus = svgData.paths.filter(path => boundsIntersectFocus(path.bounds));
  console.log(`Computing offsets for ${pathsInFocus.length} paths in focus window...`);

  // Get current settings
  const currentSettings = {
    baseOffset,
    noise,
    noiseFrequency,
    offsetMode,
    envelopePreset
  };

  // Store for dirty tracking
  lastFocusWindow = { ...focusWindow };
  lastOffsetSettings = { ...currentSettings };

  // Clear old cache
  offsetCache.clear();

  const envelope = useNormalOffset ? getEnvelopePreset(envelopePreset) : null;

  // Process in chunks to avoid blocking
  const chunkSize = 5;
  let processed = 0;

  for (let i = 0; i < pathsInFocus.length; i += chunkSize) {
    const chunk = pathsInFocus.slice(i, Math.min(i + chunkSize, pathsInFocus.length));

    // Process chunk
    chunk.forEach(path => {
      // Use cached weight if available, otherwise calculate
      let weight;
      if (path.cachedWeight !== undefined) {
        weight = path.cachedWeight;
      } else {
        if (useAttractors) {
          weight = attractorSystem.calculatePathWeight(path.d || path.points, path.length);
        } else {
          weight = calculateLengthBasedWeight(path.length, path);
        }
        path.cachedWeight = weight; // Cache for next time
      }

      // Generate deterministic seed
      const seed = hashString(path.d);

      // Generate all offset paths for this path
      const offsetPaths = [];

      for (let j = 0; j < weight; j++) {
        const passIndex = Math.floor(j / 2) + 1;
        const isRight = j % 2 === 0;
        const direction = isRight ? 1 : -1;
        const offsetDistance = direction * passIndex * currentSettings.baseOffset;
        const passSeed = seed + j;

        let offsetPoints;
        if (useNormalOffset) {
          offsetPoints = generateOffsetPath(path.d, offsetDistance, currentSettings.noise, passSeed, path.d, envelope, true, currentSettings.noiseFrequency);
        } else {
          offsetPoints = generateOffsetPath(path.points, offsetDistance, currentSettings.noise, passSeed, path.d, null, false);
        }

        if (offsetPoints) {
          offsetPaths.push(offsetPoints);
        }
      }

      // Cache the offset paths using path data string as key
      offsetCache.set(path.d, offsetPaths);
      console.log(`Cached path (${path.d.substring(0, 20)}...): ${offsetPaths.length} offset paths`);
    });

    processed += chunk.length;
    focusComputeProgress = Math.round((processed / pathsInFocus.length) * 100);

    // Update progress bar
    document.getElementById('focus-progress-bar').style.width = `${focusComputeProgress}%`;
    document.getElementById('focus-progress-text').textContent = `${focusComputeProgress}% (${processed}/${pathsInFocus.length} paths)`;

    needsRedraw = true;
    redraw();

    // Yield to UI thread
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  isComputingFocus = false;
  console.log(`✓ Computed offsets for ${pathsInFocus.length} paths`);
  console.log(`✓ Cache size: ${offsetCache.size} entries`);
  console.log(`✓ Cache keys (first 3):`, Array.from(offsetCache.keys()).slice(0, 3).map(k => k.substring(0, 30) + '...'));

  // Update UI
  document.getElementById('focus-progress').style.display = 'none';
  document.getElementById('show-detail-label').style.display = 'block';
  document.getElementById('show-focus-detail').checked = true;
  showFocusDetail = true;

  needsRedraw = true;
  redraw();
}

/**
 * Draw attractors
 */
function drawAttractors() {
  attractorSystem.attractors.forEach(attractor => {
    const isDragging = draggedAttractor && draggedAttractor.id === attractor.id;
    const radius = attractor.radius !== null ? attractor.radius : attractorSystem.config.falloffRadius;
    const hasCustom = attractor.strength !== null || attractor.radius !== null;

    // Falloff radius circle
    noFill();
    stroke(hasCustom ? 255 : 100, 150, 255, isDragging ? 100 : 50);
    strokeWeight(isDragging ? 2 : 1);
    circle(attractor.x, attractor.y, radius * 2);

    // Attractor point
    fill(isDragging ? 255 : (hasCustom ? 255 : 100), 150, 255);
    noStroke();
    circle(attractor.x, attractor.y, isDragging ? 10 : 8);

    // Label
    fill(50);
    textAlign(CENTER, CENTER);
    textSize(10);
    const label = hasCustom ? `#${attractor.id}★` : `#${attractor.id}`;
    text(label, attractor.x, attractor.y - radius - 10);
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
 * Draw focus window rectangle
 */
function drawFocusWindow() {
  if (!focusWindow) return;

  // Draw just the border (no fill) so paths underneath are visible
  noFill();
  stroke(200, 80, 80); // HSB: bright blue border
  strokeWeight(3 / zoomScale);

  // Draw dashed rectangle effect by drawing the border in segments
  const x1 = focusWindow.x1;
  const y1 = focusWindow.y1;
  const x2 = focusWindow.x2;
  const y2 = focusWindow.y2;

  // Solid border
  rect(x1, y1, x2 - x1, y2 - y1);

  // Draw corner handles for visibility
  stroke(200, 100, 100);
  strokeWeight(2 / zoomScale);
  const handleSize = 15 / zoomScale;

  // Top-left corner
  line(x1, y1, x1 + handleSize, y1);
  line(x1, y1, x1, y1 + handleSize);

  // Top-right corner
  line(x2, y1, x2 - handleSize, y1);
  line(x2, y1, x2, y1 + handleSize);

  // Bottom-left corner
  line(x1, y2, x1 + handleSize, y2);
  line(x1, y2, x1, y2 - handleSize);

  // Bottom-right corner
  line(x2, y2, x2 - handleSize, y2);
  line(x2, y2, x2, y2 - handleSize);
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

  // Transform mouse coordinates to SVG space
  const svgX = (mouseX - offsetX) / zoomScale;
  const svgY = (mouseY - offsetY) / zoomScale;

  // Shift+click = start focus window drag
  if (focusModeEnabled && keyIsDown(SHIFT)) {
    isDraggingFocus = true;
    focusDragStart = { x: svgX, y: svgY };
    cursor('crosshair');
    return;
  }

  // Right click or space+click = pan mode
  if (mouseButton === CENTER || (mouseButton === LEFT && keyIsDown(32))) {
    isPanning = true;
    panStartX = mouseX;
    panStartY = mouseY;
    cursor('grab');
    return;
  }

  if (!useAttractors) return;

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
  if (livePreview) {
    needsRedraw = true;
    redraw();
  }
}

/**
 * Handle mouse drag - move attractor or pan canvas
 */
function mouseDragged() {
  // Allow dragging to continue even if mouse leaves canvas (for panning/dragging)
  // But only if we were already in a drag state
  if (!isPanning && !draggedAttractor && !isDraggingFocus) {
    // Not currently dragging, check if mouse is over canvas
    if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
      return;
    }
  }

  // Focus window drag
  if (isDraggingFocus && focusDragStart) {
    const svgX = (mouseX - offsetX) / zoomScale;
    const svgY = (mouseY - offsetY) / zoomScale;

    // Update focus window
    focusWindow = {
      x1: Math.min(focusDragStart.x, svgX),
      y1: Math.min(focusDragStart.y, svgY),
      x2: Math.max(focusDragStart.x, svgX),
      y2: Math.max(focusDragStart.y, svgY)
    };

    needsRedraw = true;
    redraw();
    return;
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
    if (livePreview) {
      needsRedraw = true;
      redraw();
    }
  }
}

/**
 * Handle mouse release - stop dragging or panning
 */
function mouseReleased() {
  if (isDraggingFocus) {
    isDraggingFocus = false;
    focusDragStart = null;
    cursor('default');

    // Show compute button when focus rectangle is drawn
    if (focusWindow) {
      const computeBtn = document.getElementById('compute-focus');
      if (computeBtn) computeBtn.style.display = 'block';
    }

    needsRedraw = true;
    redraw();
  }

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
  // Store original filename for export
  originalFilename = file.name.replace(/\.svg$/i, ''); // Remove .svg extension

  // Reset curvature calculation flag for new file
  curvatureCalculated = false;
  isCalculatingCurvature = false;

  // Reset export button state
  resetExportButton();

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

// Track whether curvature has been calculated
let curvatureCalculated = false;
let isCalculatingCurvature = false;

/**
 * Calculate curvature scores for all paths asynchronously
 * Uses FAST point-based calculation (no path re-parsing!)
 * @param {Array} paths - Array of path objects with .points property
 * @param {Function} progressCallback - Called with (processed, total)
 */
async function calculateCurvatureScoresAsync(paths, progressCallback) {
  const chunkSize = 25; // Smaller chunks for smoother progress updates
  const totalPaths = paths.length;
  const sampleStride = 5; // Process every 5th point for speed

  for (let i = 0; i < totalPaths; i += chunkSize) {
    const chunkEnd = Math.min(i + chunkSize, totalPaths);
    const chunk = paths.slice(i, chunkEnd);

    // Process chunk - use FAST point-based calculation
    chunk.forEach(path => {
      if (path.points && path.points.length > 0 && typeof calculatePathCurvatureFast === 'function') {
        // Use pre-sampled points (100x faster than re-parsing!)
        path.curvatureRaw = calculatePathCurvatureFast(path.points, sampleStride);
      } else {
        path.curvatureRaw = 0;
      }
    });

    // Update progress
    if (progressCallback) {
      progressCallback(chunkEnd, totalPaths);
    }

    // Yield to UI thread every chunk
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * Ensure curvature scores are calculated (lazy initialization)
 * Call this before using curvature data
 */
async function ensureCurvatureCalculated() {
  if (curvatureCalculated || isCalculatingCurvature || !svgData || !svgData.paths) {
    return;
  }

  isCalculatingCurvature = true;
  console.log('Calculating curvature scores on-demand...');
  updateStatus('Calculating curvature scores... (this is a one-time operation)');

  const startTime = Date.now();

  await calculateCurvatureScoresAsync(svgData.paths, (processed, total) => {
    const percent = Math.round((processed / total) * 100);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Curvature: ${percent}% (${processed}/${total}) - ${elapsed}s`);
    updateStatus(`Calculating curvature: ${percent}% (${processed}/${total} paths, ${elapsed}s)`);
  });

  // Normalize curvature scores across all paths
  if (typeof normalizeCurvatureScores === 'function') {
    normalizeCurvatureScores(svgData.paths);

    // Log curvature statistics
    const curvatures = svgData.paths.map(p => p.curvatureScore || 0).filter(c => c > 0);
    if (curvatures.length > 0) {
      const avgCurv = curvatures.reduce((sum, c) => sum + c, 0) / curvatures.length;
      const maxCurv = Math.max(...curvatures);
      console.log(`Curvature scores calculated: avg=${avgCurv.toFixed(3)}, max=${maxCurv.toFixed(3)}, ${curvatures.length}/${svgData.paths.length} paths`);
    }
  }

  curvatureCalculated = true;
  isCalculatingCurvature = false;

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  updateStatus(`Curvature calculation complete (${totalTime}s)`);
  console.log(`✓ Curvature calculation complete in ${totalTime}s`);
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

    // Skip curvature calculation during initial load - it will be calculated
    // on-demand when user enables curvature influence or switches to curvature preview
    console.log('Curvature calculation deferred (will compute on-demand when needed)');

    fitSVGToCanvas();
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    updateStatus(`Processed ${svgData.paths.length} paths in ${totalTime}s`);
    showProcessingProgress(false);
    pathsProcessed = true;

    // Invalidate weight cache for new SVG data
    invalidateWeightCache();

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
  originalFilename = null;
  pathsProcessed = false;
  curvatureCalculated = false; // Reset curvature flag
  attractorSystem.clearAll();
  updateAttractorList();
  updateStatus('SVG cleared');

  // Hide process button
  const svgInfo = document.getElementById('svg-info');
  if (svgInfo) svgInfo.style.display = 'none';

  // Reset export button state
  resetExportButton();

  needsRedraw = true;
  redraw();
}

/**
 * Reset export button to initial state
 */
function resetExportButton() {
  const exportButton = document.getElementById('export-svg');
  if (exportButton) {
    exportButton.textContent = 'Export SVG';
    exportButton.classList.remove('download-ready');
  }
  if (typeof preparedDownload !== 'undefined') {
    preparedDownload = null;
  }
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
 * Invalidate cached weights (call when attractors change)
 */
function invalidateWeightCache() {
  if (svgData && svgData.paths) {
    svgData.paths.forEach(path => {
      delete path.cachedWeight;
    });
  }
}

/**
 * Update attractor list in UI
 */
function updateAttractorList() {
  // Invalidate weight cache when attractors change
  invalidateWeightCache();
  const listEl = document.getElementById('attractor-list');
  const countEl = document.getElementById('attractor-count');

  if (countEl) {
    countEl.textContent = `(${attractorSystem.attractors.length}/${attractorSystem.maxAttractors})`;
  }

  if (!listEl) return;

  if (attractorSystem.attractors.length === 0) {
    listEl.innerHTML = '<p style="color: #999; font-style: italic;">No attractors</p>';
    return;
  }

  listEl.innerHTML = attractorSystem.attractors.map(a => {
    const strength = a.strength !== null ? a.strength : attractorSystem.config.strength;
    const radius = a.radius !== null ? a.radius : attractorSystem.config.falloffRadius;
    const hasCustom = a.strength !== null || a.radius !== null;

    return `
    <div class="attractor-item" style="border: 1px solid #ddd; padding: 0.5rem; margin-bottom: 0.5rem; border-radius: 4px; background: ${hasCustom ? '#fffacd' : '#fff'};">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
        <strong>#${a.id}</strong>
        <button onclick="removeAttractor(${a.id})" style="padding: 2px 8px; font-size: 0.8em;">Remove</button>
      </div>
      <div style="font-size: 0.85em; color: #666; display: flex; gap: 0.5rem; align-items: center;">
        <label style="margin: 0;">
          X: <input type="number" id="attractor-${a.id}-x" value="${a.x.toFixed(1)}" step="0.1"
            onchange="updateAttractorPosition(${a.id}, 'x', parseFloat(this.value))"
            style="width: 70px; padding: 2px 4px; font-size: 0.85em;">
        </label>
        <label style="margin: 0;">
          Y: <input type="number" id="attractor-${a.id}-y" value="${a.y.toFixed(1)}" step="0.1"
            onchange="updateAttractorPosition(${a.id}, 'y', parseFloat(this.value))"
            style="width: 70px; padding: 2px 4px; font-size: 0.85em;">
        </label>
      </div>
      <details style="margin-top: 0.25rem;">
        <summary style="cursor: pointer; font-size: 0.85em; color: #0066cc;">⚙️ Settings ${hasCustom ? '(custom)' : '(using defaults)'}</summary>
        <div style="margin-top: 0.5rem; padding: 0.5rem; background: #f8f8f8; border-radius: 4px;">
          <label style="display: block; font-size: 0.8em; margin-bottom: 0.25rem;">
            Strength: <span id="attractor-${a.id}-strength-value">${strength.toFixed(1)}</span>
            <input type="range" id="attractor-${a.id}-strength" min="0" max="5" step="0.1" value="${strength}"
              onchange="updateAttractorProperty(${a.id}, 'strength', parseFloat(this.value))"
              oninput="document.getElementById('attractor-${a.id}-strength-value').textContent = parseFloat(this.value).toFixed(1)"
              style="width: 100%;">
          </label>
          <label style="display: block; font-size: 0.8em; margin-bottom: 0.25rem;">
            Radius (mm): <span id="attractor-${a.id}-radius-value">${radius.toFixed(0)}</span>
            <input type="range" id="attractor-${a.id}-radius" min="10" max="300" step="5" value="${radius}"
              onchange="updateAttractorProperty(${a.id}, 'radius', parseFloat(this.value))"
              oninput="document.getElementById('attractor-${a.id}-radius-value').textContent = parseFloat(this.value).toFixed(0)"
              style="width: 100%;">
          </label>
          <button onclick="resetAttractorToDefaults(${a.id})" style="width: 100%; padding: 4px; font-size: 0.75em; margin-top: 0.25rem;">Reset to Defaults</button>
        </div>
      </details>
    </div>
  `}).join('');
}

/**
 * Remove attractor by ID (called from HTML)
 */
function removeAttractor(id) {
  attractorSystem.removeAttractor(id);
  updateAttractorList();
  if (livePreview) {
    needsRedraw = true;
    redraw();
  }
}

/**
 * Update attractor position (called from HTML)
 */
function updateAttractorPosition(id, axis, value) {
  if (isNaN(value)) {
    console.warn('Invalid position value:', value);
    return;
  }
  const updates = {};
  updates[axis] = value;
  attractorSystem.updateAttractor(id, updates);
  if (livePreview) {
    needsRedraw = true;
    redraw();
  }
}

/**
 * Update attractor property (called from HTML)
 */
function updateAttractorProperty(id, property, value) {
  const updates = {};
  updates[property] = value;
  attractorSystem.updateAttractor(id, updates);
  updateAttractorList(); // Refresh to update the "(custom)" indicator
  if (livePreview) {
    needsRedraw = true;
    redraw();
  }
}

/**
 * Reset attractor to use global defaults (called from HTML)
 */
function resetAttractorToDefaults(id) {
  attractorSystem.updateAttractor(id, { strength: null, radius: null });
  updateAttractorList();
  if (livePreview) {
    needsRedraw = true;
    redraw();
  }
}

/**
 * Manually trigger preview update (called when live preview is off)
 */
function manualPreviewUpdate() {
  if (svgData) {
    needsRedraw = true;
    redraw();
  }
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
