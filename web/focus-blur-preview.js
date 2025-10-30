/**
 * Focus Blur Preview - Live test pattern for dialing in parameters
 * Separate p5 instance that shows real-time noise modulation
 */

let focusBlurPreviewSketch = function(p) {
  let previewField = null;
  let patternType = 'horizontal';
  const PREVIEW_SIZE = 400; // Preview canvas size in pixels

  p.setup = function() {
    const canvas = p.createCanvas(PREVIEW_SIZE, PREVIEW_SIZE);
    canvas.parent('focus-blur-preview-canvas');
    p.frameRate(30);

    // Initialize density field
    previewField = new DensityField(PREVIEW_SIZE, PREVIEW_SIZE, 64); // Lower res for speed
    updatePreviewField();
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
    }

    // Draw light indicator
    if (focusBlurLightMode === 'point') {
      const lightX = (focusBlurLightPosX / 100) * PREVIEW_SIZE;
      const lightY = (focusBlurLightPosY / 100) * PREVIEW_SIZE;
      const radiusPx = (focusBlurFalloffRadius / PREVIEW_SIZE) * PREVIEW_SIZE;

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

    for (let pass = 0; pass < numPasses; pass++) {
      const passOffset = (pass - Math.floor(numPasses/2)) * baseOffset;
      const yPos = y + passOffset;

      p.beginShape();
      for (let x = 10; x < PREVIEW_SIZE - 10; x += 2) {
        const density = previewField.sample(x, yPos);
        const noiseAmp = focusNoiseMin + density * (focusNoiseMax - focusNoiseMin);
        const noiseFreq = focusFreqMin + density * (focusFreqMax - focusFreqMin);

        const noiseValue = noiseAmp * Math.sin(x / noiseFreq * Math.PI * 2);
        p.vertex(x, yPos + noiseValue);
      }
      p.endShape();
    }
  }

  function drawVerticalLine() {
    const x = PREVIEW_SIZE / 2;
    const numPasses = 5;
    const baseOffset = 2;

    for (let pass = 0; pass < numPasses; pass++) {
      const passOffset = (pass - Math.floor(numPasses/2)) * baseOffset;
      const xPos = x + passOffset;

      p.beginShape();
      for (let y = 10; y < PREVIEW_SIZE - 10; y += 2) {
        const density = previewField.sample(xPos, y);
        const noiseAmp = focusNoiseMin + density * (focusNoiseMax - focusNoiseMin);
        const noiseFreq = focusFreqMin + density * (focusFreqMax - focusFreqMin);

        const noiseValue = noiseAmp * Math.sin(y / noiseFreq * Math.PI * 2);
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
        const noiseAmp = focusNoiseMin + density * (focusNoiseMax - focusNoiseMin);
        const noiseFreq = focusFreqMin + density * (focusFreqMax - focusFreqMin);

        const arcLength = (j / numPoints) * circumference;
        const noiseValue = noiseAmp * Math.sin(arcLength / noiseFreq * Math.PI * 2);

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

    for (let i = 0; i < numLines; i++) {
      const angle = (i / numLines) * Math.PI * 2;

      p.beginShape();
      for (let dist = 10; dist < maxLength; dist += 2) {
        const x = centerX + Math.cos(angle) * dist;
        const y = centerY + Math.sin(angle) * dist;

        const density = previewField.sample(x, y);
        const noiseAmp = focusNoiseMin + density * (focusNoiseMax - focusNoiseMin);
        const noiseFreq = focusFreqMin + density * (focusFreqMax - focusFreqMin);

        const noiseValue = noiseAmp * Math.sin(dist / noiseFreq * Math.PI * 2);

        const perpAngle = angle + Math.PI / 2;
        const finalX = x + Math.cos(perpAngle) * noiseValue;
        const finalY = y + Math.sin(perpAngle) * noiseValue;

        p.vertex(finalX, finalY);
      }
      p.endShape();
    }
  }

  // Public function to update the density field
  p.updatePreviewField = function() {
    if (!previewField) return;

    if (focusBlurLightMode === 'point') {
      const lightX = (focusBlurLightPosX / 100) * PREVIEW_SIZE;
      const lightY = (focusBlurLightPosY / 100) * PREVIEW_SIZE;
      const radius = (focusBlurFalloffRadius / PREVIEW_SIZE) * PREVIEW_SIZE;
      previewField.computeFromPointLight(lightX, lightY, radius, 0, 1);
    } else {
      previewField.computeFromDirectionalLight(focusBlurLightAngle, 0, 1);
    }

    // Update info display
    updatePreviewInfo();
  };

  p.updatePattern = function(newPattern) {
    patternType = newPattern;
  };

  function updatePreviewInfo() {
    // Update light position info
    const lightInfo = document.getElementById('preview-light-info');
    if (lightInfo) {
      if (focusBlurLightMode === 'point') {
        lightInfo.textContent = `Point (${focusBlurLightPosX}%, ${focusBlurLightPosY}%)`;
      } else {
        lightInfo.textContent = `Directional (${focusBlurLightAngle}°)`;
      }
    }

    // Update falloff radius
    const falloffInfo = document.getElementById('preview-falloff-info');
    if (falloffInfo) {
      falloffInfo.textContent = `${focusBlurFalloffRadius}mm`;
    }

    // Update noise range
    const noiseInfo = document.getElementById('preview-noise-info');
    if (noiseInfo) {
      noiseInfo.textContent = `${focusNoiseMin.toFixed(2)}mm → ${focusNoiseMax.toFixed(2)}mm`;
    }

    // Update frequency range
    const freqInfo = document.getElementById('preview-freq-info');
    if (freqInfo) {
      freqInfo.textContent = `${focusFreqMin.toFixed(0)}mm → ${focusFreqMax.toFixed(0)}mm`;
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
