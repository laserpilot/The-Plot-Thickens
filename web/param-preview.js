/**
 * Live parameter preview widget
 * Shows a sample circle with current offset/noise/passes settings
 */

class ParameterPreview {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.warn('Parameter preview canvas not found');
      return;
    }

    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    // Default parameters
    this.baseOffset = 0.2;
    this.noise = 0.1;
    this.passes = 10;
    this.noiseFrequency = 50;
    this.envelope = 'flat';
    this.offsetMode = 'legacy';

    // Scale factor for visualization (pixels per mm)
    this.scale = 15;

    this.draw();
  }

  /**
   * Update parameters and redraw
   */
  update(baseOffset, noise, passes, noiseFrequency = 50, envelope = 'flat', offsetMode = 'legacy') {
    this.baseOffset = baseOffset;
    this.noise = noise;
    this.passes = passes;
    this.noiseFrequency = noiseFrequency;
    this.envelope = envelope;
    this.offsetMode = offsetMode;
    this.draw();
  }

  /**
   * Get envelope multiplier at position t
   */
  getEnvelopeMultiplier(t) {
    switch (this.envelope) {
      case 'linearTaper': return 1.0 - t;
      case 'linearTaperBoth': return 1.0 - Math.abs(2 * t - 1);
      case 'sinTaper': return Math.sin(Math.PI * t);
      case 'sinTaperBoth': return Math.sin(Math.PI * t);
      case 'exponentialTaper': return Math.pow(1.0 - t, 2);
      case 'easeInOut': return 1.0 - Math.pow(2 * t - 1, 2);
      default: return 1.0; // flat
    }
  }

  /**
   * Draw the preview
   */
  draw() {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1;

    // Layout: Circle | Line | Curve
    const sectionWidth = w / 3;

    // 1. CIRCLE (left third)
    this.drawCircle(ctx, sectionWidth / 2, h / 2, 18);

    // 2. LINE (middle third)
    this.drawLine(ctx, sectionWidth, w - sectionWidth, 15, h - 15);

    // 3. CURVE (right third)
    this.drawCurve(ctx, sectionWidth * 2, sectionWidth * 3);

    // Draw label
    ctx.fillStyle = '#7f8c8d';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    const modeLabel = this.offsetMode === 'normal' ? `${this.envelope}, freq=${this.noiseFrequency}` : 'legacy';
    ctx.fillText(`${this.passes} passes @ ${this.baseOffset}mm ± ${this.noise}mm | ${modeLabel}`, 3, h - 3);
  }

  /**
   * Draw circle preview
   */
  drawCircle(ctx, centerX, centerY, baseRadius) {
    for (let i = 0; i < this.passes; i++) {
      const passIndex = Math.floor(i / 2);
      const isRight = i % 2 === 0;
      const direction = isRight ? 1 : -1;
      const offsetDistance = direction * passIndex * this.baseOffset * this.scale;

      ctx.beginPath();
      const numPoints = 72;
      for (let j = 0; j <= numPoints; j++) {
        const angle = (j / numPoints) * Math.PI * 2;
        const t = j / numPoints; // Normalized position

        // Apply envelope (for normal mode)
        const env = this.offsetMode === 'normal' ? this.getEnvelopeMultiplier(t) : 1.0;

        // Apply noise (frequency-aware for normal mode)
        const arcLength = t * (Math.PI * 2 * baseRadius);
        const freq = this.offsetMode === 'normal' ? this.noiseFrequency : 10;
        const noiseValue = this.noise > 0 ?
          Math.sin(arcLength / freq + i * 0.5) * this.noise * this.scale :
          0;

        const radius = baseRadius + (offsetDistance + noiseValue) * env;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  /**
   * Draw line preview (shows taper clearly)
   */
  drawLine(ctx, startX, endX, y, endY) {
    const lineLength = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - y, 2));

    for (let i = 0; i < this.passes; i++) {
      const passIndex = Math.floor(i / 2);
      const isRight = i % 2 === 0;
      const direction = isRight ? 1 : -1;
      const baseOffsetPx = direction * passIndex * this.baseOffset * this.scale;

      ctx.beginPath();
      const numPoints = 40;
      for (let j = 0; j <= numPoints; j++) {
        const t = j / numPoints;
        const x = startX + (endX - startX) * t;
        const yBase = y + (endY - y) * t;

        // Apply envelope
        const env = this.offsetMode === 'normal' ? this.getEnvelopeMultiplier(t) : 1.0;

        // Apply noise
        const arcLength = t * lineLength;
        const freq = this.offsetMode === 'normal' ? this.noiseFrequency : 10;
        const noiseValue = this.noise > 0 ?
          Math.sin(arcLength / freq + i * 0.5) * this.noise * this.scale :
          0;

        const offsetPx = (baseOffsetPx + noiseValue) * env;
        const yFinal = yBase + offsetPx;

        if (j === 0) ctx.moveTo(x, yFinal);
        else ctx.lineTo(x, yFinal);
      }
      ctx.stroke();
    }
  }

  /**
   * Draw S-curve preview (shows noise frequency on curves)
   */
  drawCurve(ctx, startX, endX) {
    const h = this.height;
    const w = endX - startX;

    for (let i = 0; i < this.passes; i++) {
      const passIndex = Math.floor(i / 2);
      const isRight = i % 2 === 0;
      const direction = isRight ? 1 : -1;
      const baseOffsetPx = direction * passIndex * this.baseOffset * this.scale;

      ctx.beginPath();
      const numPoints = 40;
      for (let j = 0; j <= numPoints; j++) {
        const t = j / numPoints;
        const x = startX + w * 0.2 + w * 0.6 * t;

        // S-curve using sine
        const yBase = h / 2 + Math.sin(t * Math.PI * 2 - Math.PI / 2) * h * 0.25;

        // Apply envelope
        const env = this.offsetMode === 'normal' ? this.getEnvelopeMultiplier(t) : 1.0;

        // Apply noise (along curve)
        const arcLength = t * 60; // Approximate curve length
        const freq = this.offsetMode === 'normal' ? this.noiseFrequency : 10;
        const noiseValue = this.noise > 0 ?
          Math.sin(arcLength / freq + i * 0.5) * this.noise * this.scale :
          0;

        // Offset perpendicular to curve (approximated)
        const angle = Math.cos(t * Math.PI * 2 - Math.PI / 2) * Math.PI * 2;
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);

        const offsetDist = (baseOffsetPx + noiseValue) * env;
        const xFinal = x + nx * offsetDist * 0.5; // Scale down for visibility
        const yFinal = yBase + ny * offsetDist;

        if (j === 0) ctx.moveTo(xFinal, yFinal);
        else ctx.lineTo(xFinal, yFinal);
      }
      ctx.stroke();
    }
  }
}

// Initialize preview when DOM loads
let paramPreview = null;
document.addEventListener('DOMContentLoaded', () => {
  paramPreview = new ParameterPreview('param-preview-canvas');

  // Update preview when parameters change
  function updatePreview() {
    if (paramPreview) {
      const offset = parseFloat(document.getElementById('base-offset')?.value) || 0.2;
      const noiseVal = parseFloat(document.getElementById('noise')?.value) || 0.1;
      const maxPasses = parseInt(document.getElementById('max-passes')?.value) || 10;
      const noiseFreq = parseInt(document.getElementById('noise-frequency')?.value) || 50;

      // Get offset mode
      const offsetModeRadios = document.getElementsByName('offset-mode');
      let offsetMode = 'legacy';
      offsetModeRadios.forEach(radio => {
        if (radio.checked) offsetMode = radio.value;
      });

      // Get envelope preset
      const envelopeSelect = document.getElementById('envelope-preset');
      const envelope = envelopeSelect?.value || 'flat';

      paramPreview.update(offset, noiseVal, Math.min(maxPasses, 15), noiseFreq, envelope, offsetMode);

      // Invalidate focus window cache when parameters change
      if (typeof offsetCache !== 'undefined') {
        offsetCache.clear();
        // Hide "Show Computed Detail" checkbox and show compute button instead
        const showDetailLabel = document.getElementById('show-detail-label');
        const computeBtn = document.getElementById('compute-focus');
        if (showDetailLabel) showDetailLabel.style.display = 'none';
        if (computeBtn && focusWindow) computeBtn.style.display = 'block';
      }
    }
  }

  // Listen to all relevant parameter changes
  ['base-offset', 'noise', 'max-passes', 'noise-frequency'].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) {
      elem.addEventListener('input', updatePreview);
    }
  });

  // Listen to offset mode radio buttons
  document.getElementsByName('offset-mode').forEach(radio => {
    radio.addEventListener('change', updatePreview);
  });

  // Listen to envelope selector
  const envelopeSelect = document.getElementById('envelope-preset');
  if (envelopeSelect) {
    envelopeSelect.addEventListener('change', updatePreview);
  }
});
