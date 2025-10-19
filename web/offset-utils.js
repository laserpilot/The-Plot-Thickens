/**
 * Browser-compatible offset utilities
 * Proper perpendicular offset implementation for web interface
 */

/**
 * Simple 1D Perlin-like noise generator for smooth variation
 */
function simpleNoise(x, seed = 0) {
  const n = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/**
 * Simple string hash function
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 100); i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Generate proper perpendicular offset using point sampling
 * This is a browser-compatible version that works with our parsed points
 */
function generateOffsetPath(pathPoints, offset, noise, seed) {
  if (!pathPoints || pathPoints.length < 2) {
    return null;
  }

  const offsetPoints = [];

  for (let i = 0; i < pathPoints.length; i++) {
    const pt = pathPoints[i];

    // Skip move markers
    if (pt.move) {
      offsetPoints.push({ ...pt });
      continue;
    }

    // Calculate tangent from neighboring points
    let p1, p2;

    if (i === 0) {
      p1 = pathPoints[0];
      p2 = pathPoints[Math.min(1, pathPoints.length - 1)];
    } else if (i === pathPoints.length - 1) {
      p1 = pathPoints[Math.max(0, i - 1)];
      p2 = pathPoints[i];
    } else {
      p1 = pathPoints[i - 1];
      p2 = pathPoints[i + 1];
    }

    // Tangent vector
    const tx = p2.x - p1.x;
    const ty = p2.y - p1.y;
    const tLen = Math.sqrt(tx * tx + ty * ty);

    if (tLen === 0) {
      offsetPoints.push({ ...pt });
      continue;
    }

    // Normal vector (perpendicular, pointing "right")
    const nx = -ty / tLen;
    const ny = tx / tLen;

    // Add smooth noise
    const arcLength = i * 10; // Approximate arc length
    const noiseValue = noise > 0 ? simpleNoise(arcLength / 10, seed) * noise : 0;
    const totalOffset = offset + noiseValue;

    // Offset point
    offsetPoints.push({
      x: pt.x + nx * totalOffset,
      y: pt.y + ny * totalOffset,
      move: pt.move
    });
  }

  return offsetPoints;
}

/**
 * Convert points array to SVG path string
 */
function pointsToPathString(points) {
  if (!points || points.length === 0) return '';

  let pathStr = '';
  let firstInSubpath = true;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];

    if (pt.move) {
      pathStr += `M ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
      firstInSubpath = true;
    } else {
      if (firstInSubpath) {
        pathStr += `M ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
        firstInSubpath = false;
      } else {
        pathStr += `L ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} `;
      }
    }
  }

  return pathStr.trim();
}
