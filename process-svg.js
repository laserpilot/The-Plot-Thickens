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
