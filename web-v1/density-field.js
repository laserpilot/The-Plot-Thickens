/**
 * DensityField - Global 2D density field for spatially coherent hatch density
 *
 * Precomputes a scalar field over the entire viewport based on lighting,
 * which paths can sample to get consistent density values across the scene.
 * This creates a "window/mask" effect where all paths reveal the same
 * underlying light-to-shadow gradient.
 */

class DensityField {
  /**
   * @param {number} width - Field width in world units
   * @param {number} height - Field height in world units
   * @param {number} resolution - Grid resolution (e.g., 128 for 128x128 grid)
   */
  constructor(width, height, resolution = 128) {
    this.width = width;
    this.height = height;
    this.resolution = resolution;

    // Grid cell size in world units
    this.cellWidth = width / resolution;
    this.cellHeight = height / resolution;

    // Density values stored in row-major order
    // Values range from 0.0 (highlight/sparse) to 1.0 (shadow/dense)
    this.grid = new Float32Array(resolution * resolution);

    // Default to uniform density
    this.grid.fill(0.5);
  }

  /**
   * Compute density field from a point light source
   * @param {number} lightX - Light X position in world units
   * @param {number} lightY - Light Y position in world units
   * @param {number} falloffRadius - Distance where light intensity drops to 50%
   * @param {number} minDensity - Minimum density value (highlight)
   * @param {number} maxDensity - Maximum density value (shadow)
   */
  computeFromPointLight(lightX, lightY, falloffRadius, minDensity = 0.2, maxDensity = 1.0) {
    for (let row = 0; row < this.resolution; row++) {
      for (let col = 0; col < this.resolution; col++) {
        // World position of this grid cell center
        const x = (col + 0.5) * this.cellWidth;
        const y = (row + 0.5) * this.cellHeight;

        // Distance from light
        const dx = x - lightX;
        const dy = y - lightY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Radial falloff: 1.0 at light source, falls off with distance
        // Using inverse relationship: density = 1 / (1 + dist/radius)
        const falloff = 1.0 / (1.0 + dist / falloffRadius);

        // Invert so close to light = low density (highlight), far = high density (shadow)
        const density = 1.0 - falloff;

        // Remap to min/max range
        const finalDensity = minDensity + density * (maxDensity - minDensity);

        const index = row * this.resolution + col;
        this.grid[index] = finalDensity;
      }
    }
  }

  /**
   * Compute density field from a directional light
   * @param {number} lightAngle - Light angle in degrees (0 = right, 90 = down, etc.)
   * @param {number} minDensity - Minimum density value (highlight)
   * @param {number} maxDensity - Maximum density value (shadow)
   */
  computeFromDirectionalLight(lightAngle, minDensity = 0.2, maxDensity = 1.0) {
    // Convert angle to radians and get light direction vector
    const angleRad = (lightAngle * Math.PI) / 180;
    const lightDirX = Math.cos(angleRad);
    const lightDirY = Math.sin(angleRad);

    // Find the extent of the field along the light direction
    // Check all four corners to find min/max projection
    const corners = [
      [0, 0],
      [this.width, 0],
      [0, this.height],
      [this.width, this.height]
    ];

    let minProj = Infinity;
    let maxProj = -Infinity;

    for (const [x, y] of corners) {
      const proj = x * lightDirX + y * lightDirY;
      minProj = Math.min(minProj, proj);
      maxProj = Math.max(maxProj, proj);
    }

    const projRange = maxProj - minProj;

    for (let row = 0; row < this.resolution; row++) {
      for (let col = 0; col < this.resolution; col++) {
        // World position of this grid cell center
        const x = (col + 0.5) * this.cellWidth;
        const y = (row + 0.5) * this.cellHeight;

        // Project position onto light direction
        const proj = x * lightDirX + y * lightDirY;

        // Normalize projection to 0-1 range
        // 0 = side facing light (highlight), 1 = shadow side
        const t = (proj - minProj) / projRange;

        // Remap to min/max range
        const finalDensity = minDensity + t * (maxDensity - minDensity);

        const index = row * this.resolution + col;
        this.grid[index] = finalDensity;
      }
    }
  }

  /**
   * Sample the density field at a world position using bilinear interpolation
   * @param {number} x - X position in world units
   * @param {number} y - Y position in world units
   * @returns {number} Density value (0.0 to 1.0)
   */
  sample(x, y) {
    // Convert world position to grid coordinates
    const gx = x / this.cellWidth;
    const gy = y / this.cellHeight;

    // Get grid cell indices (floor)
    const col0 = Math.floor(gx);
    const row0 = Math.floor(gy);
    const col1 = Math.min(col0 + 1, this.resolution - 1);
    const row1 = Math.min(row0 + 1, this.resolution - 1);

    // Clamp to grid bounds
    const col0Clamped = Math.max(0, Math.min(col0, this.resolution - 1));
    const row0Clamped = Math.max(0, Math.min(row0, this.resolution - 1));

    // Fractional parts for interpolation
    const fx = gx - col0;
    const fy = gy - row0;

    // Get four corner values
    const v00 = this.grid[row0Clamped * this.resolution + col0Clamped];
    const v10 = this.grid[row0Clamped * this.resolution + col1];
    const v01 = this.grid[row1 * this.resolution + col0Clamped];
    const v11 = this.grid[row1 * this.resolution + col1];

    // Bilinear interpolation
    const v0 = v00 * (1 - fx) + v10 * fx;
    const v1 = v01 * (1 - fx) + v11 * fx;
    const value = v0 * (1 - fy) + v1 * fy;

    return value;
  }

  /**
   * Draw debug visualization of the density field
   * @param {p5} p - p5.js instance
   * @param {number} alpha - Opacity for visualization (0-255)
   */
  drawDebug(p, alpha = 128) {
    p.push();
    p.noStroke();

    // Draw each grid cell as a colored rectangle
    for (let row = 0; row < this.resolution; row++) {
      for (let col = 0; col < this.resolution; col++) {
        const index = row * this.resolution + col;
        const density = this.grid[index];

        // Color ramp: blue (highlight/sparse) -> yellow -> red (shadow/dense)
        let r, g, b;
        if (density < 0.5) {
          // Blue to yellow
          const t = density * 2;
          r = Math.floor(t * 255);
          g = Math.floor(t * 255);
          b = Math.floor((1 - t) * 255);
        } else {
          // Yellow to red
          const t = (density - 0.5) * 2;
          r = 255;
          g = Math.floor((1 - t) * 255);
          b = 0;
        }

        p.fill(r, g, b, alpha);

        const x = col * this.cellWidth;
        const y = row * this.cellHeight;
        p.rect(x, y, this.cellWidth, this.cellHeight);
      }
    }

    // Draw grid lines for clarity
    p.stroke(255, 255, 255, alpha * 0.3);
    p.strokeWeight(0.5);
    for (let row = 0; row <= this.resolution; row++) {
      const y = row * this.cellHeight;
      p.line(0, y, this.width, y);
    }
    for (let col = 0; col <= this.resolution; col++) {
      const x = col * this.cellWidth;
      p.line(x, 0, x, this.height);
    }

    p.pop();
  }
}
