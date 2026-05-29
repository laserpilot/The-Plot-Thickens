/**
 * Path Length Histogram - visualizes distribution of path lengths
 */

export class PathLengthHistogram {
  constructor(canvasId, containerId) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.pathLengths = [];
  }

  /**
   * Update histogram with new data
   * @param {number[]} pathLengths - Array of path lengths
   * @param {number} minThreshold - Min length threshold (0 = auto)
   * @param {number} maxThreshold - Max length threshold (0 = auto)
   */
  update(pathLengths, minThreshold = 0, maxThreshold = 0) {
    if (!this.canvas || !this.container) return;

    if (!pathLengths || pathLengths.length === 0) {
      this.container.style.display = 'none';
      return;
    }

    this.pathLengths = pathLengths;
    this.container.style.display = 'block';
    this.draw(pathLengths, minThreshold, maxThreshold);
  }

  /**
   * Get current path lengths (for external updates)
   */
  getPathLengths() {
    return this.pathLengths;
  }

  draw(lengths, minT, maxT) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);

    if (lengths.length === 0) return;

    // Calculate data range (loop, not Math.min(...lengths) — spreading a large
    // array as arguments overflows the call stack on heavy SVGs)
    let dataMin = Infinity;
    let dataMax = -Infinity;
    for (const len of lengths) {
      if (len < dataMin) dataMin = len;
      if (len > dataMax) dataMax = len;
    }

    // Handle edge case where all paths are the same length
    if (dataMax === dataMin) {
      ctx.fillStyle = '#4a9eff';
      ctx.fillRect(w / 4, 10, w / 2, h - 25);
      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.fillText(`All paths: ${dataMin.toFixed(1)}mm`, 10, h - 2);
      return;
    }

    // Calculate bins (adaptive count based on data)
    const binCount = Math.min(20, Math.max(5, Math.ceil(lengths.length / 5)));
    const binWidth = (dataMax - dataMin) / binCount;
    const bins = new Array(binCount).fill(0);

    lengths.forEach(len => {
      const idx = Math.min(binCount - 1, Math.floor((len - dataMin) / binWidth));
      bins[idx]++;
    });

    const maxBin = Math.max(...bins);
    const barWidth = (w - 20) / binCount;
    const padding = 10;
    const topPadding = 5;
    const bottomPadding = 15;
    const barMaxHeight = h - topPadding - bottomPadding;

    // Draw bars
    bins.forEach((count, i) => {
      if (count === 0) return;

      const barHeight = (count / maxBin) * barMaxHeight;
      const x = padding + i * barWidth;
      const y = h - bottomPadding - barHeight;
      const binStart = dataMin + i * binWidth;
      const binEnd = binStart + binWidth;

      // Color: gray if outside thresholds, blue if inside
      const belowMin = minT > 0 && binEnd < minT;
      const aboveMax = maxT > 0 && binStart > maxT;
      const inRange = !belowMin && !aboveMax;

      ctx.fillStyle = inRange ? '#4a9eff' : '#444';
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    });

    // Draw threshold lines
    const drawThresholdLine = (threshold, color) => {
      if (threshold > 0 && threshold >= dataMin && threshold <= dataMax) {
        const x = padding + ((threshold - dataMin) / (dataMax - dataMin)) * (w - 20);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, topPadding);
        ctx.lineTo(x, h - bottomPadding);
        ctx.stroke();
      }
    };

    drawThresholdLine(minT, '#ff6b6b');
    drawThresholdLine(maxT, '#ff6b6b');

    // Labels
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText(`${dataMin.toFixed(0)}`, padding, h - 2);

    const maxLabel = `${dataMax.toFixed(0)}mm`;
    const maxLabelWidth = ctx.measureText(maxLabel).width;
    ctx.fillText(maxLabel, w - padding - maxLabelWidth, h - 2);

    // Path count
    ctx.fillText(`n=${lengths.length}`, w / 2 - 15, h - 2);
  }
}
