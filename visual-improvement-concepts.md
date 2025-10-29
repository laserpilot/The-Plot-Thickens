# Visual Improvement Concepts

Curated backlog of rendering experiments for the plotter line thickener. Each idea reuses the existing sampling, envelope, and fill infrastructure but targets new visual aesthetics. Use this list when planning future branches.

## 1. Lighting & Shading

- **Per-normal lighting (complete)**  
  - ✅ Already implemented in hatch-gradient mode, but keep tuning: signed normal dot products, configurable distance falloff, and light indicators/preview.
- **Point light falloff refinements**  
  - Blend orientation vs. distance weights with user-controlled ratios.  
  - Optional distance-based fade for offset thickness as well as hatch density.
- **Shadow diagnostics**  
  - Toggle to color-code dense vs. sparse regions so users can calibrate presets quickly.

## 2. Advanced Fill Patterns

- **Woodgrain / flow-field contours**  
  - Warp offsets along a 2D noise or attractor-derived vector field.  
  - Envelope controls for knot density and grain frequency.
- **Feather or fringe fills**  
  - Emit short tapered strokes along ribbon normals.  
  - Length, spacing, and jitter controlled by envelope and attractor intensity.
- **Wave/moire offsets**  
  - Sinusoidally modulate offset distance to create ripple textures.  
  - Phase shift duplicate passes for layered interference patterns.
- **Contour ladders (onion skins)**  
  - Iteratively shrink closed paths to produce concentric rings.  
  - Stop based on minimum area or auto-detected curvature spikes.
- **Herringbone / weave tiles**  
  - Alternate hatch directions within equal-length tiles along the path.  
  - Presets for fabric-like textures (30°/150°, 45°/135°, etc.).
- **Masked overlays**  
  - Use greyscale masks (imported image or attractor map) to control pass density per sample point.  
  - Allows custom textures (logos, gradients) blended into line work.

## 3. Point-Based Textures

- **Halftone stippling**  
  - Extend the existing stippler with tone curves; dot size and spacing respond to light direction or curvature.  
  - Optional blue-noise sampling to avoid clumping.
- **Scratch / grit overlays**  
  - Scatter micro line segments whose density follows curvature or distance to a point light.  
  - Useful for etched metal or weathered surfaces.

## 4. Geometric Modifiers

- **Curvature-aware weighting (partial)**  
  - Cache curvature per path, then blend with length weights to pinch corners and widen straights.  
  - Downsample curvature calculations and run in workers for scalability.
- **Flow field warping**  
  - Displace centerline samples with low-frequency vector fields (noise, attractor gradients, Voronoi).  
  - Keep displacements small to prevent self-intersections.
- **Dash sequencing**  
  - Break centerlines into variable-length dash patterns based on curvature or light exposure.  
  - Creates alternating filled/empty textures without extra passes.

## 5. UX Enhancements

- **Mini preview canvases**  
  - Already used for hatch gradients; replicate for other fill modes to give instant feedback.
- **Preset snapshots**  
  - Store angle/spacing/light combinations as thumbnails.  
  - Helps users compare textures quickly without rebuilding settings.
- **Diagnostics palette**  
  - Overlay toggles for normals, curvature, focus window contents, and cached path counts to debug performance.

## 6. Implementation Notes

- Keep feature flags for experimental modes to protect the main workflow.  
- Cache heavy computations (curvature, normals, flow fields) after `processPaths()` and share between preview and export.  
- Use workers or chunked execution for anything that touches thousands of paths to preserve UI responsiveness.  
- When adding CLI flags, mirror them in the web UI’s generated command string and document them in `README.md`.

---

Use this document as a living backlog; add dates, branches, or prototypes as experiments progress.
