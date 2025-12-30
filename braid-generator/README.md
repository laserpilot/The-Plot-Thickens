# Braid Generator

A browser-based tool for generating decorative braid patterns along SVG paths, designed for pen plotter output.

## Usage

Open `index.html` in a browser. No server required - works offline.

1. Load an SVG file with paths, or use the built-in path generators
2. Adjust braid parameters (wave pattern, fiber count, tapering, etc.)
3. Export the result as SVG for plotting

## Files

- **index.html** - Main braid generator application
- **samples/** - Example SVG paths for testing
- **prototypes/** - Earlier experimental versions preserved for reference
  - `braid-plait-lab.html` - Rhombus/plait-based approach
  - `braid-stress-test.html` - Performance testing with long paths
  - `three-strand-playground.html` - Three-strand braid experiments
  - `three-strand-clipping.html` - Clipping/masking tests

## Dependencies

The only external dependency is [svg-path-commander](https://github.com/nicolo-ribaudo/svg-path-commander) (vendored in `lib/`).
