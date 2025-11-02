# Web Interface v2

Modern, modular web interface for the Plotter Line Thickener tool with backend processing support.

## Quick Start

### Option 1: Frontend Only (Client-Side Processing)

```bash
cd web-v2
npm install
npm run dev
```

Visit http://localhost:3002 (or whichever port Vite assigns)

### Option 2: Full Stack (Frontend + Backend with Progress Tracking)

**Terminal 1 - Backend Server:**
```bash
cd web-v2
npm install
npm run server
```
Backend API running on http://localhost:3003

**Terminal 2 - Frontend:**
```bash
cd web-v2
npm run dev
```
Frontend running on http://localhost:3002

**Usage:**
- Use "Export (Quick)" for client-side processing (fast, no progress tracking)
- Use "Export (Server)" for backend processing with real-time progress (recommended for 3,000+ paths)

## Architecture

```
web-v2/
├── server.js           # Express backend server (NEW)
├── server/             # Backend modules (NEW)
│   ├── job-queue.js    # Job management
│   └── processor.js    # Processing with progress hooks
├── src/
│   ├── state/          # State management (pub/sub store)
│   ├── ui/             # UI components and event handlers
│   │   ├── app.js      # Main UI logic
│   │   └── progress-panel.js  # Progress tracking UI (NEW)
│   ├── renderer/       # Canvas rendering
│   ├── utils/          # Utilities (SVG loading, API client, etc.)
│   │   └── api-client.js  # Backend API wrapper (NEW)
│   └── styles/         # CSS
├── index.html          # Entry point
└── vite.config.js      # Build config
```

## Features

✅ **Implemented (Phases 1-4):**
- Split-panel UI layout (controls left, preview right)
- Tab-based controls (File, Sample, Fills, Attractors, Advanced)
- SVG file loading and parsing
- Canvas rendering with pan/zoom controls
- All fill modes: offset, crosshatch, striped, spiral, focus-blur, hatch-gradient
- Interactive attractor placement and editing
- Live preview toggle with throttled processing
- Sample shape generator for testing parameters
- Length binning and outline extraction
- **Dual export options:**
  - **Export (Quick)**: Client-side processing, immediate download
  - **Export (Server)**: Backend processing with real-time progress tracking
- CLI command generation from UI state

## Backend Features (NEW)

✨ **Progress Tracking:**
- Real-time progress bar showing path count and percentage
- Updates every 100 paths (optimized for 3,000-15,000+ path files)
- Status text: "Processing 1,234 / 5,678 paths (21.7%)"
- Cancel button during processing → Download button on completion
- Automatic job cleanup after 1 hour

🔧 **API Endpoints:**
- `POST /api/process` - Submit processing job
- `GET /api/status/:jobId` - Poll job progress
- `GET /api/download/:jobId` - Download processed SVG
- `DELETE /api/job/:jobId` - Cancel running job
- `GET /api/stats` - Queue statistics

📊 **Job Management:**
- In-memory job queue with unique IDs
- Progress tracking per job
- Automatic cleanup of old jobs
- Full error handling and recovery

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
