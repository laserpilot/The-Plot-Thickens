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
  baseOffset: 0.1, // mm
  noise: 0.05, // mm
  minPasses: 1,
  maxPasses: 20,
  curve: 'linear', // 'linear', 'exponential', 'logarithmic'
  exponent: 2, // for exponential curve
  minLength: null, // auto-detect if null
  maxLength: null, // auto-detect if null
  // Shape fill mode options
  fillMode: null, // null (default offset mode) or 'shape-fill'
  shapeType: 'circle', // 'circle' (more shapes in future)
  shapeFillMode: 'filled', // 'hollow' or 'filled'
  shapeSpacing: 1.0, // Spacing multiplier relative to envelope width
  envelope: 'flat', // 'flat', 'sinTaper', 'sinTaperBoth', 'linearTaper', etc.
  maxWidth: 3.0, // Maximum envelope width in mm
  minWidth: 0.0, // Minimum envelope width in mm
};

// CLI setup
const program = new Command();

program
  .name('process-svg')
  .description('Process SVG files with path length-based line weight or shape fill')
  .version('0.1.0')
  .argument('<input>', 'Input SVG file')
  .argument('[output]', 'Output SVG file (defaults to <input>-processed.svg)')
  .option('-c, --config <file>', 'JSON configuration file')
  .option('-o, --offset <number>', 'Base offset distance in mm', parseFloat)
  .option('-n, --noise <number>', 'Noise amount in mm', parseFloat)
  .option('--min-passes <number>', 'Minimum number of passes', parseInt)
  .option('--max-passes <number>', 'Maximum number of passes', parseInt)
  .option('--curve <type>', 'Length-to-weight curve (linear|exponential|logarithmic)')
  .option('--exponent <number>', 'Exponent for exponential curve', parseFloat)
  .option('--min-length <number>', 'Minimum path length (auto-detect if omitted)', parseFloat)
  .option('--max-length <number>', 'Maximum path length (auto-detect if omitted)', parseFloat)
  .option('--fill-mode <mode>', 'Fill mode: shape-fill (or omit for traditional offset mode)')
  .option('--shape-type <type>', 'Shape type for shape-fill mode (circle)', 'circle')
  .option('--shape-fill-mode <mode>', 'Shape fill: hollow or filled', 'filled')
  .option('--shape-spacing <number>', 'Shape spacing multiplier (0.0-2.0)', parseFloat)
  .option('--envelope <type>', 'Envelope type (flat|sinTaper|sinTaperBoth|linearTaper|linearTaperBoth|easeInOut|easeInOutBoth)', 'flat')
  .option('--max-width <number>', 'Maximum envelope width in mm', parseFloat)
  .option('--min-width <number>', 'Minimum envelope width in mm', parseFloat)
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
    if (options.minPasses !== undefined) config.minPasses = options.minPasses;
    if (options.maxPasses !== undefined) config.maxPasses = options.maxPasses;
    if (options.curve !== undefined) config.curve = options.curve;
    if (options.exponent !== undefined) config.exponent = options.exponent;
    if (options.minLength !== undefined) config.minLength = options.minLength;
    if (options.maxLength !== undefined) config.maxLength = options.maxLength;
    if (options.fillMode !== undefined) config.fillMode = options.fillMode;
    if (options.shapeType !== undefined) config.shapeType = options.shapeType;
    if (options.shapeFillMode !== undefined) config.shapeFillMode = options.shapeFillMode;
    if (options.shapeSpacing !== undefined) config.shapeSpacing = options.shapeSpacing;
    if (options.envelope !== undefined) config.envelope = options.envelope;
    if (options.maxWidth !== undefined) config.maxWidth = options.maxWidth;
    if (options.minWidth !== undefined) config.minWidth = options.minWidth;

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
