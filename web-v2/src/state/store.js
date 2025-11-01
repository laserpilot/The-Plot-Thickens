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
    minPasses: 1,
    maxPasses: 10,
    curve: 'linear',
    fillMode: 'offset',
    sampleRate: 2,
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
    fillModeOptions: null
  },

  // UI state
  activeTab: 'file',
  livePreview: false,
  fastPreview: false,
  processing: false,

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
