# Testing Checklist

## Export Workflow Testing

### Test 1: Manual Processing (Original Flow)
1. Open `web/index.html` in browser
2. Upload `topographical_merged.svg`
3. ✓ Should see: "254 paths found in SVG"
4. ✓ Blue info box appears with "Process Paths" button
5. Click "Process Paths"
6. ✓ Progress bar appears: "Processing 25/254 paths (10%)..."
7. ✓ Progress completes: "Processed 254 paths in 2.3s"
8. ✓ Preview renders with colored paths
9. Click "Export SVG"
10. ✓ Status: "Exporting SVG..."
11. ✓ Console: "Exported 432 paths (length mode)"
12. ✓ File downloads as `processed-length.svg`

### Test 2: Auto-Processing (Skip Manual Step)
1. Open `web/index.html` in browser
2. Upload `topographical_merged.svg`
3. ✓ Should see: "254 paths found in SVG"
4. **Skip "Process Paths" button**
5. Click "Export SVG" immediately
6. ✓ Console: "Paths not yet processed - processing now for export..."
7. ✓ Progress bar appears automatically
8. ✓ Progress completes: "Processed 254 paths..."
9. ✓ Status: "Exporting SVG..."
10. ✓ Console: "Exported 432 paths (length mode)"
11. ✓ File downloads as `processed-length.svg`

### Test 3: Export Without Loading
1. Open `web/index.html` in browser
2. Don't upload anything
3. Click "Export SVG"
4. ✓ Alert: "Please load an SVG file first"

## Parameter Preview Testing

### Test 4: Live Preview Widget
1. Open `web/index.html`
2. ✓ See preview canvas in "Line Weight Settings" section
3. Move "Base Offset" slider
4. ✓ Preview circles spread apart/together
5. Move "Noise" slider
6. ✓ Preview circles become wavy/smooth
7. Move "Max Passes" slider
8. ✓ Preview shows more/fewer circles
9. ✓ Label updates: "15 passes @ 0.4mm ± 0.3mm"

### Test 5: Tooltips
1. ✓ See blue "?" icons next to each slider
2. Hover over "?" next to "Base Offset"
3. ✓ Tooltip: "Distance between duplicate lines"
4. Hover over slider label
5. ✓ Detailed tooltip appears
6. Check all four sliders have working tooltips

## Zoom/Pan Testing

### Test 6: Mouse Wheel Zoom
1. Upload and process an SVG
2. Scroll mouse wheel up
3. ✓ Drawing zooms in toward cursor
4. ✓ Status bar: "... | Zoom: 150%"
5. Scroll mouse wheel down
6. ✓ Drawing zooms out
7. ✓ Zoom constrained to 10% - 1000%

### Test 7: Pan with Space+Drag
1. Upload and process an SVG
2. Hold spacebar
3. Click and drag
4. ✓ Cursor changes to "grab"
5. ✓ Drawing pans around
6. Release spacebar
7. ✓ Cursor returns to normal

### Test 8: Pan with Middle Mouse
1. Upload and process an SVG
2. Click middle mouse button (scroll wheel click)
3. Drag mouse
4. ✓ Drawing pans around
5. Release
6. ✓ Normal behavior resumes

## Performance Testing

### Test 9: Progress Bar
1. Upload `topographical_merged.svg` (254 paths)
2. Click "Process Paths"
3. ✓ Progress bar appears immediately
4. ✓ Shows: "Processing 25/254 paths (10%)"
5. ✓ Bar fills smoothly from 0% to 100%
6. ✓ Elapsed time updates: "Elapsed: 0.8s", "1.5s", etc.
7. ✓ Completes in 2-4 seconds
8. ✓ Final message: "Processed 254 paths in 2.3s"

### Test 10: Reduced Sampling
1. Upload and process an SVG
2. Zoom in to 500%
3. ✓ Paths look reasonably smooth (not too blocky)
4. ✓ Not overly detailed (100 samples max, not 800)
5. Check console for point counts
6. ✓ Long paths should have ~100 points, not thousands

## Edge Cases

### Test 11: Very Small SVG
1. Upload `test-input.svg` (simple, few paths)
2. ✓ Processes instantly
3. ✓ Export works

### Test 12: Export Before Processing
1. Upload SVG
2. Immediately click Export (before it finishes loading)
3. ✓ Should either process automatically or show helpful message

### Test 13: Double-Click Process
1. Upload SVG
2. Click "Process Paths"
3. While processing, click "Process Paths" again
4. ✓ Should not crash or double-process

### Test 14: Parameter Changes
1. Upload and process SVG
2. Change "Base Offset" from 0.2 to 1.0
3. ✓ Preview widget updates
4. ✓ Main canvas updates (if visible at current zoom)
5. Export and check result

## Browser Compatibility

### Test 15: Chrome
- ✓ All features work
- ✓ Downloads work
- ✓ Progress bar animates smoothly

### Test 16: Firefox
- ✓ All features work
- ✓ Downloads work
- ✓ Tooltips display correctly

### Test 17: Safari
- ✓ All features work
- ✓ Downloads work
- ✓ Mouse wheel zoom works

## Expected Console Output

### Successful Upload + Process + Export:
```
Quick parse: Found 254 valid paths
SVG loaded: 254 paths found
[User clicks Process Paths]
Processing 254 paths to points...
Path 0: 95 points, length=5803.21
Path 1: 94 points, length=5755.32
Path 2: 6 points, length=2.32
Processed 254 paths successfully
Path length range: 2.3 - 5803.1mm
[User clicks Export]
Generating processed SVG...
Path 0: length=5803.2146173547905, passes=20
Path 1: length=5755.321459934406, passes=20
...
Path 253: length=4030.039231336049, passes=7
Downloading file: processed-length.svg (245367 bytes)
MIME type: image/svg+xml
Triggering download for processed-length.svg...
Download cleanup complete
Exported 432 paths (length mode)
```

### Auto-Process on Export:
```
Quick parse: Found 254 valid paths
SVG loaded: 254 paths found
[User clicks Export without processing]
Paths not yet processed - processing now for export...
Processing 254 paths to points...
[... processing output ...]
Processed 254 paths successfully
Generating processed SVG...
[... export output ...]
Exported 432 paths (length mode)
```

## Known Issues

- None currently! 🎉

## Performance Benchmarks

| File | Paths | Processing Time | Export Time |
|------|-------|----------------|-------------|
| test-input.svg | 3 | < 0.1s | < 0.1s |
| topographical_merged.svg | 254 | 2-4s | 1-2s |
| trick_of_the_light_cropped.svg | ~150 | 1-2s | 0.5-1s |
