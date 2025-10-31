#!/usr/bin/env node

/**
 * Phase 2: Path length-based SVG processor
 * CLI tool to thicken SVG paths based on their length
 */

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const { processFile } = require('./lib/svg-processor');

// Default configuration
const DEFAULT_CONFIG = {
  baseOffset: 0.25, // mm
  noise: 0.0, // mm
  noiseFrequency: 50, // mm (wavelength for smooth variation)
  minPasses: 1,
  maxPasses: 10,
  curve: 'linear', // 'linear', 'exponential', 'logarithmic'
  exponent: 2, // for exponential curve
  minLength: null, // auto-detect if null
  maxLength: null, // auto-detect if null
  offsetMode: 'normal', // 'legacy' or 'normal'
  envelope: 'sinTaperBoth', // envelope preset name
  bins: null, // null = no binning, number = number of length quantile bins
  sampleRate: 2, // mm - spacing between sample points when converting curves
  fillMode: 'offset', // 'offset', 'crosshatch', 'stippling', 'hatch-gradient', 'striped', or 'spiral'
  stripeFilled: 1, // Number of consecutive filled paths in striped/spiral mode
  stripeEmpty: 1, // Number of consecutive empty paths in striped/spiral mode
  spiralTwistRate: 0.01, // Spiral twist rate in radians per mm
  spiralTwistOffset: 0, // Spiral starting angle in degrees
  addOutline: false, // Add outline strokes (furthermost boundaries)
  crosshatch: {
    angles: [90], // hatch angles in degrees
    spacing: 1, // spacing between hatch lines in mm
    organic: {
      enabled: false,
      wiggle: 0,
      wiggleFreq: 20,
      angleJitter: 0,
      lengthJitter: 0,
      positionJitter: 0,
      spacingJitter: 0
    }
  },
  hatchGradient: {
    angles: [0, 45, 90], // gradient hatch angles
    spacing: 1, // base spacing between hatch lines
    lightMode: 'directional', // 'directional' or 'point'
    lightAngle: 45, // light direction in degrees (directional)
    lightPosX: 25, // light X position in % (point)
    lightPosY: 25, // light Y position in % (point)
    falloffRadius: 100, // light falloff radius in mm (point)
    lightStrength: 0.8, // light influence strength
    baseWeight: 0.2, // minimum density weight
    shadowSoftness: 0.5 // transition smoothness
  },
  focusBlur: {
    lightMode: 'directional', // 'directional' or 'point'
    lightAngle: 45, // light direction in degrees (directional)
    lightPosX: 50, // light X position in % (point)
    lightPosY: 50, // light Y position in % (point)
    falloffRadius: 150, // light falloff radius in mm (point)
    noiseMin: 0.05, // noise amplitude in lit/focused areas
    noiseMax: 0.6, // noise amplitude in shadowed/blurred areas
    freqMin: 100, // noise frequency in lit areas (calm)
    freqMax: 10, // noise frequency in shadows (chaotic)
    modulatePasses: false, // enable pass count modulation
    passesMin: 1.0, // pass multiplier in lit areas
    passesMax: 1.5 // pass multiplier in shadows
  },
};

// CLI setup
const program = new Command();

program
  .name('process-svg')
  .description('Process SVG files with path length-based line weight')
  .version('0.1.0')
  .argument('<input>', 'Input SVG file')
  .argument('[output]', 'Output SVG file (defaults to <input>-processed.svg)')
  .option('-c, --config <file>', 'JSON configuration file')
  .option('-o, --offset <number>', 'Base offset distance in mm', parseFloat)
  .option('-n, --noise <number>', 'Noise amount in mm', parseFloat)
  .option('--noise-frequency <number>', 'Noise wavelength in mm (lower=smoother, default: 50)', parseFloat)
  .option('--min-passes <number>', 'Minimum number of passes', parseInt)
  .option('--max-passes <number>', 'Maximum number of passes', parseInt)
  .option('--curve <type>', 'Length-to-weight curve (linear|exponential|logarithmic)')
  .option('--exponent <number>', 'Exponent for exponential curve', parseFloat)
  .option('--min-length <number>', 'Minimum path length (auto-detect if omitted)', parseFloat)
  .option('--max-length <number>', 'Maximum path length (auto-detect if omitted)', parseFloat)
  .option('--offset-mode <mode>', 'Offset mode (legacy|normal)', 'legacy')
  .option('--envelope <preset>', 'Envelope preset for normal mode (flat|linearTaper|sinTaper|etc)', 'flat')
  .option('--bins <number>', 'Group paths into N length quantile bins (e.g. 4 for quartiles)', parseInt)
  .option('--sample-rate <number>', 'Sample interval in mm for curve conversion (default: 2, lower=smoother/slower)', parseFloat)
  .option('--attractors <file>', 'JSON file with attractor preset (overrides length-based weighting)')
  .option('--fill-mode <mode>', 'Fill mode: offset, crosshatch, stippling, hatch-gradient, striped, or spiral (default: offset)')
  .option('--stripe-filled <number>', 'Number of consecutive filled paths in striped/spiral pattern (default: 1)', parseInt)
  .option('--stripe-empty <number>', 'Number of consecutive empty paths in striped/spiral pattern (default: 1)', parseInt)
  .option('--spiral-twist-rate <number>', 'Spiral twist rate in radians per mm (default: 0.01, range: 0.001-0.1)', parseFloat)
  .option('--spiral-twist-offset <number>', 'Spiral starting angle in degrees (default: 0)', parseFloat)
  .option('--add-outline', 'Add outline strokes (furthermost boundaries) as separate paths')
  .option('--hatch-angles <angles>', 'Hatch angles in degrees, comma-separated (e.g., "45,-45" or "90")')
  .option('--hatch-spacing <number>', 'Spacing between hatch lines in mm (default: 1)', parseFloat)
  .option('--organic-hatch', 'Enable organic/hand-drawn crosshatch mode')
  .option('--hatch-wiggle <number>', 'Line wiggle amplitude in mm (default: 0)', parseFloat)
  .option('--wiggle-frequency <number>', 'Wiggle wavelength in mm (default: 20)', parseFloat)
  .option('--angle-jitter <number>', 'Random angle variation in degrees (default: 0)', parseFloat)
  .option('--length-jitter <number>', 'Random length variation 0-1 (default: 0)', parseFloat)
  .option('--position-jitter <number>', 'Position offset jitter in mm (default: 0)', parseFloat)
  .option('--spacing-jitter <number>', 'Spacing randomization 0-1 (default: 0)', parseFloat)
  .option('--light-mode <mode>', 'Light mode for hatch-gradient: directional or point (default: directional)')
  .option('--light-angle <degrees>', 'Light direction for hatch-gradient directional mode (0=right, 90=down, default: 45)', parseFloat)
  .option('--light-pos-x <percent>', 'Light X position for hatch-gradient point mode (0-100%, default: 25)', parseFloat)
  .option('--light-pos-y <percent>', 'Light Y position for hatch-gradient point mode (0-100%, default: 25)', parseFloat)
  .option('--falloff-radius <number>', 'Light falloff radius for hatch-gradient point mode (mm, default: 100)', parseFloat)
  .option('--light-strength <number>', 'Light influence strength for hatch-gradient (0-1, default: 0.8)', parseFloat)
  .option('--gradient-base-weight <number>', 'Minimum density for hatch-gradient (0-1, default: 0.2)', parseFloat)
  .option('--shadow-softness <number>', 'Shadow transition smoothness for hatch-gradient (0-1, default: 0.5)', parseFloat)
  .option('--focus-blur-light-mode <mode>', 'Light mode for focus-blur: directional or point (default: directional)')
  .option('--focus-blur-light-angle <degrees>', 'Light direction for focus-blur directional mode (0=right, 90=down, default: 45)', parseFloat)
  .option('--focus-blur-light-pos-x <percent>', 'Light X position for focus-blur point mode (0-100%, default: 50)', parseFloat)
  .option('--focus-blur-light-pos-y <percent>', 'Light Y position for focus-blur point mode (0-100%, default: 50)', parseFloat)
  .option('--focus-blur-falloff-radius <number>', 'Light falloff radius for focus-blur point mode (mm, default: 150)', parseFloat)
  .option('--focus-blur-noise-min <number>', 'Noise amplitude in focused/lit areas (mm, default: 0.05)', parseFloat)
  .option('--focus-blur-noise-max <number>', 'Noise amplitude in blurred/shadowed areas (mm, default: 0.6)', parseFloat)
  .option('--focus-blur-freq-min <number>', 'Noise frequency in focused areas (default: 100)', parseFloat)
  .option('--focus-blur-freq-max <number>', 'Noise frequency in blurred areas (default: 10)', parseFloat)
  .option('--focus-blur-modulate-passes', 'Enable pass count modulation (thicker in shadow)')
  .option('--focus-blur-passes-min <number>', 'Pass multiplier in focused areas (default: 1.0)', parseFloat)
  .option('--focus-blur-passes-max <number>', 'Pass multiplier in blurred areas (default: 1.5)', parseFloat)
  .action((input, output, options) => {
    // Load configuration
    let config = { ...DEFAULT_CONFIG };

    // Load from config file if provided
    if (options.config) {
      try {
        const configFile = fs.readFileSync(options.config, 'utf-8');
        const fileConfig = JSON.parse(configFile);
        config = { ...config, ...fileConfig };
        console.log(`Loaded configuration from: ${options.config}`);
      } catch (error) {
        console.error(`Failed to load config file: ${error.message}`);
        process.exit(1);
      }
    }

    // Override with command-line options
    if (options.offset !== undefined) config.baseOffset = options.offset;
    if (options.noise !== undefined) config.noise = options.noise;
    if (options.noiseFrequency !== undefined) config.noiseFrequency = options.noiseFrequency;
    if (options.minPasses !== undefined) config.minPasses = options.minPasses;
    if (options.maxPasses !== undefined) config.maxPasses = options.maxPasses;
    if (options.curve !== undefined) config.curve = options.curve;
    if (options.exponent !== undefined) config.exponent = options.exponent;
    if (options.minLength !== undefined) config.minLength = options.minLength;
    if (options.maxLength !== undefined) config.maxLength = options.maxLength;
    if (options.offsetMode !== undefined) config.offsetMode = options.offsetMode;
    if (options.envelope !== undefined) config.envelope = options.envelope;
    if (options.bins !== undefined) config.bins = options.bins;
    if (options.sampleRate !== undefined) config.sampleRate = options.sampleRate;
    if (options.fillMode !== undefined) config.fillMode = options.fillMode;
    if (options.stripeFilled !== undefined) config.stripeFilled = options.stripeFilled;
    if (options.stripeEmpty !== undefined) config.stripeEmpty = options.stripeEmpty;
    if (options.spiralTwistRate !== undefined) config.spiralTwistRate = options.spiralTwistRate;
    if (options.spiralTwistOffset !== undefined) config.spiralTwistOffset = options.spiralTwistOffset;
    if (options.addOutline) config.addOutline = true;

    // Handle crosshatch options
    if (options.hatchAngles !== undefined) {
      const angles = options.hatchAngles.split(',').map(a => parseFloat(a.trim()));
      config.crosshatch = config.crosshatch || {};
      config.crosshatch.angles = angles;
    }
    if (options.hatchSpacing !== undefined) {
      config.crosshatch = config.crosshatch || {};
      config.crosshatch.spacing = options.hatchSpacing;
    }

    // Handle organic crosshatch options
    if (options.organicHatch) {
      config.crosshatch = config.crosshatch || {};
      config.crosshatch.organic = config.crosshatch.organic || {};
      config.crosshatch.organic.enabled = true;
    }
    if (options.hatchWiggle !== undefined) {
      config.crosshatch = config.crosshatch || {};
      config.crosshatch.organic = config.crosshatch.organic || {};
      config.crosshatch.organic.wiggle = options.hatchWiggle;
    }
    if (options.wiggleFrequency !== undefined) {
      config.crosshatch = config.crosshatch || {};
      config.crosshatch.organic = config.crosshatch.organic || {};
      config.crosshatch.organic.wiggleFreq = options.wiggleFrequency;
    }
    if (options.angleJitter !== undefined) {
      config.crosshatch = config.crosshatch || {};
      config.crosshatch.organic = config.crosshatch.organic || {};
      config.crosshatch.organic.angleJitter = options.angleJitter;
    }
    if (options.lengthJitter !== undefined) {
      config.crosshatch = config.crosshatch || {};
      config.crosshatch.organic = config.crosshatch.organic || {};
      config.crosshatch.organic.lengthJitter = options.lengthJitter;
    }
    if (options.positionJitter !== undefined) {
      config.crosshatch = config.crosshatch || {};
      config.crosshatch.organic = config.crosshatch.organic || {};
      config.crosshatch.organic.positionJitter = options.positionJitter;
    }
    if (options.spacingJitter !== undefined) {
      config.crosshatch = config.crosshatch || {};
      config.crosshatch.organic = config.crosshatch.organic || {};
      config.crosshatch.organic.spacingJitter = options.spacingJitter;
    }

    // Handle hatch-gradient options
    if (options.hatchAngles !== undefined && config.fillMode === 'hatch-gradient') {
      const angles = options.hatchAngles.split(',').map(a => parseFloat(a.trim()));
      config.hatchGradient = config.hatchGradient || {};
      config.hatchGradient.angles = angles;
    }
    if (options.hatchSpacing !== undefined && config.fillMode === 'hatch-gradient') {
      config.hatchGradient = config.hatchGradient || {};
      config.hatchGradient.spacing = options.hatchSpacing;
    }
    if (options.lightMode !== undefined) {
      config.hatchGradient = config.hatchGradient || {};
      config.hatchGradient.lightMode = options.lightMode;
    }
    if (options.lightAngle !== undefined) {
      config.hatchGradient = config.hatchGradient || {};
      config.hatchGradient.lightAngle = options.lightAngle;
    }
    if (options.lightPosX !== undefined) {
      config.hatchGradient = config.hatchGradient || {};
      config.hatchGradient.lightPosX = options.lightPosX;
    }
    if (options.lightPosY !== undefined) {
      config.hatchGradient = config.hatchGradient || {};
      config.hatchGradient.lightPosY = options.lightPosY;
    }
    if (options.falloffRadius !== undefined) {
      config.hatchGradient = config.hatchGradient || {};
      config.hatchGradient.falloffRadius = options.falloffRadius;
    }
    if (options.lightStrength !== undefined) {
      config.hatchGradient = config.hatchGradient || {};
      config.hatchGradient.lightStrength = options.lightStrength;
    }
    if (options.gradientBaseWeight !== undefined) {
      config.hatchGradient = config.hatchGradient || {};
      config.hatchGradient.baseWeight = options.gradientBaseWeight;
    }
    if (options.shadowSoftness !== undefined) {
      config.hatchGradient = config.hatchGradient || {};
      config.hatchGradient.shadowSoftness = options.shadowSoftness;
    }

    // Handle focus-blur options
    if (options.focusBlurLightMode !== undefined) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.lightMode = options.focusBlurLightMode;
    }
    if (options.focusBlurLightAngle !== undefined) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.lightAngle = options.focusBlurLightAngle;
    }
    if (options.focusBlurLightPosX !== undefined) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.lightPosX = options.focusBlurLightPosX;
    }
    if (options.focusBlurLightPosY !== undefined) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.lightPosY = options.focusBlurLightPosY;
    }
    if (options.focusBlurFalloffRadius !== undefined) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.falloffRadius = options.focusBlurFalloffRadius;
    }
    if (options.focusBlurNoiseMin !== undefined) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.noiseMin = options.focusBlurNoiseMin;
    }
    if (options.focusBlurNoiseMax !== undefined) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.noiseMax = options.focusBlurNoiseMax;
    }
    if (options.focusBlurFreqMin !== undefined) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.freqMin = options.focusBlurFreqMin;
    }
    if (options.focusBlurFreqMax !== undefined) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.freqMax = options.focusBlurFreqMax;
    }
    if (options.focusBlurModulatePasses) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.modulatePasses = true;
    }
    if (options.focusBlurPassesMin !== undefined) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.passesMin = options.focusBlurPassesMin;
    }
    if (options.focusBlurPassesMax !== undefined) {
      config.focusBlur = config.focusBlur || {};
      config.focusBlur.passesMax = options.focusBlurPassesMax;
    }

    // Load attractors preset if provided
    if (options.attractors) {
      try {
        const attractorFile = fs.readFileSync(options.attractors, 'utf-8');
        const attractorPreset = JSON.parse(attractorFile);
        config.attractorPreset = attractorPreset;
        console.log(`Loaded ${attractorPreset.attractors?.length || 0} attractors from: ${options.attractors}`);
      } catch (error) {
        console.error(`Failed to load attractor file: ${error.message}`);
        process.exit(1);
      }
    }

    // Determine output path
    const outputPath = output || input.replace(/\.svg$/, '-processed.svg');

    // Validate input file exists
    if (!fs.existsSync(input)) {
      console.error(`Input file not found: ${input}`);
      process.exit(1);
    }

    // Process the file
    try {
      processFile(input, outputPath, config);
      console.log('\n✓ Processing complete!');
    } catch (error) {
      console.error('\n✗ Processing failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  });

// Example config command
program
  .command('init-config')
  .description('Generate a default configuration file')
  .argument('[output]', 'Output config file', 'config.json')
  .action((output) => {
    const configContent = JSON.stringify(DEFAULT_CONFIG, null, 2);
    fs.writeFileSync(output, configContent, 'utf-8');
    console.log(`Configuration file created: ${output}`);
    console.log('\nEdit this file and use it with:');
    console.log(`  node process-svg.js input.svg -c ${output}`);
  });

// Parse arguments
program.parse();
