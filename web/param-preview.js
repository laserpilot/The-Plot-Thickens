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

    // Scale factor for visualization (pixels per mm)
    this.scale = 15;

    this.draw();
  }

  /**
   * Update parameters and redraw
   */
  update(baseOffset, noise, passes) {
    this.baseOffset = baseOffset;
    this.noise = noise;
    this.passes = passes;
    this.draw();
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

    // Draw sample circle in center
    const centerX = w / 2;
    const centerY = h / 2;
    const baseRadius = 20; // pixels

    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1;

    // Draw multiple passes with offset and noise
    for (let i = 0; i < this.passes; i++) {
      const passIndex = Math.floor(i / 2);
      const isRight = i % 2 === 0;
      const direction = isRight ? 1 : -1;

      // Calculate offset in pixels
      const offsetDistance = direction * passIndex * this.baseOffset * this.scale;

      ctx.beginPath();

      // Draw circle with noise
      const numPoints = 72; // Number of points around circle
      for (let angle = 0; angle <= Math.PI * 2; angle += (Math.PI * 2) / numPoints) {
        // Add noise based on angle (deterministic for smooth look)
        const noiseValue = this.noise > 0 ?
          (Math.sin(angle * 3 + i * 0.5) * 0.5 + Math.cos(angle * 5 + i * 0.3) * 0.5) * this.noise * this.scale :
          0;

        const radius = baseRadius + offsetDistance + noiseValue;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        if (angle === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.closePath();
      ctx.stroke();
    }

    // Draw label
    ctx.fillStyle = '#7f8c8d';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${this.passes} passes @ ${this.baseOffset}mm ± ${this.noise}mm`, 5, h - 5);
  }
}

// Initialize preview when DOM loads
let paramPreview = null;
document.addEventListener('DOMContentLoaded', () => {
  paramPreview = new ParameterPreview('param-preview-canvas');

  // Update preview when parameters change
  function updatePreview() {
    if (paramPreview) {
      const offset = parseFloat(document.getElementById('base-offset').value) || 0.2;
      const noiseVal = parseFloat(document.getElementById('noise').value) || 0.1;
      const maxPasses = parseInt(document.getElementById('max-passes').value) || 10;
      paramPreview.update(offset, noiseVal, Math.min(maxPasses, 15)); // Cap at 15 for preview
    }
  }

  // Listen to slider changes
  ['base-offset', 'noise', 'max-passes'].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) {
      elem.addEventListener('input', updatePreview);
    }
  });
});
