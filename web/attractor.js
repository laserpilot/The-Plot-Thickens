/**
 * Attractor system for path weight modulation
 */

class Attractor {
  constructor(x, y, id) {
    this.x = x;
    this.y = y;
    this.id = id;
  }

  /**
   * Calculate distance to a point
   */
  distanceTo(x, y) {
    const dx = x - this.x;
    const dy = y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate influence at a point based on distance
   * @param {number} distance - Distance from attractor
   * @param {Object} config - Attractor configuration
   * @returns {number} Influence value (0-1)
   */
  calculateInfluence(distance, config) {
    const { falloffRadius, falloffCurve, strength } = config;

    // Outside falloff radius = no influence
    if (distance > falloffRadius) {
      return 0;
    }

    // Normalize distance (0 at center, 1 at radius)
    const normalized = distance / falloffRadius;

    let influence;

    switch (falloffCurve) {
      case 'linear':
        influence = 1 - normalized;
        break;

      case 'exponential':
        influence = Math.pow(1 - normalized, 2);
        break;

      case 'inverse-square':
        // Prevent division by zero
        const adjustedDist = Math.max(distance, 1);
        influence = falloffRadius * falloffRadius / (adjustedDist * adjustedDist);
        influence = Math.min(influence, 1);
        break;

      default:
        influence = 1 - normalized;
    }

    // Apply strength multiplier
    return influence * strength;
  }
}

class AttractorSystem {
  constructor() {
    this.attractors = [];
    this.nextId = 0;
    this.config = {
      mode: 'attract', // 'attract' or 'repel'
      strength: 1.0,
      falloffRadius: 50,
      falloffCurve: 'linear',
      multiMode: 'additive', // 'additive', 'strongest', 'average'
      minPasses: 1,
      maxPasses: 20,
    };
  }

  /**
   * Add an attractor at position
   */
  addAttractor(x, y) {
    const attractor = new Attractor(x, y, this.nextId++);
    this.attractors.push(attractor);
    console.log(`Added attractor #${attractor.id} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
    return attractor;
  }

  /**
   * Remove an attractor by ID
   */
  removeAttractor(id) {
    const index = this.attractors.findIndex(a => a.id === id);
    if (index !== -1) {
      this.attractors.splice(index, 1);
      console.log(`Removed attractor #${id}`);
    }
  }

  /**
   * Clear all attractors
   */
  clearAll() {
    this.attractors = [];
    console.log('Cleared all attractors');
  }

  /**
   * Calculate combined influence at a point from all attractors
   */
  calculateInfluenceAt(x, y) {
    if (this.attractors.length === 0) {
      return 0;
    }

    const influences = this.attractors.map(attractor => {
      const distance = attractor.distanceTo(x, y);
      return attractor.calculateInfluence(distance, this.config);
    });

    let combinedInfluence;

    switch (this.config.multiMode) {
      case 'additive':
        // Sum all influences (clamped to 0-1)
        combinedInfluence = Math.min(influences.reduce((sum, val) => sum + val, 0), 1);
        break;

      case 'strongest':
        // Use strongest influence only
        combinedInfluence = Math.max(...influences);
        break;

      case 'average':
        // Average all influences
        combinedInfluence = influences.reduce((sum, val) => sum + val, 0) / influences.length;
        break;

      default:
        combinedInfluence = Math.max(...influences);
    }

    return combinedInfluence;
  }

  /**
   * Calculate weight (number of passes) for a path based on attractor influence
   * @param {Array} pathPoints - Array of {x, y} points in the path
   * @returns {number} Number of passes
   */
  calculatePathWeight(pathPoints) {
    if (this.attractors.length === 0) {
      // No attractors = use base weight
      return this.config.minPasses;
    }

    // Calculate average influence along the path
    let totalInfluence = 0;
    pathPoints.forEach(point => {
      totalInfluence += this.calculateInfluenceAt(point.x, point.y);
    });
    const avgInfluence = totalInfluence / pathPoints.length;

    // Map influence to weight
    let weight;
    if (this.config.mode === 'attract') {
      // Higher influence = more passes
      weight = avgInfluence;
    } else {
      // Repel mode: higher influence = fewer passes
      weight = 1 - avgInfluence;
    }

    // Map to pass range
    const passes = Math.round(
      this.config.minPasses + weight * (this.config.maxPasses - this.config.minPasses)
    );

    return Math.max(this.config.minPasses, Math.min(this.config.maxPasses, passes));
  }

  /**
   * Update configuration
   */
  updateConfig(updates) {
    Object.assign(this.config, updates);
  }

  /**
   * Export attractors and config as JSON
   */
  exportPreset() {
    return {
      attractors: this.attractors.map(a => ({ x: a.x, y: a.y })),
      config: { ...this.config },
    };
  }

  /**
   * Import attractors and config from JSON
   */
  importPreset(preset) {
    this.clearAll();
    this.config = { ...this.config, ...preset.config };

    preset.attractors.forEach(({ x, y }) => {
      this.addAttractor(x, y);
    });

    console.log(`Imported ${this.attractors.length} attractors`);
  }
}
