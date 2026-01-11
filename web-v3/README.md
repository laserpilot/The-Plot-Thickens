# Web Interface v3

Experimental UI for the Plotter Line Thickener with modular fill mode architecture.

## Quick Start

```bash
cd web-v3
npm install
npm run dev
```

Visit http://localhost:3002 (or whichever port Vite assigns)

### With Backend Server

**Terminal 1 - Backend Server:**
```bash
npm run server
```
Backend API running on http://localhost:3003

**Terminal 2 - Frontend:**
```bash
npm run dev
```

## Fill Mode Registry

Web V3 uses a centralized fill mode registry at `shared/fills/`:

```javascript
import { getFillMode, listFillModes, getAllDefaults } from '../shared/fills/index.js';

// Get all registered modes
const modes = listFillModes();
// ['curly', 'barber-pole', 'moire', 'woodgrain', 'contour-echo', ...]

// Get a specific mode
const curly = getFillMode('curly');
curly.generate(pathData, options);  // Generate fill
curly.defaults;                      // Default options
curly.schema;                        // UI schema (optional)

// Get combined defaults for all modes
const allDefaults = getAllDefaults();
```

### Fill Mode Structure

Each fill mode is a separate module in `shared/fills/`:

```
shared/fills/
  index.js          # Registry + helpers
  curly.js          # Curly/spring fill
  barber-pole.js    # Twisted stripe patterns
  moire.js          # Phase-locked moiré patterns
  woodgrain.js      # Parallel drifting strands
  contour-echo.js   # Concentric contour rings
  shape-fill.js     # Shape-based fills
  crosshatch.js     # Hatched line patterns
  stippling.js      # Dot patterns
  hatch-gradient.js # Light-driven hatch density
  offset.js         # Concentric offset (default)
  striped.js        # Alternating stripes
  spiral.js         # Twisted patterns
  focus-blur.js     # Light-driven density
```

Each module exports:
- `generate(pathData, options)` - Main fill generator
- `defaults` - Default option values (single source of truth)
- `schema` - UI schema for controls (optional)

## Available Fill Modes

| Mode | Category | Description |
|------|----------|-------------|
| `offset` | Basic | Concentric offset passes (default) |
| `striped` | Basic | Alternating filled/empty stripes |
| `shape-fill` | Basic | Fill with repeated shapes |
| `curly` | Decorative | Spring/telephone-cord loops |
| `barber-pole` | Decorative | Twisted candy-stripe patterns |
| `spiral` | Decorative | Twisted offset patterns |
| `crosshatch` | Pattern | Hatched lines at angles |
| `stippling` | Pattern | Dot-based patterns |
| `moire` | Pattern | Phase-locked interference |
| `woodgrain` | Organic | Parallel drifting strands |
| `contour-echo` | Organic | Concentric contour rings |
| `hatch-gradient` | Shading | Light-driven hatch density |
| `focus-blur` | Shading | Light-driven noise variation |

## Architecture

```
web-v3/
├── server.js           # Express backend server
├── server/             # Backend modules
│   ├── job-queue.js    # Job management
│   └── processor.js    # Processing with progress hooks
├── src/
│   ├── state/          # State management (pub/sub store)
│   ├── ui/             # UI components
│   ├── renderer/       # Canvas rendering
│   ├── utils/          # Utilities
│   └── styles/         # CSS
├── index.html          # Entry point
└── vite.config.js      # Build config
```

## Differences from Web V2

- Fill mode defaults imported from `shared/fills/` registry
- Cleaner separation between UI and fill generation
- All 13 fill modes have dedicated registry entries
- Schema-based UI generation (future capability)
- Same functionality, improved maintainability

## Development Notes

- Uses native ES modules (no framework)
- Vite for fast dev server and HMR
- Canvas-based rendering for performance
- Imports shared code from `../shared/`
