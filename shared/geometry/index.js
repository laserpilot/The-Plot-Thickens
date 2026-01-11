export {
  measurePathLength,
  offsetPath,
  generatePasses,
  lengthToWeight,
  getEnvelopePreset,
  EnvelopePresets,
  generateCrosshatchFill,
  generateStipplingFill,
  generateHatchGradientFill,
  generateShapeFill,
  generateBarberPoleFill,
  generateCurlyFill,
  generateMoireFill,
  generateWoodgrainFill,
  generateContourEchoFill,
} from './path-utils.js';

// Re-export fill registry
export {
  fillRegistry,
  getFillMode,
  getFillDefaults,
  listFillModes,
  getAllDefaults,
} from '../fills/index.js';
