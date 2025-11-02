# Phase 4 UI Refactor & Fixes - Design Document

**Date:** 2025-11-02
**Status:** Approved for implementation
**Context:** Phase 4 fixes from REFACTOR_PLAN.md

## Problem Statement

The web-v2 interface has several issues:
1. **Tab overflow** - Horizontal tabs getting cut off (Advanced tab hidden)
2. **Missing features** - Envelope/taper modes not exposed in UI
3. **Export bug** - SVG dimensions exported incorrectly (1587mm instead of 420mm)
4. **Hidden CLI command** - No way to see the equivalent CLI command
5. **Missing feedback** - Can't see detected min/max path lengths

## Solution Overview

Migrate from horizontal tabs to vertical accordion layout, add Effects section for envelopes/tapers, fix export dimensions, and add CLI command display.

## Design Details

### 1. Accordion Layout Structure

Replace horizontal tabs with collapsible vertical sections:

```
┌─────────────────────────────────┐
│ ▼ File Upload & Settings       │  ← Expanded (default)
│ ▼ Fill Mode                     │  ← Expanded (default)
│ ▶ Effects                        │  ← Collapsed (default)
│ ▶ Attractors                     │  ← Collapsed (default)
│ ▶ Advanced Options               │  ← Collapsed (default)
│ ▼ Export                         │  ← Expanded (default)
└─────────────────────────────────┘
```

**Benefits:**
- No horizontal overflow issues
- Scalable for future features
- Multiple sections visible simultaneously
- Standard pattern in creative software

**Implementation:**
- Click section header to toggle expand/collapse
- ▼/▶ indicator shows state
- CSS transitions for smooth animation
- Store expanded state: `expandedSections: Set<string>`

### 2. New Effects Section

Groups envelope modes, length mapping, and noise controls:

```
▼ Effects

  Envelope / Taper Mode:
  [Dropdown: Flat ▼]
    - Flat (no taper)
    - sinTaperBoth
    - sinTaper
    - linearTaper
    - linearTaperBoth
    - easeInOut
    - exponential

  Length → Weight Curve:
  [Dropdown: Linear ▼]
    - Linear
    - easeIn
    - easeOut
    - easeInOut

  Length Thresholding:
  Min Length (mm): [____0____] (0 = auto-detect)
  Detected range: 2.3mm - 145.7mm  ← Dynamic display

  Max Length (mm): [____0____] (0 = auto-detect)

  Noise & Variation:
  Noise (mm): [__0.0__]
  Noise Frequency (mm): [__50__]
  Sample Rate (mm): [__2__]
```

**Key features:**
- Envelope dropdown maps to `getEnvelopePreset()` in path-utils.js
- Length curve exposes existing `curve` config (currently hidden)
- Detected range updates after processing
- Noise controls moved from Advanced (better discoverability)

### 3. Export Section Updates

**3A. CLI Command Display**

Add read-only text field showing equivalent CLI command:

```
CLI Command:
┌────────────────────────────────────────────────┐
│ node process-svg.js input.svg --offset 0.25... │
└────────────────────────────────────────────────┘
[Copy to Clipboard]
```

- Single-line text input (read-only, horizontally scrollable)
- Auto-updates when config changes
- Copy button uses `navigator.clipboard.writeText()`

**3B. Output Size Controls**

```
Output Size:
● Keep original (420 × 297 mm)
○ A3 Landscape (420 × 297 mm)
○ A3 Portrait (297 × 420 mm)
```

- Radio buttons for dimension override
- "Keep original" preserves input SVG width/height
- A3 options resize/fit to standard sizes
- Only affects export, not preview

**3C. Dimension Bug Fix**

**Problem:** Currently exports incorrect dimensions:
```xml
<!-- WRONG (current) -->
<svg width="1587.4016mm" height="1122.5197mm" ...>

<!-- CORRECT (should be) -->
<svg width="420mm" height="297mm" ...>
```

**Root cause:** Exporter uses viewBox coordinates as width/height values

**Solution:** Preserve original SVG's width/height attributes:
- Store original width/height during SVG parsing
- Use original values in export
- Apply output size override if selected

### 4. State Changes

**New config properties:**
```javascript
config: {
  envelope: 'flat',        // NEW: envelope preset name
  curve: 'linear',         // EXPOSE: already exists but hidden
  outputSize: 'original',  // NEW: 'original'|'a3-landscape'|'a3-portrait'
  // ... existing config
}
```

**New UI state:**
```javascript
expandedSections: new Set(['file', 'fills', 'export']), // NEW
detectedMinLength: null,   // NEW: populated after processing
detectedMaxLength: null,   // NEW: populated after processing
```

**Original SVG metadata (preserve for export):**
```javascript
originalSvgMetadata: {
  width: '420mm',
  height: '297mm',
  viewBox: '0 0 1587.4016 1122.5197'
}
```

## Implementation Files

**Modified:**
1. `web-v2/index.html` - Restructure from tabs to accordion sections
2. `web-v2/src/styles/main.css` - Accordion styles, transitions
3. `web-v2/src/ui/app.js` - Accordion handlers, CLI command builder
4. `web-v2/src/state/store.js` - Add new state properties
5. `web-v2/src/utils/processor.js` - Pass envelope, detect min/max lengths
6. `web-v2/src/utils/svg-loader.js` - Store original width/height metadata
7. `web-v2/src/utils/svg-export.js` - Fix dimensions, apply output size override

**New files:**
- None (all changes to existing files)

## Testing Checklist

- [ ] Accordion sections expand/collapse correctly
- [ ] Smart defaults applied on load (File, Fills, Export expanded)
- [ ] Envelope dropdown changes affect output visually
- [ ] Length curve dropdown affects weight distribution
- [ ] Detected min/max length displays after processing
- [ ] CLI command updates when config changes
- [ ] Copy to Clipboard button works
- [ ] Export preserves original dimensions (420mm × 297mm)
- [ ] A3 landscape override resizes correctly
- [ ] A3 portrait override resizes correctly
- [ ] No regression in existing features (attractors, fill modes, etc.)

## Success Metrics

- All tabs/sections accessible (no cutoff)
- Envelope modes functional and discoverable
- Export dimensions correct (matches input or override)
- CLI command accurately reflects UI state
- Users can see detected length ranges

## Future Enhancements (Out of Scope)

- Visual curve editor for length→weight mapping
- Custom output size input (arbitrary dimensions)
- Save/load accordion expanded state preferences
- Keyboard shortcuts for section navigation
