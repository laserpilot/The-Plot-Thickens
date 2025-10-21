/**
 * SVG Parser for web interface
 * Extracts paths from uploaded SVG files
 */

class SVGParser {
  constructor() {
    this.paths = [];
    this.viewBox = { x: 0, y: 0, width: 100, height: 100 };
    this.width = 100;
    this.height = 100;
  }

  /**
   * Quick parse: Extract SVG structure without processing paths to points
   * Fast preview to show path count before heavy processing
   */
  quickParseSVG(svgContent) {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = svgDoc.querySelector('svg');

    if (!svgElement) {
      throw new Error('Invalid SVG: No <svg> element found');
    }

    // Extract viewBox
    const viewBoxAttr = svgElement.getAttribute('viewBox');
    if (viewBoxAttr) {
      const [x, y, w, h] = viewBoxAttr.split(/\s+/).map(parseFloat);
      this.viewBox = { x, y, width: w, height: h };
    }

    // Extract width/height
    const widthAttr = svgElement.getAttribute('width');
    const heightAttr = svgElement.getAttribute('height');

    this.width = widthAttr ? this.parseUnit(widthAttr) : this.viewBox.width;
    this.height = heightAttr ? this.parseUnit(heightAttr) : this.viewBox.height;

    // Count path elements
    const pathElements = svgDoc.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon');

    // Store raw data for later processing
    const rawPaths = [];
    pathElements.forEach((element, index) => {
      let pathData = element.getAttribute('d');

      // Convert basic shapes to path data
      if (!pathData) {
        pathData = this.shapeToPath(element);
      }

      if (pathData) {
        // Get attributes
        let stroke = element.getAttribute('stroke');
        const fill = element.getAttribute('fill');
        const strokeWidth = element.getAttribute('stroke-width') || '0.3';

        // Skip patterns/gradients
        if (stroke && (stroke.startsWith('url(') || stroke.includes('#PATTERN'))) {
          return;
        }

        if ((!stroke || stroke === 'none') && fill && fill !== 'none') {
          stroke = fill;
        } else if (!stroke) {
          stroke = 'black';
        }

        rawPaths.push({
          id: index,
          d: pathData,
          stroke,
          fill: 'none',
          strokeWidth: parseFloat(strokeWidth),
        });
      }
    });

    console.log(`Quick parse: Found ${rawPaths.length} valid paths`);

    return {
      paths: rawPaths,
      pathCount: rawPaths.length,
      viewBox: this.viewBox,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Process raw paths to points (heavy operation)
   * Can be called with progress callback for chunked processing
   */
  async processPathsToPoints(rawPaths, progressCallback = null) {
    console.log(`Processing ${rawPaths.length} paths to points...`);
    const processedPaths = [];
    const chunkSize = 25; // Process in batches to allow UI updates

    for (let chunkStart = 0; chunkStart < rawPaths.length; chunkStart += chunkSize) {
      const chunkEnd = Math.min(chunkStart + chunkSize, rawPaths.length);
      const chunk = rawPaths.slice(chunkStart, chunkEnd);

      // Process chunk
      chunk.forEach((path, chunkIndex) => {
        const index = chunkStart + chunkIndex;
        const points = this.pathToPoints(path.d);
        const length = this.estimatePathLength(points);

        // Debug logging for first few paths only
        if (index < 3) {
          console.log(`Path ${index}: ${points.length} points, length=${length.toFixed(2)}`);
        }

        // Skip paths with no valid points
        if (points.length === 0) {
          console.warn(`Skipping path ${index}: no points generated`);
          return;
        }

        if (points.length === 1 && points[0].x === 0 && points[0].y === 0) {
          console.warn(`Skipping path ${index}: only fallback point (0,0)`);
          return;
        }

        processedPaths.push({
          ...path,
          points,
          length,
        });
      });

      // Report progress
      if (progressCallback) {
        progressCallback(chunkEnd, rawPaths.length);
      }

      // Yield to UI thread between chunks
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    console.log(`Processed ${processedPaths.length} paths successfully`);
    this.paths = processedPaths;

    return {
      paths: processedPaths,
      viewBox: this.viewBox,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Parse SVG content from file (original full parse method)
   */
  parseSVGContent(svgContent) {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = svgDoc.querySelector('svg');

    if (!svgElement) {
      throw new Error('Invalid SVG: No <svg> element found');
    }

    // Extract viewBox
    const viewBoxAttr = svgElement.getAttribute('viewBox');
    if (viewBoxAttr) {
      const [x, y, w, h] = viewBoxAttr.split(/\s+/).map(parseFloat);
      this.viewBox = { x, y, width: w, height: h };
    }

    // Extract width/height
    const widthAttr = svgElement.getAttribute('width');
    const heightAttr = svgElement.getAttribute('height');

    this.width = widthAttr ? this.parseUnit(widthAttr) : this.viewBox.width;
    this.height = heightAttr ? this.parseUnit(heightAttr) : this.viewBox.height;

    // Extract all path elements and convert shapes to paths
    const pathElements = svgDoc.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon');
    console.log(`Found ${pathElements.length} path/shape elements in SVG`);
    this.paths = [];

    pathElements.forEach((element, index) => {
      let pathData = element.getAttribute('d');

      // Convert basic shapes to path data
      if (!pathData) {
        pathData = this.shapeToPath(element);
      }

      if (pathData) {
        // Get stroke/fill attributes - prioritize stroke over fill
        let stroke = element.getAttribute('stroke');
        const fill = element.getAttribute('fill');
        const strokeWidth = element.getAttribute('stroke-width') || '0.3';

        // Skip paths with pattern/gradient strokes (usually page borders)
        if (stroke && (stroke.startsWith('url(') || stroke.includes('#PATTERN'))) {
          console.log(`Skipping path ${index}: pattern/gradient stroke`);
          return;
        }

        // If filled but no stroke, use fill color as stroke
        if ((!stroke || stroke === 'none') && fill && fill !== 'none') {
          stroke = fill;
        } else if (!stroke) {
          stroke = 'black';
        }

        const points = this.pathToPoints(pathData);
        const length = this.estimatePathLength(points);

        // Debug logging for first few paths only (reduce log spam)
        if (index < 3) {
          console.log(`Path ${index}: ${points.length} points, length=${length.toFixed(2)}`);
        }

        // Skip paths with no valid points
        if (points.length === 0) {
          console.warn(`Skipping path ${index}: no points generated`);
          return;
        }

        if (points.length === 1 && points[0].x === 0 && points[0].y === 0) {
          console.warn(`Skipping path ${index}: only fallback point (0,0)`);
          return;
        }

        this.paths.push({
          id: index,
          d: pathData,
          stroke,
          fill: 'none', // Always set fill to none for plotter output
          strokeWidth: parseFloat(strokeWidth),
          points,
          length,
        });
      }
    });

    console.log(`Parsed ${this.paths.length} paths from SVG`);
    return {
      paths: this.paths,
      viewBox: this.viewBox,
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Convert SVG shape elements to path data
   */
  shapeToPath(element) {
    const tagName = element.tagName.toLowerCase();

    switch (tagName) {
      case 'rect': {
        const x = parseFloat(element.getAttribute('x') || 0);
        const y = parseFloat(element.getAttribute('y') || 0);
        const w = parseFloat(element.getAttribute('width') || 0);
        const h = parseFloat(element.getAttribute('height') || 0);
        return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
      }

      case 'circle': {
        const cx = parseFloat(element.getAttribute('cx') || 0);
        const cy = parseFloat(element.getAttribute('cy') || 0);
        const r = parseFloat(element.getAttribute('r') || 0);
        return `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`;
      }

      case 'ellipse': {
        const cx = parseFloat(element.getAttribute('cx') || 0);
        const cy = parseFloat(element.getAttribute('cy') || 0);
        const rx = parseFloat(element.getAttribute('rx') || 0);
        const ry = parseFloat(element.getAttribute('ry') || 0);
        return `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy}`;
      }

      case 'line': {
        const x1 = parseFloat(element.getAttribute('x1') || 0);
        const y1 = parseFloat(element.getAttribute('y1') || 0);
        const x2 = parseFloat(element.getAttribute('x2') || 0);
        const y2 = parseFloat(element.getAttribute('y2') || 0);
        return `M ${x1} ${y1} L ${x2} ${y2}`;
      }

      case 'polyline':
      case 'polygon': {
        const points = element.getAttribute('points');
        if (!points) return null;

        const coords = points.trim().split(/[\s,]+/).map(parseFloat);
        if (coords.length < 2) return null;

        let path = `M ${coords[0]} ${coords[1]}`;
        for (let i = 2; i < coords.length; i += 2) {
          path += ` L ${coords[i]} ${coords[i + 1]}`;
        }

        if (tagName === 'polygon') {
          path += ' Z';
        }

        return path;
      }

      default:
        return null;
    }
  }

  /**
   * Parse unit values (handle mm, px, etc.)
   */
  parseUnit(value) {
    const num = parseFloat(value);
    if (value.includes('mm')) {
      return num; // Keep mm as-is
    }
    return num;
  }

  /**
   * Convert SVG path to array of points for rendering
   * Uses arc-length based sampling for efficient, high-quality output
   * @param {string} pathData - SVG path data string
   * @param {boolean} highQuality - If true, use higher resolution for export (default: false for preview)
   */
  pathToPoints(pathData, highQuality = false) {
    try {
      // Use svg-path-commander for proper arc-length sampling
      if (typeof SVGPathCommander !== 'undefined') {
        return this.pathToPointsArcLength(pathData, highQuality);
      }

      // Fallback to manual parsing if library not available
      return this.pathToPointsManual(pathData);
    } catch (error) {
      console.warn('Failed to parse path:', pathData.substring(0, 50), error);
      return [{ x: 0, y: 0 }];
    }
  }

  /**
   * Arc-length based sampling using svg-path-commander
   * Adaptive sampling: longer paths use larger intervals to avoid over-sampling
   * @param {string} pathData - SVG path data string
   * @param {boolean} highQuality - If true, use higher resolution for export (default: false for preview)
   */
  pathToPointsArcLength(pathData, highQuality = false) {
    const points = [];

    try {
      const absolutePath = SVGPathCommander.pathToAbsolute(pathData);
      const totalLength = SVGPathCommander.getTotalLength(absolutePath);

      if (totalLength === 0 || isNaN(totalLength)) {
        return [{ x: 0, y: 0 }];
      }

      // Choose sampling density based on quality mode
      let maxSamples, stride, numSamples;

      if (highQuality) {
        // High-quality export: use sample rate from UI (default 2mm)
        // Get sample rate from UI if available, otherwise use 2mm default
        const sampleRateInput = typeof document !== 'undefined' ? document.getElementById('sample-rate') : null;
        const sampleRate = sampleRateInput ? parseFloat(sampleRateInput.value) : 2;

        stride = Math.max(sampleRate, totalLength / 100);
        numSamples = Math.min(200, Math.ceil(totalLength / stride));
      } else {
        // Preview mode: faster sampling for speed (20mm stride)
        maxSamples = 50;
        stride = Math.max(20, totalLength / maxSamples);
        numSamples = Math.min(200, Math.ceil(totalLength / stride));
      }

      for (let i = 0; i <= numSamples; i++) {
        const t = (i / numSamples) * totalLength;
        const pt = SVGPathCommander.getPointAtLength(absolutePath, t);

        if (pt && !isNaN(pt.x) && !isNaN(pt.y)) {
          points.push({ x: pt.x, y: pt.y });
        }
      }

      return points.length > 0 ? points : [{ x: 0, y: 0 }];
    } catch (error) {
      console.warn('Arc-length sampling failed, using fallback');
      return this.pathToPointsManual(pathData);
    }
  }

  /**
   * Manual path parsing fallback (command-by-command)
   */
  pathToPointsManual(pathData) {
    const points = [];
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;

    try {
      // Parse commands with their parameters
      const commandRegex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
      let match;

      while ((match = commandRegex.exec(pathData)) !== null) {
        const command = match[1];
        const paramsStr = match[2].trim();

        if (!paramsStr && command.toLowerCase() !== 'z') continue;

        // Extract numbers from parameters
        const params = paramsStr.match(/-?[0-9]*\.?[0-9]+/g);
        if (!params && command.toLowerCase() !== 'z') continue;

        const numbers = params ? params.map(parseFloat) : [];
        const isRelative = command === command.toLowerCase();

        switch (command.toLowerCase()) {
          case 'm': // Move
            if (numbers.length >= 2) {
              // First coordinate pair is the move
              currentX = isRelative ? currentX + numbers[0] : numbers[0];
              currentY = isRelative ? currentY + numbers[1] : numbers[1];
              startX = currentX;
              startY = currentY;
              points.push({ x: currentX, y: currentY, move: true }); // Mark as move command

              // Remaining coordinates are implicit line-to commands (SVG spec)
              for (let i = 2; i < numbers.length; i += 2) {
                if (i + 1 < numbers.length) {
                  currentX = isRelative ? currentX + numbers[i] : numbers[i];
                  currentY = isRelative ? currentY + numbers[i + 1] : numbers[i + 1];
                  points.push({ x: currentX, y: currentY });
                }
              }
            }
            break;

          case 'l': // Line
            for (let i = 0; i < numbers.length; i += 2) {
              currentX = isRelative ? currentX + numbers[i] : numbers[i];
              currentY = isRelative ? currentY + numbers[i + 1] : numbers[i + 1];
              points.push({ x: currentX, y: currentY });
            }
            break;

          case 'h': // Horizontal line
            for (let i = 0; i < numbers.length; i++) {
              currentX = isRelative ? currentX + numbers[i] : numbers[i];
              points.push({ x: currentX, y: currentY });
            }
            break;

          case 'v': // Vertical line
            for (let i = 0; i < numbers.length; i++) {
              currentY = isRelative ? currentY + numbers[i] : numbers[i];
              points.push({ x: currentX, y: currentY });
            }
            break;

          case 'c': // Cubic bezier
            for (let i = 0; i < numbers.length; i += 6) {
              const x1 = isRelative ? currentX + numbers[i] : numbers[i];
              const y1 = isRelative ? currentY + numbers[i + 1] : numbers[i + 1];
              const x2 = isRelative ? currentX + numbers[i + 2] : numbers[i + 2];
              const y2 = isRelative ? currentY + numbers[i + 3] : numbers[i + 3];
              const x = isRelative ? currentX + numbers[i + 4] : numbers[i + 4];
              const y = isRelative ? currentY + numbers[i + 5] : numbers[i + 5];

              // Sample the curve
              for (let t = 0.1; t <= 1; t += 0.1) {
                const px = this.cubicBezier(t, currentX, x1, x2, x);
                const py = this.cubicBezier(t, currentY, y1, y2, y);
                points.push({ x: px, y: py });
              }

              currentX = x;
              currentY = y;
            }
            break;

          case 'q': // Quadratic bezier
            for (let i = 0; i < numbers.length; i += 4) {
              const x1 = isRelative ? currentX + numbers[i] : numbers[i];
              const y1 = isRelative ? currentY + numbers[i + 1] : numbers[i + 1];
              const x = isRelative ? currentX + numbers[i + 2] : numbers[i + 2];
              const y = isRelative ? currentY + numbers[i + 3] : numbers[i + 3];

              for (let t = 0.1; t <= 1; t += 0.1) {
                const px = this.quadraticBezier(t, currentX, x1, x);
                const py = this.quadraticBezier(t, currentY, y1, y);
                points.push({ x: px, y: py });
              }

              currentX = x;
              currentY = y;
            }
            break;

          case 'a': // Arc
            // Arc parameters: rx ry x-axis-rotation large-arc-flag sweep-flag x y
            for (let i = 0; i < numbers.length; i += 7) {
              if (i + 6 >= numbers.length) break;

              const rx = numbers[i];
              const ry = numbers[i + 1];
              const rotation = numbers[i + 2];
              const largeArc = numbers[i + 3];
              const sweep = numbers[i + 4];
              const x = isRelative ? currentX + numbers[i + 5] : numbers[i + 5];
              const y = isRelative ? currentY + numbers[i + 6] : numbers[i + 6];

              // Approximate arc with line segments
              // For simplicity, just sample points along the arc
              const numSamples = Math.max(3, Math.ceil(Math.max(rx, ry) / 5));

              for (let j = 1; j <= numSamples; j++) {
                const t = j / numSamples;
                // Linear interpolation as simple approximation
                const px = currentX + (x - currentX) * t;
                const py = currentY + (y - currentY) * t;
                points.push({ x: px, y: py });
              }

              currentX = x;
              currentY = y;
            }
            break;

          case 'z': // Close path
            points.push({ x: startX, y: startY });
            currentX = startX;
            currentY = startY;
            break;

          // For unsupported commands (S, T), extract coordinate pairs
          default:
            console.warn(`Unsupported path command: ${command}`);
            for (let i = 0; i < numbers.length; i += 2) {
              if (i + 1 < numbers.length) {
                const x = isRelative ? currentX + numbers[i] : numbers[i];
                const y = isRelative ? currentY + numbers[i + 1] : numbers[i + 1];
                points.push({ x, y });
                currentX = x;
                currentY = y;
              }
            }
        }
      }

      if (points.length === 0) {
        return [{ x: 0, y: 0 }];
      }

    } catch (error) {
      console.warn('Failed to parse path:', pathData.substring(0, 50), error);
      return [{ x: 0, y: 0 }];
    }

    return points;
  }

  /**
   * Cubic bezier curve calculation
   */
  cubicBezier(t, p0, p1, p2, p3) {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    return mt3 * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3 * p3;
  }

  /**
   * Quadratic bezier curve calculation
   */
  quadraticBezier(t, p0, p1, p2) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return mt2 * p0 + 2 * mt * t * p1 + t2 * p2;
  }

  /**
   * Estimate path length from pre-generated points (avoids duplicate sampling)
   */
  estimatePathLength(points) {
    let length = 0;

    for (let i = 1; i < points.length; i++) {
      // Skip if this is a move command (start of new subpath)
      if (points[i].move) {
        continue;
      }

      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;

      // Validate coordinates
      if (isNaN(dx) || isNaN(dy) || !isFinite(dx) || !isFinite(dy)) {
        continue;
      }

      length += Math.sqrt(dx * dx + dy * dy);
    }

    return length;
  }

  /**
   * Get bounding box of all paths
   */
  getBounds() {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    this.paths.forEach(path => {
      if (!path.points || path.points.length === 0) return;

      path.points.forEach(pt => {
        // Skip invalid points
        if (isNaN(pt.x) || isNaN(pt.y) || !isFinite(pt.x) || !isFinite(pt.y)) {
          return;
        }

        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      });
    });

    // Fallback to viewBox if bounds are invalid
    if (!isFinite(minX) || !isFinite(maxX)) {
      console.warn('Invalid bounds calculated, using viewBox');
      return {
        minX: this.viewBox.x,
        minY: this.viewBox.y,
        maxX: this.viewBox.x + this.viewBox.width,
        maxY: this.viewBox.y + this.viewBox.height
      };
    }

    const bounds = { minX, minY, maxX, maxY };

    // Sanity check: compare bounds to viewBox
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    const viewBoxArea = this.viewBox.width * this.viewBox.height;
    const boundsArea = boundsWidth * boundsHeight;

    // If bounds are more than 3x the viewBox area, something is probably wrong
    if (boundsArea > viewBoxArea * 3) {
      console.warn('Calculated bounds seem too large compared to viewBox');
      console.warn(`ViewBox: ${this.viewBox.width} x ${this.viewBox.height} (area: ${viewBoxArea.toFixed(0)})`);
      console.warn(`Bounds: ${boundsWidth.toFixed(0)} x ${boundsHeight.toFixed(0)} (area: ${boundsArea.toFixed(0)})`);
      console.warn('Consider using viewBox for rendering');
    }

    return bounds;
  }
}
