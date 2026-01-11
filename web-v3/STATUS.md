# Web-v2 Status

## ✅ Phase 1 & 2 Complete - Working Application with Shared Engine

The web-v2 application is **fully functional** with offset processing! Dev server running at http://localhost:3001

### What Works

1. **File Loading**: Drag & drop or select SVG files
2. **SVG Parsing**: Extracts paths, bounds, and metadata
3. **Canvas Rendering**: White background with black paths (plotter-ready preview)
4. **Pan/Zoom**: Mouse drag to pan, scroll wheel to zoom, reset button
5. **Tab Navigation**: File, Fills, Attractors, Advanced panels
6. **Config Controls**: All basic parameters (offset, passes, noise, etc.)
7. **Path Processing**: Generate fills using shared engine
8. **Fill Modes**: Offset, Striped, Spiral, Crosshatch (with mode-specific controls) ✨ **NEW!**
9. **Preview Toggle**: Switch between original and processed paths
10. **CLI Generation**: "Copy CLI Command" button exports current settings
11. **SVG Export**: Download processed paths as SVG
12. **Live Preview**: Auto-reprocess when parameters change
13. **Attractor System**: Interactive attractor placement for density control

### Architecture Highlights

```
State Management:    Simple pub/sub store (no framework)
Rendering:           Native Canvas API with Path2D
Module System:       ES modules via Vite
UI Pattern:          Event-driven, declarative state updates
UI Layout:           Split-panel (controls | preview) - always visible
Shared Engine:       ../shared/ (ES modules, same as CLI will use)
Bundle Size:         ~12kb JS (excluding shared engine)
```

### File Structure

```
web-v2/
├── index.html              # Entry point with tab UI
├── vite.config.js          # Build config with path resolution
├── package.json            # Dependencies (just Vite)
└── src/
    ├── main.js             # App initialization
    ├── state/
    │   └── store.js        # Pub/sub state store
    ├── ui/
    │   └── app.js          # Event handlers & controls
    ├── renderer/
    │   └── canvas.js       # Canvas rendering + pan/zoom
    ├── utils/
    │   ├── svg-loader.js   # SVG file parsing
    │   └── processor.js    # Path processing (uses shared engine)
    └── styles/
        └── main.css        # Dark theme UI

../shared/                  # Shared between CLI and web
├── geometry/
│   └── path-utils.js       # Offset generation, envelopes
└── fields/
    ├── density-field.js    # Density field for lighting effects
    └── attractor.js        # Attractor system
```

## ✅ Phase 2 Complete - Shared Engine Integration

**Completed**:

1. ✓ Created `shared/` package at repo root
2. ✓ Migrated lib/ modules to shared/ (geometry, fields)
3. ✓ Converted to ES modules
4. ✓ Wired web-v2 to shared engine for path processing
5. ✓ Processing works identically to CLI!

## 🚧 Phase 3 - In Progress

**Goal**: Interactive features and export

✅ Completed:
1. ✓ Implement SVG export functionality
2. ✓ Add live preview toggle (auto-process on parameter change)
3. ✓ Implement attractor placement UI (click to add/remove)
4. ✓ Fix SVG load error (removed obsolete tab-switching code)
5. ✓ Add fill mode support (striped, spiral, crosshatch) with mode-specific controls

⏳ Next Steps:
1. Add sample preview panel for testing parameters
2. Performance optimization for large SVGs (web workers?)
3. Polish attractor UI (tooltips, better visualization)
4. Add more advanced fill modes (stippling, focus-blur, hatch-gradient)

## 📝 Testing Instructions

```bash
cd web-v2
npm run dev
```

1. Open http://localhost:3001
2. **Left panel: File tab** → upload test-input.svg or pathtree_v1.svg
3. **Right panel: Preview** shows original paths (always visible!)
4. Try pan (drag), zoom (scroll wheel), reset view
5. **Left panel: Fills tab** → adjust offset (0.25mm), min/max passes (1-10)
6. Click **"Process Paths"** → see offset fills rendered in preview! 🎉
7. **Optional**: Enable **"Live Preview"** checkbox → changes auto-update! ✨
8. Click **"Reset to Original"** → back to original
9. **Left panel: Advanced tab** → copy CLI command to clipboard
10. **Left panel: Advanced tab** → click **"Export SVG"** to download! 🎉

## 🎯 Known Limitations

- Advanced fill modes (stippling, focus-blur, hatch-gradient) not yet implemented in UI
- No web workers yet (large SVGs may block UI)
- Using simplified path bounds calculation (adequate for now)
- Attractor influence visualization could be more sophisticated

These will be addressed in Phase 3 and beyond.

## 🐛 Debugging Tips

- Check browser console for processing logs
- Canvas dimensions logged on resize
- Path counts shown in info overlay (top-left)
- Use debug.html for basic canvas rendering tests
