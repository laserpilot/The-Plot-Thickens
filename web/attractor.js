/**
 * Attractor system for path weight modulation
 */

class Attractor {
  constructor(x, y, id, strength = null, radius = null) {
    this.x = x;
    this.y = y;
    this.id = id;
    // Per-attractor properties (null = use global config)
    this.strength = strength;
    this.radius = radius;
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
   * @param {Object} config - Attractor configuration (global fallback)
   * @returns {number} Influence value (0-1)
   */
  calculateInfluence(distance, config) {
    // Use per-attractor properties if set, otherwise use global config
    const falloffRadius = this.radius !== null ? this.radius : config.falloffRadius;
    const strength = this.strength !== null ? this.strength : config.strength;
    const falloffCurve = config.falloffCurve;
    const falloffExponent = config.falloffExponent || 2;

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

      case 'power':
        // Configurable power falloff
        influence = Math.pow(1 - normalized, falloffExponent);
        break;

      case 'gaussian':
        // Gaussian falloff: exp(-normalized² * k)
        const k = falloffExponent; // Use exponent as sharpness parameter
        influence = Math.exp(-normalized * normalized * k);
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
    this.maxAttractors = 10; // Maximum number of attractors
    this.config = {
      mode: 'attract', // 'attract' or 'repel'
      strength: 1.0,
      falloffRadius: 50,
      falloffCurve: 'linear',
      falloffExponent: 2, // For power and gaussian curves
      multiMode: 'additive', // 'additive', 'strongest', 'average', 'soft', 'weighted-average'
      weightBlendMode: 'replace', // 'replace' or 'blend'
      arcLengthSampleInterval: 5, // mm between samples for weight calculation
      minPasses: 1,
      maxPasses: 20,
      // Path filtering options
      minInfluenceThreshold: 0, // Only affect paths with max influence > this (0-1)
      minCoveragePercent: 0, // Only affect if this % of sample points are inside radius (0-100)
      influenceCalcMode: 'average', // 'average' or 'maximum'
    };
  }

  /**
   * Add an attractor at position with optional per-attractor properties
   */
  addAttractor(x, y, strength = null, radius = null) {
    if (this.attractors.length >= this.maxAttractors) {
      console.warn(`Maximum of ${this.maxAttractors} attractors reached`);
      return null;
    }
    const attractor = new Attractor(x, y, this.nextId++, strength, radius);
    this.attractors.push(attractor);
    console.log(`Added attractor #${attractor.id} at (${x.toFixed(1)}, ${y.toFixed(1)})`);
    return attractor;
  }

  /**
   * Update attractor properties
   */
  updateAttractor(id, updates) {
    const attractor = this.attractors.find(a => a.id === id);
    if (attractor) {
      if (updates.x !== undefined) attractor.x = updates.x;
      if (updates.y !== undefined) attractor.y = updates.y;
      if (updates.strength !== undefined) attractor.strength = updates.strength;
      if (updates.radius !== undefined) attractor.radius = updates.radius;
    }
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

    const influencesWithDistance = this.attractors.map(attractor => {
      const distance = attractor.distanceTo(x, y);
      const influence = attractor.calculateInfluence(distance, this.config);
      return { influence, distance, attractor };
    });

    const influences = influencesWithDistance.map(item => item.influence);
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

      case 'soft':
        // Soft mode: sum influences divided by count for smooth gradient
        const activeCount = influences.filter(v => v > 0).length;
        if (activeCount === 0) {
          combinedInfluence = 0;
        } else {
          const sum = influences.reduce((s, v) => s + v, 0);
          combinedInfluence = sum / activeCount;
        }
        break;

      case 'weighted-average':
        // Weighted average: weight by inverse distance
        let weightedSum = 0;
        let weightSum = 0;
        influencesWithDistance.forEach(({ influence, distance, attractor }) => {
          if (influence > 0) {
            const radius = attractor.radius !== null ? attractor.radius : this.config.falloffRadius;
            const weight = 1 - (distance / radius); // Closer = higher weight
            weightedSum += influence * weight;
            weightSum += weight;
          }
        });
        combinedInfluence = weightSum > 0 ? weightedSum / weightSum : 0;
        break;

      default:
        combinedInfluence = Math.max(...influences);
    }

    return combinedInfluence;
  }

  /**
   * Calculate weight (number of passes) for a path based on attractor influence
   * @param {Array|string} pathPointsOrData - Array of {x, y} points or SVG path d string
   * @param {number} pathLength - Optional path length (for blending with length-based weight)
   * @returns {number} Number of passes
   */
  calculatePathWeight(pathPointsOrData, pathLength = null) {
    if (this.attractors.length === 0) {
      // No attractors = use base weight
      return this.config.minPasses;
    }

    let samplePoints = [];

    // Sample along arc length if we have path data string
    if (typeof pathPointsOrData === 'string' && typeof SVGPathCommander !== 'undefined') {
      try {
        const absolutePath = SVGPathCommander.pathToAbsolute(pathPointsOrData);
        const totalLength = SVGPathCommander.getTotalLength(absolutePath);

        if (totalLength > 0) {
          const sampleInterval = this.config.arcLengthSampleInterval;
          const numSamples = Math.max(5, Math.ceil(totalLength / sampleInterval));

          for (let i = 0; i <= numSamples; i++) {
            const arcLength = (i / numSamples) * totalLength;
            const point = SVGPathCommander.getPointAtLength(absolutePath, arcLength);
            if (point && !isNaN(point.x) && !isNaN(point.y)) {
              samplePoints.push(point);
            }
          }
        }
      } catch (error) {
        console.warn('Arc-length sampling failed, falling back to point array:', error);
      }
    }

    // Fallback to point array if string parsing failed or input is already points
    if (samplePoints.length === 0) {
      samplePoints = Array.isArray(pathPointsOrData) ? pathPointsOrData : [];
    }

    if (samplePoints.length === 0) {
      return this.config.minPasses;
    }

    // Calculate influence along the path and gather statistics
    let totalInfluence = 0;
    let maxInfluence = 0;
    let pointsInRadius = 0;

    const influences = samplePoints.map(point => {
      const influence = this.calculateInfluenceAt(point.x, point.y);
      totalInfluence += influence;
      maxInfluence = Math.max(maxInfluence, influence);
      if (influence > 0) pointsInRadius++;
      return influence;
    });

    const avgInfluence = totalInfluence / samplePoints.length;
    const coveragePercent = (pointsInRadius / samplePoints.length) * 100;

    // Apply path filtering if configured
    if (this.config.minInfluenceThreshold > 0 && maxInfluence < this.config.minInfluenceThreshold) {
      // Path doesn't meet minimum influence threshold - use minimum passes
      return this.config.minPasses;
    }

    if (this.config.minCoveragePercent > 0 && coveragePercent < this.config.minCoveragePercent) {
      // Path doesn't have enough coverage inside attractor radius - use minimum passes
      return this.config.minPasses;
    }

    // Choose influence based on calculation mode
    let effectiveInfluence;
    if (this.config.influenceCalcMode === 'maximum') {
      effectiveInfluence = maxInfluence;
    } else {
      effectiveInfluence = avgInfluence;
    }

    // Map influence to weight
    let weight;
    if (this.config.mode === 'attract') {
      // Higher influence = more passes
      weight = effectiveInfluence;
    } else {
      // Repel mode: higher influence = fewer passes
      weight = 1 - effectiveInfluence;
    }

    // Apply blending with length-based weight if enabled
    if (this.config.weightBlendMode === 'blend' && pathLength !== null) {
      // Calculate length-based weight (would need min/max from global context)
      // For now, use a simple approach: blend attractor weight with a baseline
      const baseline = 0.5; // Middle of the range
      weight = baseline + (weight - baseline) * effectiveInfluence;
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
      attractors: this.attractors.map(a => ({
        x: a.x,
        y: a.y,
        strength: a.strength,
        radius: a.radius
      })),
      config: { ...this.config },
    };
  }

  /**
   * Import attractors and config from JSON
   */
  importPreset(preset) {
    this.clearAll();
    this.config = { ...this.config, ...preset.config };

    preset.attractors.forEach(({ x, y, strength, radius }) => {
      this.addAttractor(x, y, strength !== undefined ? strength : null, radius !== undefined ? radius : null);
    });

    console.log(`Imported ${this.attractors.length} attractors`);
  }
}
