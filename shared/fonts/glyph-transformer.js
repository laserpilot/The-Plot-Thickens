/**
 * Glyph Transformer
 * Transforms glyph path data for placement along a path with rotation, scaling, and compression
 */

/**
 * Parse SVG path commands into an array of command objects
 * @param {string} pathData - SVG path d attribute
 * @returns {Array} Array of {type, args} objects
 */
function parsePathCommands(pathData) {
  if (!pathData) return [];
  const commands = pathData.match(/[A-Za-z][^A-Za-z]*/g) || [];
  return commands.map(cmd => ({
    type: cmd[0],
    args: cmd.slice(1).trim().split(/[ ,]+/).filter(s => s).map(parseFloat)
  }));
}

/**
 * Transform a point from glyph space to world space
 * Glyph space: origin at baseline, Y increases upward
 * World space: placed at position, rotated to follow tangent, scaled and compressed
 *
 * @param {number} glyphX - X coordinate in glyph space (font units)
 * @param {number} glyphY - Y coordinate in glyph space (font units)
 * @param {Object} transform - Transform parameters
 * @returns {Object} {x, y} in world space
 */
function transformPoint(glyphX, glyphY, transform) {
  const {
    posX, posY,           // Position on the centerline
    tangentX, tangentY,   // Normalized tangent vector (direction of path)
    normalX, normalY,     // Normalized normal vector (perpendicular to tangent)
    scale,                // Scale factor (fontSize / unitsPerEm)
    compression,          // Horizontal compression factor (0-1, 1 = no compression)
    unitsPerEm,
  } = transform;

  // Convert from font units to scaled units
  // Note: SVG fonts have Y increasing upward, but in our output Y increases downward
  // So we negate the Y coordinate
  const scaledX = (glyphX / unitsPerEm) * scale * compression;
  const scaledY = -(glyphY / unitsPerEm) * scale;  // Negate for coordinate flip

  // Rotate by tangent angle and translate to position
  // The glyph's X axis aligns with the tangent (path direction)
  // The glyph's Y axis aligns with the normal (perpendicular to path)
  const worldX = posX + scaledX * tangentX + scaledY * normalX;
  const worldY = posY + scaledX * tangentY + scaledY * normalY;

  return { x: worldX, y: worldY };
}

/**
 * Transform a complete glyph path for placement at a position along a path
 *
 * @param {string} glyphPath - SVG path d attribute from the glyph
 * @param {Object} position - Placement info {x, y, tx, ty, nx, ny}
 * @param {number} scale - Scale factor (fontSize / unitsPerEm * envelopeMultiplier)
 * @param {number} compression - Horizontal compression factor (0-1)
 * @param {number} unitsPerEm - Font units per em
 * @returns {string} Transformed SVG path string
 */
export function transformGlyph(glyphPath, position, scale, compression, unitsPerEm) {
  if (!glyphPath) return '';

  const commands = parsePathCommands(glyphPath);
  if (commands.length === 0) return '';

  const transform = {
    posX: position.x,
    posY: position.y,
    tangentX: position.tx,
    tangentY: position.ty,
    normalX: position.nx,
    normalY: position.ny,
    scale,
    compression,
    unitsPerEm,
  };

  let result = '';
  let currentGlyphX = 0;
  let currentGlyphY = 0;
  let prevControlX = null;
  let prevControlY = null;

  for (const cmd of commands) {
    const { type, args } = cmd;

    switch (type) {
      case 'M': { // Move to (absolute)
        currentGlyphX = args[0];
        currentGlyphY = args[1];
        const pt = transformPoint(currentGlyphX, currentGlyphY, transform);
        result += `M ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        prevControlX = null;
        prevControlY = null;
        break;
      }

      case 'm': { // Move to (relative)
        currentGlyphX += args[0];
        currentGlyphY += args[1];
        const pt = transformPoint(currentGlyphX, currentGlyphY, transform);
        result += `M ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        prevControlX = null;
        prevControlY = null;
        break;
      }

      case 'L': { // Line to (absolute)
        currentGlyphX = args[0];
        currentGlyphY = args[1];
        const pt = transformPoint(currentGlyphX, currentGlyphY, transform);
        result += `L ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        prevControlX = null;
        prevControlY = null;
        break;
      }

      case 'l': { // Line to (relative)
        currentGlyphX += args[0];
        currentGlyphY += args[1];
        const pt = transformPoint(currentGlyphX, currentGlyphY, transform);
        result += `L ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        prevControlX = null;
        prevControlY = null;
        break;
      }

      case 'H': { // Horizontal line to (absolute)
        currentGlyphX = args[0];
        const pt = transformPoint(currentGlyphX, currentGlyphY, transform);
        result += `L ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        prevControlX = null;
        prevControlY = null;
        break;
      }

      case 'h': { // Horizontal line to (relative)
        currentGlyphX += args[0];
        const pt = transformPoint(currentGlyphX, currentGlyphY, transform);
        result += `L ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        prevControlX = null;
        prevControlY = null;
        break;
      }

      case 'V': { // Vertical line to (absolute)
        currentGlyphY = args[0];
        const pt = transformPoint(currentGlyphX, currentGlyphY, transform);
        result += `L ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        prevControlX = null;
        prevControlY = null;
        break;
      }

      case 'v': { // Vertical line to (relative)
        currentGlyphY += args[0];
        const pt = transformPoint(currentGlyphX, currentGlyphY, transform);
        result += `L ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        prevControlX = null;
        prevControlY = null;
        break;
      }

      case 'C': { // Cubic bezier (absolute)
        const cp1x = args[0], cp1y = args[1];
        const cp2x = args[2], cp2y = args[3];
        const endx = args[4], endy = args[5];

        const p1 = transformPoint(cp1x, cp1y, transform);
        const p2 = transformPoint(cp2x, cp2y, transform);
        const p3 = transformPoint(endx, endy, transform);

        result += `C ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} ${p2.x.toFixed(3)} ${p2.y.toFixed(3)} ${p3.x.toFixed(3)} ${p3.y.toFixed(3)} `;

        currentGlyphX = endx;
        currentGlyphY = endy;
        prevControlX = cp2x;
        prevControlY = cp2y;
        break;
      }

      case 'c': { // Cubic bezier (relative)
        const cp1x = currentGlyphX + args[0], cp1y = currentGlyphY + args[1];
        const cp2x = currentGlyphX + args[2], cp2y = currentGlyphY + args[3];
        const endx = currentGlyphX + args[4], endy = currentGlyphY + args[5];

        const p1 = transformPoint(cp1x, cp1y, transform);
        const p2 = transformPoint(cp2x, cp2y, transform);
        const p3 = transformPoint(endx, endy, transform);

        result += `C ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} ${p2.x.toFixed(3)} ${p2.y.toFixed(3)} ${p3.x.toFixed(3)} ${p3.y.toFixed(3)} `;

        currentGlyphX = endx;
        currentGlyphY = endy;
        prevControlX = cp2x;
        prevControlY = cp2y;
        break;
      }

      case 'S': { // Smooth cubic bezier (absolute)
        // Reflect previous control point
        const cp1x = prevControlX !== null ? 2 * currentGlyphX - prevControlX : currentGlyphX;
        const cp1y = prevControlY !== null ? 2 * currentGlyphY - prevControlY : currentGlyphY;
        const cp2x = args[0], cp2y = args[1];
        const endx = args[2], endy = args[3];

        const p1 = transformPoint(cp1x, cp1y, transform);
        const p2 = transformPoint(cp2x, cp2y, transform);
        const p3 = transformPoint(endx, endy, transform);

        result += `C ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} ${p2.x.toFixed(3)} ${p2.y.toFixed(3)} ${p3.x.toFixed(3)} ${p3.y.toFixed(3)} `;

        currentGlyphX = endx;
        currentGlyphY = endy;
        prevControlX = cp2x;
        prevControlY = cp2y;
        break;
      }

      case 's': { // Smooth cubic bezier (relative)
        const cp1x = prevControlX !== null ? 2 * currentGlyphX - prevControlX : currentGlyphX;
        const cp1y = prevControlY !== null ? 2 * currentGlyphY - prevControlY : currentGlyphY;
        const cp2x = currentGlyphX + args[0], cp2y = currentGlyphY + args[1];
        const endx = currentGlyphX + args[2], endy = currentGlyphY + args[3];

        const p1 = transformPoint(cp1x, cp1y, transform);
        const p2 = transformPoint(cp2x, cp2y, transform);
        const p3 = transformPoint(endx, endy, transform);

        result += `C ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} ${p2.x.toFixed(3)} ${p2.y.toFixed(3)} ${p3.x.toFixed(3)} ${p3.y.toFixed(3)} `;

        currentGlyphX = endx;
        currentGlyphY = endy;
        prevControlX = cp2x;
        prevControlY = cp2y;
        break;
      }

      case 'Q': { // Quadratic bezier (absolute)
        const cpx = args[0], cpy = args[1];
        const endx = args[2], endy = args[3];

        const p1 = transformPoint(cpx, cpy, transform);
        const p2 = transformPoint(endx, endy, transform);

        result += `Q ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} ${p2.x.toFixed(3)} ${p2.y.toFixed(3)} `;

        currentGlyphX = endx;
        currentGlyphY = endy;
        prevControlX = cpx;
        prevControlY = cpy;
        break;
      }

      case 'q': { // Quadratic bezier (relative)
        const cpx = currentGlyphX + args[0], cpy = currentGlyphY + args[1];
        const endx = currentGlyphX + args[2], endy = currentGlyphY + args[3];

        const p1 = transformPoint(cpx, cpy, transform);
        const p2 = transformPoint(endx, endy, transform);

        result += `Q ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} ${p2.x.toFixed(3)} ${p2.y.toFixed(3)} `;

        currentGlyphX = endx;
        currentGlyphY = endy;
        prevControlX = cpx;
        prevControlY = cpy;
        break;
      }

      case 'Z':
      case 'z': {
        result += 'Z ';
        prevControlX = null;
        prevControlY = null;
        break;
      }

      default:
        // Skip unsupported commands
        break;
    }
  }

  return result.trim();
}

/**
 * Calculate curvature at a point on the centerline
 * Positive = turning left, negative = turning right
 *
 * @param {Object} prev - Previous centerline point {tx, ty}
 * @param {Object} curr - Current centerline point {tx, ty}
 * @param {Object} next - Next centerline point {tx, ty}
 * @returns {number} Curvature value (-1 to 1)
 */
export function calculateCurvature(prev, curr, next) {
  if (!prev || !next) return 0;

  // Cross product of adjacent tangent vectors
  const cross = prev.tx * next.ty - prev.ty * next.tx;

  // Clamp to reasonable range
  return Math.max(-1, Math.min(1, cross * 10));
}
