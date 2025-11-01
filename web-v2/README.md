# Web Interface v2

Modern, modular web interface for the Plotter Line Thickener tool.

## Quick Start

```bash
cd web-v2
npm install
npm run dev
```

Visit http://localhost:3001

## Architecture

```
web-v2/
├── src/
│   ├── state/          # State management (pub/sub store)
│   ├── ui/             # UI components and event handlers
│   ├── renderer/       # Canvas rendering
│   ├── utils/          # Utilities (SVG loading, etc.)
│   └── styles/         # CSS
├── index.html          # Entry point
└── vite.config.js      # Build config
```

## Features (Phase 1 - Current)

✅ **Implemented:**
- Tab-based UI layout (File, Preview, Fills, Advanced)
- SVG file loading and parsing
- Static path rendering on canvas
- Pan/zoom controls
- Basic config controls (offset, passes, fill mode)
- CLI command generation from UI state

🚧 **Coming Next (Phase 2-3):**
- Offset fill processing (wire up to shared engine)
- Attractor placement UI
- Live preview toggle
- Sample preview panel
- Export functionality

## State Management

Uses a simple pub/sub store pattern:

```javascript
import { store } from './state/store.js';

// Update state
store.setState({ zoom: 2 });

// Subscribe to changes
store.subscribe('zoom', (state, changed) => {
  console.log('Zoom changed:', state.zoom);
});
```

## Development Notes

- Uses native ES modules (no framework)
- Vite for fast dev server and HMR
- Canvas-based rendering for performance
- Imports from `../lib/` as bridge to existing shared code
- Will migrate to `../shared/` package in Phase 2
