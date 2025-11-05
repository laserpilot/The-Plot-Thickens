/**
 * Simple pub/sub state store
 * Manages application state and notifies subscribers of changes
 */

class Store {
  constructor(initialState = {}) {
    this.state = initialState;
    this.subscribers = new Map();
  }

  /**
   * Get current state (or subset by key)
   */
  getState(key = null) {
    return key ? this.state[key] : { ...this.state };
  }

  /**
   * Update state and notify subscribers
   */
  setState(updates) {
    const changedKeys = new Set();

    for (const [key, value] of Object.entries(updates)) {
      if (this.state[key] !== value) {
        this.state[key] = value;
        changedKeys.add(key);
      }
    }

    // Notify subscribers of changed keys
    if (changedKeys.size > 0) {
      this.notify(changedKeys);
    }
  }

  /**
   * Subscribe to state changes
   * @param {string|string[]} keys - Key(s) to watch, or '*' for all
   * @param {Function} callback - Called with (state, changedKeys)
   * @returns {Function} Unsubscribe function
   */
  subscribe(keys, callback) {
    const watchKeys = keys === '*' ? ['*'] : Array.isArray(keys) ? keys : [keys];
    const id = Symbol();

    this.subscribers.set(id, { keys: watchKeys, callback });

    // Return unsubscribe function
    return () => this.subscribers.delete(id);
  }

  /**
   * Notify subscribers about state changes
   */
  notify(changedKeys) {
    for (const [, { keys, callback }] of this.subscribers) {
      // Notify if watching all changes, or if any watched key changed
      if (keys.includes('*') || keys.some(k => changedKeys.has(k))) {
        callback(this.getState(), changedKeys);
      }
    }
  }
}

// Default initial state
const initialState = {
  // SVG data
  svg: null,
  svgBounds: null,
  originalPaths: [],
  processedPaths: [],
  originalFilename: null,

  // Sample mode
  isSampleMode: false,
  samplePaths: [],
  sampleBounds: null,
  userSvgBackup: null, // Backup of user's SVG when in sample mode

  // View state
  zoom: 1,
  panX: 0,
  panY: 0,

  // Config (mirrors CLI config structure)
  config: {
    baseOffset: 0.25,
    noise: 0.0,
    noiseFrequency: 50,
    // Noise gradient configuration
    noiseGradientMode: 'flat',      // 'flat', 'fuzzy-crisp', 'crisp-fuzzy'
    noiseMin: 0.05,
    noiseMax: 0.4,
    freqMin: 50,                    // Crisp end: higher frequency (tighter wiggle)
    freqMax: 10,                    // Fuzzy end: lower frequency (smoother wiggle)
    gradientCurve: 'linear',        // 'linear', 'exponential', 'inverse', 'smoothstep'
    minPasses: 1,
    maxPasses: 10,
    curve: 'linear',
    envelope: 'sinTaperBoth',
    fillMode: 'offset',
    sampleRate: 2,
    outputSize: 'a3-landscape',
    // Length thresholding
    minLength: 0,  // 0 = auto-detect
    maxLength: 0,  // 0 = auto-detect
    // Fill mode-specific options
    stripeFilled: 1,
    stripeEmpty: 1,
    twistRate: 0.01,
    twistOffset: 0,
    crosshatchAngles: [45, 135],
    crosshatchSpacing: 1.0,
    fillModeOptions: null,
    // Shape fill options
    shapeType: 'circle',
    shapeFillMode: 'filled',
    shapeSpacing: 1.0,
    shapeMaxWidth: 3.0,
    shapeMinWidth: 0.0,
    // Focus blur configuration
    focusBlur: {
      lightMode: 'directional',
      lightAngle: 45,
      lightPosX: 50,
      lightPosY: 50,
      falloffRadius: 150,
      noiseMin: 0.05,
      noiseMax: 0.6,
      freqMin: 100,
      freqMax: 10,
      modulatePasses: false,
      passesMin: 1.0,
      passesMax: 1.5
    },
    // Hatch gradient configuration
    hatchGradient: {
      angles: [0, 45, 90],
      spacing: 1.0,
      lightMode: 'directional',
      lightAngle: 45,
      lightPosX: 25,
      lightPosY: 25,
      falloffRadius: 100,
      lightStrength: 0.8,
      baseWeight: 0.2,
      shadowSoftness: 0.5
    },
    // Outline extraction
    addOutline: false,
    outlineOffset: 0.25,    // Base offset for outline thickness (mm)
    outlinePasses: 1,       // Number of passes for outline thickness
    // Length binning for SVG organization
    enableBinning: false,
    binCount: 4
  },

  // UI state
  activeTab: 'file',
  expandedSections: new Set(['file', 'fills', 'export']),
  livePreview: false,
  fastPreview: false,
  processing: false,
  configDirty: false, // True when config has changed since last process

  // Original SVG metadata (for preserving dimensions)
  originalSvgMetadata: {
    width: null,
    height: null,
    viewBox: null
  },

  // Detected path length range (updated after processing)
  detectedMinLength: null,
  detectedMaxLength: null,

  // Attractor state
  attractors: [],
  useAttractors: false,
  attractorConfig: {
    mode: 'attract',
    strength: 1.0,
    falloffRadius: 50,
    falloffCurve: 'linear',
    falloffExponent: 2,
    multiMode: 'additive',
    // Advanced filtering
    minInfluenceThreshold: 0,
    minCoveragePercent: 0,
    influenceCalcMode: 'average'
  }
};

export const store = new Store(initialState);
