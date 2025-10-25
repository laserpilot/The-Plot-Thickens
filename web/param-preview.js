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
      const passIndex = Math.floor(i / 2) + 1;
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
      const passIndex = Math.floor(i / 2) + 1;
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
      const passIndex = Math.floor(i / 2) + 1;
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

/**
 * Crosshatch preview widget
 * Shows sample shapes filled with crosshatch pattern
 */
class CrosshatchPreview {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.warn('Crosshatch preview canvas not found');
      return;
    }

    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    // Default parameters
    this.hatchAngles = [45, -45];
    this.hatchSpacing = 1.0;
    this.organicEnabled = false;
    this.wiggle = 0;
    this.wiggleFreq = 20;
    this.angleJitter = 0;
    this.lengthJitter = 0;
    this.positionJitter = 0;
    this.spacingJitter = 0;

    // Scale factor (pixels per mm)
    this.scale = 15;

    this.draw();
  }

  /**
   * Update parameters and redraw
   */
  update(hatchAngles, hatchSpacing, organicEnabled, wiggle, wiggleFreq, angleJitter, lengthJitter, positionJitter, spacingJitter) {
    this.hatchAngles = hatchAngles;
    this.hatchSpacing = hatchSpacing;
    this.organicEnabled = organicEnabled;
    this.wiggle = wiggle;
    this.wiggleFreq = wiggleFreq;
    this.angleJitter = angleJitter;
    this.lengthJitter = lengthJitter;
    this.positionJitter = positionJitter;
    this.spacingJitter = spacingJitter;
    this.draw();
  }

  /**
   * Simple seeded random number generator
   */
  seededRandom(seed) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  /**
   * Generate a wiggly line (simplified version)
   */
  generateWigglyLine(x1, y1, x2, y2, seed) {
    if (!this.organicEnabled || this.wiggle === 0) {
      return [[x1, y1], [x2, y2]];
    }

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(3, Math.floor(length / (this.wiggleFreq * this.scale / 5)));

    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + dx * t;
      const y = y1 + dy * t;

      // Perpendicular offset
      const perpX = -dy / length;
      const perpY = dx / length;

      const phase = (t * length) / (this.wiggleFreq * this.scale);
      const noise = this.seededRandom(seed + i * 0.1) * 0.3 - 0.15;
      const wiggleAmount = Math.sin(phase * Math.PI * 2 + noise) * this.wiggle * this.scale;

      points.push([
        x + perpX * wiggleAmount,
        y + perpY * wiggleAmount
      ]);
    }
    return points;
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

    // Layout: Circle | Rectangle | Curve
    const sectionWidth = w / 3;

    // 1. CIRCLE (left third)
    this.drawCircle(ctx, sectionWidth / 2, h / 2, 20);

    // 2. RECTANGLE (middle third)
    this.drawRectangle(ctx, sectionWidth + 20, h / 2 - 20, sectionWidth - 40, 40);

    // 3. CURVE (right third) - draw a curved band
    this.drawCurve(ctx, sectionWidth * 2, w);

    // Draw label
    ctx.fillStyle = '#7f8c8d';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    const anglesStr = this.hatchAngles.join('°, ') + '°';
    const organicLabel = this.organicEnabled ? ` | wiggle=${this.wiggle}mm` : '';
    ctx.fillText(`${anglesStr} @ ${this.hatchSpacing}mm${organicLabel}`, 3, h - 3);
  }

  /**
   * Draw hatches inside a circle
   */
  drawCircle(ctx, centerX, centerY, radius) {
    const spacingPx = this.hatchSpacing * this.scale;

    this.hatchAngles.forEach((baseAngle, angleIndex) => {
      // Apply angle jitter
      const jitter = this.organicEnabled ? (this.seededRandom(angleIndex * 100) - 0.5) * this.angleJitter : 0;
      const angle = (baseAngle + jitter) * Math.PI / 180;
      const perpAngle = angle + Math.PI / 2;

      // Hatch direction
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      // Perpendicular direction for spacing
      const px = Math.cos(perpAngle);
      const py = Math.sin(perpAngle);

      // Determine hatch line range
      const numLines = Math.ceil((radius * 2) / this.hatchSpacing);

      for (let i = -numLines; i <= numLines; i++) {
        // Apply spacing jitter
        const spacingMult = this.organicEnabled ? 1 + (this.seededRandom(angleIndex * 1000 + i) - 0.5) * this.spacingJitter : 1;
        const offset = i * spacingPx * spacingMult;

        // Apply position jitter
        const posJitter = this.organicEnabled ? (this.seededRandom(angleIndex * 2000 + i) - 0.5) * this.positionJitter * this.scale : 0;

        const lineX = centerX + px * (offset + posJitter);
        const lineY = centerY + py * (offset + posJitter);

        // Find intersections with circle
        const intersections = this.lineCircleIntersection(lineX, lineY, dx, dy, centerX, centerY, radius);
        if (intersections.length === 2) {
          const [p1, p2] = intersections;

          // Apply length jitter
          let x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
          if (this.organicEnabled && this.lengthJitter > 0) {
            const jitterAmount = this.lengthJitter * this.seededRandom(angleIndex * 3000 + i);
            const segLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            const shortenPx = segLength * jitterAmount;
            const ratio = (segLength - shortenPx) / segLength;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            x1 = midX + (x1 - midX) * ratio;
            y1 = midY + (y1 - midY) * ratio;
            x2 = midX + (x2 - midX) * ratio;
            y2 = midY + (y2 - midY) * ratio;
          }

          // Draw line (potentially wiggly)
          const points = this.generateWigglyLine(x1, y1, x2, y2, angleIndex * 5000 + i);
          ctx.beginPath();
          points.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt[0], pt[1]);
            else ctx.lineTo(pt[0], pt[1]);
          });
          ctx.stroke();
        }
      }
    });
  }

  /**
   * Draw hatches inside a rectangle
   */
  drawRectangle(ctx, x, y, width, height) {
    const spacingPx = this.hatchSpacing * this.scale;

    this.hatchAngles.forEach((baseAngle, angleIndex) => {
      // Apply angle jitter
      const jitter = this.organicEnabled ? (this.seededRandom(angleIndex * 100) - 0.5) * this.angleJitter : 0;
      const angle = (baseAngle + jitter) * Math.PI / 180;
      const perpAngle = angle + Math.PI / 2;

      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const px = Math.cos(perpAngle);
      const py = Math.sin(perpAngle);

      const diagonal = Math.sqrt(width * width + height * height);
      const numLines = Math.ceil(diagonal / this.hatchSpacing);

      for (let i = -numLines; i <= numLines; i++) {
        const spacingMult = this.organicEnabled ? 1 + (this.seededRandom(angleIndex * 1000 + i) - 0.5) * this.spacingJitter : 1;
        const offset = i * spacingPx * spacingMult;
        const posJitter = this.organicEnabled ? (this.seededRandom(angleIndex * 2000 + i) - 0.5) * this.positionJitter * this.scale : 0;

        const lineX = x + width / 2 + px * (offset + posJitter);
        const lineY = y + height / 2 + py * (offset + posJitter);

        // Find intersections with rectangle
        const intersections = this.lineRectIntersection(lineX, lineY, dx, dy, x, y, width, height);
        if (intersections.length === 2) {
          let [p1, p2] = intersections;

          // Apply length jitter
          if (this.organicEnabled && this.lengthJitter > 0) {
            const jitterAmount = this.lengthJitter * this.seededRandom(angleIndex * 3000 + i);
            const segLength = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            const shortenPx = segLength * jitterAmount;
            const ratio = (segLength - shortenPx) / segLength;
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            p1 = {
              x: midX + (p1.x - midX) * ratio,
              y: midY + (p1.y - midY) * ratio
            };
            p2 = {
              x: midX + (p2.x - midX) * ratio,
              y: midY + (p2.y - midY) * ratio
            };
          }

          const points = this.generateWigglyLine(p1.x, p1.y, p2.x, p2.y, angleIndex * 5000 + i);
          ctx.beginPath();
          points.forEach((pt, idx) => {
            if (idx === 0) ctx.moveTo(pt[0], pt[1]);
            else ctx.lineTo(pt[0], pt[1]);
          });
          ctx.stroke();
        }
      }
    });
  }

  /**
   * Draw hatches inside a curved band
   */
  drawCurve(ctx, startX, endX) {
    const h = this.height;
    const w = endX - startX;
    const bandHeight = 35;

    // Define curve path (S-curve)
    const curvePoints = [];
    const numPoints = 50;
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const x = startX + w * 0.15 + w * 0.7 * t;
      const yCenter = h / 2 + Math.sin(t * Math.PI * 2 - Math.PI / 2) * h * 0.2;
      curvePoints.push({ x, y: yCenter });
    }

    // Draw curve boundaries for context
    ctx.strokeStyle = '#dfe6e9';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    curvePoints.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y - bandHeight / 2);
      else ctx.lineTo(pt.x, pt.y - bandHeight / 2);
    });
    ctx.stroke();
    ctx.beginPath();
    curvePoints.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y + bandHeight / 2);
      else ctx.lineTo(pt.x, pt.y + bandHeight / 2);
    });
    ctx.stroke();

    // Draw hatches (simplified - just draw at intervals along curve)
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1;

    const spacingPx = this.hatchSpacing * this.scale;
    this.hatchAngles.forEach((baseAngle, angleIndex) => {
      const jitter = this.organicEnabled ? (this.seededRandom(angleIndex * 100) - 0.5) * this.angleJitter : 0;
      const angle = (baseAngle + jitter) * Math.PI / 180;

      const numHatches = Math.floor(w / spacingPx);
      for (let i = 0; i <= numHatches; i++) {
        const t = i / numHatches;
        const idx = Math.floor(t * (curvePoints.length - 1));
        const pt = curvePoints[idx];

        const hatchLength = bandHeight;
        const lengthMult = this.organicEnabled ? 1 - this.lengthJitter * this.seededRandom(angleIndex * 3000 + i) : 1;
        const actualLength = hatchLength * lengthMult;

        const dx = Math.cos(angle) * actualLength;
        const dy = Math.sin(angle) * actualLength;

        const x1 = pt.x - dx / 2;
        const y1 = pt.y - dy / 2;
        const x2 = pt.x + dx / 2;
        const y2 = pt.y + dy / 2;

        const points = this.generateWigglyLine(x1, y1, x2, y2, angleIndex * 5000 + i);
        ctx.beginPath();
        points.forEach((p, pidx) => {
          if (pidx === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        });
        ctx.stroke();
      }
    });
  }

  /**
   * Line-circle intersection
   */
  lineCircleIntersection(lineX, lineY, dx, dy, cx, cy, r) {
    // Line: (lineX + t*dx, lineY + t*dy)
    // Circle: (x - cx)^2 + (y - cy)^2 = r^2
    const fx = lineX - cx;
    const fy = lineY - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return [];

    const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
    const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);

    return [
      { x: lineX + t1 * dx, y: lineY + t1 * dy },
      { x: lineX + t2 * dx, y: lineY + t2 * dy }
    ];
  }

  /**
   * Line-rectangle intersection
   */
  lineRectIntersection(lineX, lineY, dx, dy, rectX, rectY, rectW, rectH) {
    const intersections = [];

    // Four edges of rectangle
    const edges = [
      { x1: rectX, y1: rectY, x2: rectX + rectW, y2: rectY }, // top
      { x1: rectX + rectW, y1: rectY, x2: rectX + rectW, y2: rectY + rectH }, // right
      { x1: rectX, y1: rectY + rectH, x2: rectX + rectW, y2: rectY + rectH }, // bottom
      { x1: rectX, y1: rectY, x2: rectX, y2: rectY + rectH }, // left
    ];

    edges.forEach(edge => {
      const edgeDx = edge.x2 - edge.x1;
      const edgeDy = edge.y2 - edge.y1;

      // Solve: lineX + t1*dx = edge.x1 + t2*edgeDx
      //        lineY + t1*dy = edge.y1 + t2*edgeDy
      const denom = dx * edgeDy - dy * edgeDx;
      if (Math.abs(denom) < 1e-10) return; // Parallel

      const t1 = ((edge.x1 - lineX) * edgeDy - (edge.y1 - lineY) * edgeDx) / denom;
      const t2 = ((edge.x1 - lineX) * dy - (edge.y1 - lineY) * dx) / denom;

      if (t2 >= 0 && t2 <= 1) { // Intersection on edge
        intersections.push({ x: lineX + t1 * dx, y: lineY + t1 * dy, t: t1 });
      }
    });

    // Sort by t value and return first two
    intersections.sort((a, b) => a.t - b.t);
    return intersections.slice(0, 2);
  }
}

/**
 * Light Direction Indicator
 * Shows an arrow pointing in the light direction
 */
class LightDirectionIndicator {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.lightAngle = 45;

    this.draw();
  }

  update(lightAngle) {
    this.lightAngle = lightAngle;
    this.draw();
  }

  draw() {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const centerX = w / 2;
    const centerY = h / 2;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, w, h);

    // Compass circle
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, w * 0.35, 0, Math.PI * 2);
    ctx.stroke();

    // Cardinal direction labels
    ctx.fillStyle = '#adb5bd';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('E', w - 6, centerY);
    ctx.fillText('W', 6, centerY);
    ctx.fillText('N', centerX, 7);
    ctx.fillText('S', centerX, h - 7);

    // Light arrow
    const angleRad = (this.lightAngle * Math.PI) / 180;
    const arrowLength = w * 0.3;
    const arrowEndX = centerX + Math.cos(angleRad) * arrowLength;
    const arrowEndY = centerY + Math.sin(angleRad) * arrowLength;

    // Arrow shaft
    ctx.strokeStyle = '#ffa500';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(arrowEndX, arrowEndY);
    ctx.stroke();

    // Arrow head
    const headSize = 6;
    const headAngle1 = angleRad + Math.PI * 0.75;
    const headAngle2 = angleRad - Math.PI * 0.75;

    ctx.fillStyle = '#ffa500';
    ctx.beginPath();
    ctx.moveTo(arrowEndX, arrowEndY);
    ctx.lineTo(arrowEndX + Math.cos(headAngle1) * headSize, arrowEndY + Math.sin(headAngle1) * headSize);
    ctx.lineTo(arrowEndX + Math.cos(headAngle2) * headSize, arrowEndY + Math.sin(headAngle2) * headSize);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Gradient Hatch Preview
 * Shows a circle with gradient hatching based on light direction
 */
class GradientHatchPreview {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    // Default parameters
    this.lightAngle = 45;
    this.lightStrength = 0.8;
    this.baseWeight = 0.2;
    this.shadowSoftness = 0.5;
    this.hatchAngles = [0, 90];
    this.hatchSpacing = 2; // In pixels for preview

    this.draw();
  }

  update(lightAngle, lightStrength, baseWeight, shadowSoftness, hatchAngles, hatchSpacing) {
    this.lightAngle = lightAngle;
    this.lightStrength = lightStrength;
    this.baseWeight = baseWeight;
    this.shadowSoftness = shadowSoftness;
    this.hatchAngles = hatchAngles;
    this.hatchSpacing = hatchSpacing * 3; // Scale for visibility
    this.draw();
  }

  draw() {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Draw circle with gradient hatching
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.min(w, h) * 0.35;

    // Convert light angle to direction vector
    const lightAngleRad = (this.lightAngle * Math.PI) / 180;
    const lightDirX = Math.cos(lightAngleRad);
    const lightDirY = Math.sin(lightAngleRad);

    // Draw hatches for each angle
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 0.8;

    this.hatchAngles.forEach(hatchAngle => {
      const angleRad = (hatchAngle * Math.PI) / 180;

      // Sample points around the circle
      const numSamples = 64;
      for (let i = 0; i < numSamples; i++) {
        const theta = (i / numSamples) * Math.PI * 2;
        const pointX = centerX + Math.cos(theta) * radius;
        const pointY = centerY + Math.sin(theta) * radius;

        // Surface normal at this point (points outward from center)
        const nx = Math.cos(theta);
        const ny = Math.sin(theta);

        // Calculate lighting weight
        const dotProduct = nx * lightDirX + ny * lightDirY;
        let rawWeight = (1 - Math.abs(dotProduct)) * this.lightStrength + this.baseWeight;

        // Apply softness
        if (this.shadowSoftness > 0) {
          rawWeight = this.smoothstep(this.baseWeight, 1.0, rawWeight);
        }

        const weight = Math.max(0, Math.min(1, rawWeight));

        // Determine if we should draw a hatch here
        // Higher weight = denser hatching = smaller spacing
        const effectiveSpacing = this.hatchSpacing / Math.max(weight, 0.1);

        // Use deterministic pattern based on position
        if (i % Math.max(1, Math.round(effectiveSpacing)) === 0) {
          // Draw hatch line at this point
          const hatchLength = radius * 0.4;
          const dx = Math.cos(angleRad) * hatchLength;
          const dy = Math.sin(angleRad) * hatchLength;

          ctx.beginPath();
          ctx.moveTo(pointX - dx, pointY - dy);
          ctx.lineTo(pointX + dx, pointY + dy);
          ctx.stroke();
        }
      }
    });

    // Draw circle outline for context
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw light direction indicator
    const arrowLength = radius * 1.3;
    const arrowX = centerX + lightDirX * arrowLength;
    const arrowY = centerY + lightDirY * arrowLength;

    ctx.strokeStyle = '#ffa500';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(arrowX, arrowY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Light source indicator
    ctx.fillStyle = '#ffeb3b';
    ctx.strokeStyle = '#ffa500';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(arrowX, arrowY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }
}

// Initialize preview when DOM loads
let paramPreview = null;
let crosshatchPreview = null;
let gradientPreview = null;
let lightIndicator = null;

document.addEventListener('DOMContentLoaded', () => {
  paramPreview = new ParameterPreview('param-preview-canvas');
  crosshatchPreview = new CrosshatchPreview('crosshatch-preview-canvas');
  gradientPreview = new GradientHatchPreview('gradient-preview-canvas');
  lightIndicator = new LightDirectionIndicator('light-direction-indicator');

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
