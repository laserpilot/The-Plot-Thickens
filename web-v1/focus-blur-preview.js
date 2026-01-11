/**
 * Focus Blur Preview - Live test pattern for dialing in parameters
 * Separate p5 instance that shows real-time noise modulation
 */

let focusBlurPreviewSketch = function(p) {
  let previewField = null;
  let patternType = 'horizontal';
  const PREVIEW_SIZE = 400; // Preview canvas size in pixels
  const SCALE_FACTOR = 3; // Convert mm to pixels for visibility (3px per mm)

  p.setup = function() {
    const canvas = p.createCanvas(PREVIEW_SIZE, PREVIEW_SIZE);
    canvas.parent('focus-blur-preview-canvas');
    p.frameRate(30);

    // Initialize density field
    previewField = new DensityField(PREVIEW_SIZE, PREVIEW_SIZE, 64); // Lower res for speed
    p.updatePreviewField();
  };

  p.draw = function() {
    p.background(250);

    if (!previewField) return;

    // Draw test pattern based on selection
    p.noFill();
    p.stroke(0);
    p.strokeWeight(0.5);

    switch(patternType) {
      case 'horizontal':
        drawHorizontalLine();
        break;
      case 'vertical':
        drawVerticalLine();
        break;
      case 'circles':
        drawConcentricCircles();
        break;
      case 'radial':
        drawRadialLines();
        break;
      case 'grid':
        drawGrid();
        break;
    }

    // Draw light indicator
    const lightMode = focusBlurLightMode || 'directional';
    if (lightMode === 'point') {
      const lightPosX = focusBlurLightPosX || 50;
      const lightPosY = focusBlurLightPosY || 50;
      const falloffRadius = focusBlurFalloffRadius || 150;

      const lightX = (lightPosX / 100) * PREVIEW_SIZE;
      const lightY = (lightPosY / 100) * PREVIEW_SIZE;
      const radiusPx = (falloffRadius / PREVIEW_SIZE) * PREVIEW_SIZE;

      p.noFill();
      p.stroke(255, 100, 200, 100);
      p.strokeWeight(1);
      p.circle(lightX, lightY, radiusPx * 2);

      p.fill(255, 100, 200);
      p.noStroke();
      p.circle(lightX, lightY, 6);
    }
  };

  function drawHorizontalLine() {
    const y = PREVIEW_SIZE / 2;
    const numPasses = 5;
    const baseOffset = 2;

    const noiseMin = focusNoiseMin || 0.05;
    const noiseMax = focusNoiseMax || 0.6;
    const freqMin = focusFreqMin || 100;
    const freqMax = focusFreqMax || 10;

    for (let pass = 0; pass < numPasses; pass++) {
      const passOffset = (pass - Math.floor(numPasses/2)) * baseOffset;
      const yPos = y + passOffset;

      p.beginShape();
      for (let x = 10; x < PREVIEW_SIZE - 10; x += 2) {
        const density = previewField.sample(x, yPos);
        const noiseAmp = noiseMin + density * (noiseMax - noiseMin);
        const noiseFreq = freqMin + density * (freqMax - freqMin);

        const noiseValue = (noiseAmp * SCALE_FACTOR) * Math.sin(x / noiseFreq * Math.PI * 2);
        p.vertex(x, yPos + noiseValue);
      }
      p.endShape();
    }
  }

  function drawVerticalLine() {
    const x = PREVIEW_SIZE / 2;
    const numPasses = 5;
    const baseOffset = 2;

    const noiseMin = focusNoiseMin || 0.05;
    const noiseMax = focusNoiseMax || 0.6;
    const freqMin = focusFreqMin || 100;
    const freqMax = focusFreqMax || 10;

    for (let pass = 0; pass < numPasses; pass++) {
      const passOffset = (pass - Math.floor(numPasses/2)) * baseOffset;
      const xPos = x + passOffset;

      p.beginShape();
      for (let y = 10; y < PREVIEW_SIZE - 10; y += 2) {
        const density = previewField.sample(xPos, y);
        const noiseAmp = noiseMin + density * (noiseMax - noiseMin);
        const noiseFreq = freqMin + density * (freqMax - freqMin);

        const noiseValue = (noiseAmp * SCALE_FACTOR) * Math.sin(y / noiseFreq * Math.PI * 2);
        p.vertex(xPos + noiseValue, y);
      }
      p.endShape();
    }
  }

  function drawConcentricCircles() {
    const centerX = PREVIEW_SIZE / 2;
    const centerY = PREVIEW_SIZE / 2;
    const numCircles = 8;
    const maxRadius = PREVIEW_SIZE * 0.45;

    const noiseMin = focusNoiseMin || 0.05;
    const noiseMax = focusNoiseMax || 0.6;
    const freqMin = focusFreqMin || 100;
    const freqMax = focusFreqMax || 10;

    for (let i = 1; i <= numCircles; i++) {
      const radius = (i / numCircles) * maxRadius;
      const circumference = 2 * Math.PI * radius;
      const numPoints = Math.max(60, Math.floor(circumference / 3));

      p.beginShape();
      for (let j = 0; j <= numPoints; j++) {
        const angle = (j / numPoints) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        const density = previewField.sample(x, y);
        const noiseAmp = noiseMin + density * (noiseMax - noiseMin);
        const noiseFreq = freqMin + density * (freqMax - freqMin);

        const arcLength = (j / numPoints) * circumference;
        const noiseValue = (noiseAmp * SCALE_FACTOR) * Math.sin(arcLength / noiseFreq * Math.PI * 2);

        const noisedRadius = radius + noiseValue;
        const finalX = centerX + Math.cos(angle) * noisedRadius;
        const finalY = centerY + Math.sin(angle) * noisedRadius;

        p.vertex(finalX, finalY);
      }
      p.endShape(p.CLOSE);
    }
  }

  function drawRadialLines() {
    const centerX = PREVIEW_SIZE / 2;
    const centerY = PREVIEW_SIZE / 2;
    const numLines = 16;
    const maxLength = PREVIEW_SIZE * 0.45;

    const noiseMin = focusNoiseMin || 0.05;
    const noiseMax = focusNoiseMax || 0.6;
    const freqMin = focusFreqMin || 100;
    const freqMax = focusFreqMax || 10;

    for (let i = 0; i < numLines; i++) {
      const angle = (i / numLines) * Math.PI * 2;

      p.beginShape();
      for (let dist = 10; dist < maxLength; dist += 2) {
        const x = centerX + Math.cos(angle) * dist;
        const y = centerY + Math.sin(angle) * dist;

        const density = previewField.sample(x, y);
        const noiseAmp = noiseMin + density * (noiseMax - noiseMin);
        const noiseFreq = freqMin + density * (freqMax - freqMin);

        const noiseValue = (noiseAmp * SCALE_FACTOR) * Math.sin(dist / noiseFreq * Math.PI * 2);

        const perpAngle = angle + Math.PI / 2;
        const finalX = x + Math.cos(perpAngle) * noiseValue;
        const finalY = y + Math.sin(perpAngle) * noiseValue;

        p.vertex(finalX, finalY);
      }
      p.endShape();
    }
  }

  function drawGrid() {
    const noiseMin = focusNoiseMin || 0.05;
    const noiseMax = focusNoiseMax || 0.6;
    const freqMin = focusFreqMin || 100;
    const freqMax = focusFreqMax || 10;

    const gridSpacing = 50; // Spacing between grid points
    const markerSize = 8; // Size of + marker
    const circleRadius = 20; // Base radius for circles

    // Draw grid of markers and circles
    for (let gridX = gridSpacing; gridX < PREVIEW_SIZE; gridX += gridSpacing) {
      for (let gridY = gridSpacing; gridY < PREVIEW_SIZE; gridY += gridSpacing) {
        const density = previewField.sample(gridX, gridY);
        const noiseAmp = noiseMin + density * (noiseMax - noiseMin);
        const noiseFreq = freqMin + density * (freqMax - freqMin);

        // Draw + marker at grid point
        p.stroke(0);
        p.strokeWeight(1);
        p.line(gridX - markerSize, gridY, gridX + markerSize, gridY);
        p.line(gridX, gridY - markerSize, gridX, gridY + markerSize);

        // Draw noisy circle around marker
        p.noFill();
        p.strokeWeight(0.5);
        p.beginShape();
        const numPoints = 60;
        for (let i = 0; i <= numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          const arcLength = (i / numPoints) * (2 * Math.PI * circleRadius);

          // Apply noise based on density
          const noiseValue = (noiseAmp * SCALE_FACTOR) * Math.sin(arcLength / noiseFreq * Math.PI * 2);
          const noisedRadius = circleRadius + noiseValue;

          const x = gridX + Math.cos(angle) * noisedRadius;
          const y = gridY + Math.sin(angle) * noisedRadius;
          p.vertex(x, y);
        }
        p.endShape(p.CLOSE);
      }
    }
  }

  // Public function to update the density field
  p.updatePreviewField = function() {
    if (!previewField) return;

    // Access global variables from sketch.js
    const lightMode = focusBlurLightMode || 'directional';
    const lightAngle = focusBlurLightAngle || 45;
    const lightPosX = focusBlurLightPosX || 50;
    const lightPosY = focusBlurLightPosY || 50;
    const falloffRadius = focusBlurFalloffRadius || 150;

    if (lightMode === 'point') {
      const lightX = (lightPosX / 100) * PREVIEW_SIZE;
      const lightY = (lightPosY / 100) * PREVIEW_SIZE;
      const radius = (falloffRadius / PREVIEW_SIZE) * PREVIEW_SIZE;
      previewField.computeFromPointLight(lightX, lightY, radius, 0, 1);
    } else {
      previewField.computeFromDirectionalLight(lightAngle, 0, 1);
    }

    // Update info display
    updatePreviewInfo();
  };

  p.updatePattern = function(newPattern) {
    patternType = newPattern;
  };

  function updatePreviewInfo() {
    const lightMode = focusBlurLightMode || 'directional';
    const lightAngle = focusBlurLightAngle || 45;
    const lightPosX = focusBlurLightPosX || 50;
    const lightPosY = focusBlurLightPosY || 50;
    const falloffRadius = focusBlurFalloffRadius || 150;
    const noiseMin = focusNoiseMin || 0.05;
    const noiseMax = focusNoiseMax || 0.6;
    const freqMin = focusFreqMin || 100;
    const freqMax = focusFreqMax || 10;

    // Update light position info
    const lightInfo = document.getElementById('preview-light-info');
    if (lightInfo) {
      if (lightMode === 'point') {
        lightInfo.textContent = `Point (${lightPosX}%, ${lightPosY}%)`;
      } else {
        lightInfo.textContent = `Directional (${lightAngle}°)`;
      }
    }

    // Update falloff radius
    const falloffInfo = document.getElementById('preview-falloff-info');
    if (falloffInfo) {
      falloffInfo.textContent = `${falloffRadius}mm`;
    }

    // Update noise range
    const noiseInfo = document.getElementById('preview-noise-info');
    if (noiseInfo) {
      noiseInfo.textContent = `${noiseMin.toFixed(2)}mm → ${noiseMax.toFixed(2)}mm`;
    }

    // Update frequency range
    const freqInfo = document.getElementById('preview-freq-info');
    if (freqInfo) {
      freqInfo.textContent = `${freqMin.toFixed(0)}mm → ${freqMax.toFixed(0)}mm`;
    }
  }

  // Call update initially
  if (typeof updatePreviewField === 'function') {
    updatePreviewField();
  }
};

// Create the preview instance (will be initialized when page loads)
let focusBlurPreview = null;

// Initialize preview when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit for the main sketch to initialize
    setTimeout(function() {
      focusBlurPreview = new p5(focusBlurPreviewSketch);
    }, 100);
  });
}

// Global function to trigger preview updates
function updateFocusBlurPreview() {
  if (focusBlurPreview && focusBlurPreview.updatePreviewField) {
    focusBlurPreview.updatePreviewField();
  }
}
