/**
 * Calibration Pattern Generator
 * Creates test patterns for visualizing different line weight settings
 */

class CalibrationGenerator {
  constructor() {
    this.config = {
      // Test ranges
      baseOffsetMin: 0.1,
      baseOffsetMax: 0.5,
      baseOffsetSteps: 5,

      noiseMin: 0.0,
      noiseMax: 0.3,
      noiseSteps: 4,

      passCounts: [3, 5, 10, 20],

      // Pattern settings
      cellSize: 50, // Size of each test cell in mm
      cellPadding: 5, // Padding inside each cell
      labelSize: 3, // Text size for labels

      // Test shapes
      includeCircle: true,
      includeLine: true,
      includeCurve: true,
      includeCorner: true,
    };

    this.patterns = [];
  }

  /**
   * Generate complete calibration pattern
   */
  generate() {
    this.patterns = [];

    // Generate main grid (offset × noise)
    this.generateMainGrid();

    // Generate pass count comparison
    this.generatePassCountComparison();

    return this.patterns;
  }

  /**
   * Generate main grid: Base Offset (horizontal) × Noise (vertical)
   */
  generateMainGrid() {
    const { baseOffsetMin, baseOffsetMax, baseOffsetSteps, noiseMin, noiseMax, noiseSteps, cellSize, cellPadding } = this.config;

    // Calculate values for each axis
    const offsetValues = this.linspace(baseOffsetMin, baseOffsetMax, baseOffsetSteps);
    const noiseValues = this.linspace(noiseMin, noiseMax, noiseSteps);

    const gridStartX = 20; // Left margin for labels
    const gridStartY = 30; // Top margin for title and labels

    // Add title
    this.patterns.push({
      type: 'text',
      x: gridStartX,
      y: 10,
      text: 'PLOTTER LINE WEIGHT CALIBRATION - MAIN GRID',
      size: 5,
      anchor: 'left'
    });

    // Add axis labels
    this.patterns.push({
      type: 'text',
      x: gridStartX + (offsetValues.length * cellSize) / 2,
      y: 20,
      text: 'Base Offset (mm) →',
      size: 3,
      anchor: 'middle'
    });

    this.patterns.push({
      type: 'text',
      x: gridStartX - 10,
      y: gridStartY + (noiseValues.length * cellSize) / 2,
      text: 'Noise (mm)',
      size: 3,
      anchor: 'middle',
      rotate: -90
    });

    // Generate grid cells
    offsetValues.forEach((offset, col) => {
      noiseValues.forEach((noise, row) => {
        const cellX = gridStartX + col * cellSize;
        const cellY = gridStartY + row * cellSize;

        // Cell border
        this.patterns.push({
          type: 'rect',
          x: cellX,
          y: cellY,
          width: cellSize,
          height: cellSize,
          stroke: '#cccccc',
          strokeWidth: 0.1
        });

        // Column label (top row only)
        if (row === 0) {
          this.patterns.push({
            type: 'text',
            x: cellX + cellSize / 2,
            y: cellY - 2,
            text: offset.toFixed(2),
            size: 2.5,
            anchor: 'middle'
          });
        }

        // Row label (first column only)
        if (col === 0) {
          this.patterns.push({
            type: 'text',
            x: cellX - 2,
            y: cellY + cellSize / 2,
            text: noise.toFixed(2),
            size: 2.5,
            anchor: 'end'
          });
        }

        // Generate test shapes for this cell
        this.generateCellPatterns(cellX + cellPadding, cellY + cellPadding, cellSize - cellPadding * 2, offset, noise, 5);
      });
    });
  }

  /**
   * Generate pass count comparison section
   */
  generatePassCountComparison() {
    const { passCounts, cellSize } = this.config;
    const baseOffset = 0.2; // Standard offset for comparison
    const noise = 0.1; // Standard noise for comparison

    const sectionStartY = 30 + this.config.noiseSteps * cellSize + 20;
    const sectionStartX = 20;

    // Section title
    this.patterns.push({
      type: 'text',
      x: sectionStartX,
      y: sectionStartY,
      text: `PASS COUNT COMPARISON (Offset: ${baseOffset}mm, Noise: ${noise}mm)`,
      size: 4,
      anchor: 'left'
    });

    // Generate comparison for each pass count
    passCounts.forEach((passes, index) => {
      const cellX = sectionStartX + index * cellSize;
      const cellY = sectionStartY + 10;

      // Label
      this.patterns.push({
        type: 'text',
        x: cellX + cellSize / 2,
        y: cellY - 2,
        text: `${passes} passes`,
        size: 2.5,
        anchor: 'middle'
      });

      // Cell border
      this.patterns.push({
        type: 'rect',
        x: cellX,
        y: cellY,
        width: cellSize,
        height: cellSize,
        stroke: '#cccccc',
        strokeWidth: 0.1
      });

      // Test patterns
      this.generateCellPatterns(cellX + this.config.cellPadding, cellY + this.config.cellPadding,
                                cellSize - this.config.cellPadding * 2, baseOffset, noise, passes);
    });
  }

  /**
   * Generate test patterns within a single cell
   */
  generateCellPatterns(x, y, size, offset, noise, passes) {
    const shapes = [];
    let shapeY = y;
    const shapeHeight = size / 4; // Divide cell into sections for each shape

    // Circle
    if (this.config.includeCircle) {
      shapes.push({
        type: 'circle',
        cx: x + size / 2,
        cy: shapeY + shapeHeight / 2,
        r: Math.min(shapeHeight, size / 2) * 0.3
      });
      shapeY += shapeHeight;
    }

    // Straight line
    if (this.config.includeLine) {
      shapes.push({
        type: 'line',
        x1: x + size * 0.2,
        y1: shapeY + shapeHeight / 2,
        x2: x + size * 0.8,
        y2: shapeY + shapeHeight / 2
      });
      shapeY += shapeHeight;
    }

    // S-curve
    if (this.config.includeCurve) {
      const curvePoints = this.generateSCurve(x + size * 0.2, shapeY + shapeHeight / 2, size * 0.6, shapeHeight * 0.6);
      shapes.push({
        type: 'path',
        points: curvePoints
      });
      shapeY += shapeHeight;
    }

    // Corner (L-shape)
    if (this.config.includeCorner) {
      shapes.push({
        type: 'polyline',
        points: [
          { x: x + size * 0.3, y: shapeY + shapeHeight * 0.7 },
          { x: x + size * 0.3, y: shapeY + shapeHeight * 0.3 },
          { x: x + size * 0.7, y: shapeY + shapeHeight * 0.3 }
        ]
      });
    }

    // Process each shape with offset and noise
    shapes.forEach(shape => {
      this.addProcessedShape(shape, offset, noise, passes);
    });
  }

  /**
   * Add a shape with offset processing applied
   */
  addProcessedShape(shape, offset, noise, passes) {
    // Convert shape to points
    let points;

    switch (shape.type) {
      case 'circle':
        points = this.circleToPoints(shape.cx, shape.cy, shape.r);
        break;
      case 'line':
        points = [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }];
        break;
      case 'path':
        points = shape.points;
        break;
      case 'polyline':
        points = shape.points;
        break;
      default:
        return;
    }

    // Generate deterministic seed for this shape
    const seed = Math.abs(Math.floor(shape.cx || shape.x1 || points[0].x) * 1000);

    // Generate offset duplicates
    for (let i = 0; i < passes; i++) {
      const passIndex = Math.floor(i / 2);
      const isRight = i % 2 === 0;
      const direction = isRight ? 1 : -1;

      const offsetDistance = direction * passIndex * offset;
      const passSeed = seed + i;

      const offsetPoints = generateOffsetPath(points, offsetDistance, noise, passSeed);

      if (offsetPoints && offsetPoints.length > 0) {
        this.patterns.push({
          type: 'processed-path',
          points: offsetPoints,
          stroke: 'black',
          strokeWidth: 0.1
        });
      }
    }
  }

  /**
   * Generate S-curve points
   */
  generateSCurve(x, y, width, height) {
    const points = [];
    const steps = 20;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x + width * t;
      const py = y + height * Math.sin(t * Math.PI * 2) * 0.5;
      points.push({ x: px, y: py });
    }

    return points;
  }

  /**
   * Convert circle to points
   */
  circleToPoints(cx, cy, r, segments = 32) {
    const points = [];

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push({
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle)
      });
    }

    return points;
  }

  /**
   * Generate linearly spaced values
   */
  linspace(start, end, steps) {
    const values = [];
    for (let i = 0; i < steps; i++) {
      values.push(start + (end - start) * i / (steps - 1));
    }
    return values;
  }

  /**
   * Build SVG from patterns
   */
  toSVG() {
    // Calculate bounds
    const gridWidth = this.config.baseOffsetSteps * this.config.cellSize;
    const gridHeight = this.config.noiseSteps * this.config.cellSize;
    const passCompHeight = this.config.cellSize + 20;

    const totalWidth = Math.max(gridWidth, this.config.passCounts.length * this.config.cellSize) + 40;
    const totalHeight = gridHeight + passCompHeight + 60;

    const parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
    parts.push(`<svg width="${totalWidth}mm" height="${totalHeight}mm" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">`);
    parts.push('  <!-- Calibration Pattern Generator -->');

    // Render all patterns
    this.patterns.forEach(pattern => {
      switch (pattern.type) {
        case 'text':
          const anchor = pattern.anchor || 'middle';
          const rotate = pattern.rotate || 0;
          const transform = rotate !== 0 ? ` transform="rotate(${rotate}, ${pattern.x}, ${pattern.y})"` : '';
          parts.push(`  <text x="${pattern.x}" y="${pattern.y}" font-size="${pattern.size}" text-anchor="${anchor}" fill="black"${transform}>${pattern.text}</text>`);
          break;

        case 'rect':
          parts.push(`  <rect x="${pattern.x}" y="${pattern.y}" width="${pattern.width}" height="${pattern.height}" fill="none" stroke="${pattern.stroke}" stroke-width="${pattern.strokeWidth}" />`);
          break;

        case 'processed-path':
          const pathData = pointsToPathString(pattern.points);
          if (pathData) {
            parts.push(`  <path d="${pathData}" fill="none" stroke="${pattern.stroke}" stroke-width="${pattern.strokeWidth}" />`);
          }
          break;
      }
    });

    parts.push('</svg>');
    return parts.join('\n');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
  }
}
