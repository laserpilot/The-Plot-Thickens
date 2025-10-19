# User Workflow Guide

## New Two-Stage Loading Process

The system now uses a two-stage loading process to prevent UI freezing and give you control over when heavy processing happens.

### Stage 1: Quick Preview (Instant)

**What happens:**
- Upload your SVG file
- System quickly scans the file structure
- Shows path count immediately (usually <100ms even for large files)

**What you see:**
```
✓ SVG loaded: 254 paths found (not yet processed)
```

A blue info box appears showing:
- **254 paths** found in SVG
- "Click 'Process Paths' to calculate lengths and preview"
- **[Process Paths]** button

**At this stage:**
- ❌ No preview rendering yet
- ❌ Cannot export yet
- ❌ No length calculations
- ✅ Can see how many paths exist
- ✅ Can decide if you want to proceed

### Stage 2: Process Paths (User-Triggered)

**What you do:**
- Click the **[Process Paths]** button

**What happens:**
- Spinner appears: "Processing paths to points..."
- System converts each path to point arrays
- Calculates path lengths
- Generates preview

**What you see:**
```
✓ Processed 254 paths successfully
Path length range: 2.3 - 5803.1mm
```

**Now you can:**
- ✅ See color-coded preview
- ✅ Adjust settings (sliders, attractors, etc.)
- ✅ Export processed SVG

## Why Two Stages?

### Problem
Loading a 254-path SVG used to:
1. Parse structure (fast)
2. Convert all paths to points (slow - 2-3 seconds)
3. Calculate all lengths (slow)
4. Freeze the UI with no feedback

### Solution
Now you get:
1. Instant feedback (path count)
2. Choice to proceed
3. Clear loading indicators
4. No surprise freezing

## Export Process

### Before Export
Make sure you have:
1. ✅ Loaded an SVG file
2. ✅ Clicked "Process Paths"
3. ✅ Adjusted settings as desired

### Export Button
Click **[Export SVG]** to:
- Generate weighted paths with duplicates
- Apply offset and noise
- Download processed SVG file

**Console output shows:**
```
Generating processed SVG...
Path 0: length=5803.21, passes=20
Path 1: length=5755.32, passes=20
...
Downloading file: processed-length.svg (2453678 bytes)
Triggering download...
Download cleanup complete
Exported 4240 paths (length mode)
```

### Export Filename
- **Length mode:** `processed-length.svg`
- **Attractor mode:** `processed-attractor.svg`

## Typical Session

```
1. Upload topographical_merged.svg
   → "254 paths found" (instant)

2. Click [Process Paths]
   → Spinner shows
   → "Processing paths to points..."
   → ~2-3 seconds
   → "Processed 254 paths successfully"

3. Adjust settings
   → Min passes: 1
   → Max passes: 20
   → Base offset: 0.2mm
   → Noise: 0.1mm

4. Click [Export SVG]
   → "Exporting SVG..."
   → File downloads
   → "Exported 4240 paths (length mode)"

5. Done! ✓
```

## Troubleshooting

### "Please load and process an SVG file first"
**Cause:** Clicked Export before processing paths
**Fix:** Click the [Process Paths] button first

### Export doesn't download
**Check console for:**
- "Downloading file: X bytes" - Shows file size
- "Triggering download..." - Download initiated
- "Download cleanup complete" - Finished

**If you see low byte count (< 1000):**
- Might indicate empty SVG
- Check if paths were processed correctly

### Loading spinner never disappears
**Cause:** JavaScript error during processing
**Fix:** Check browser console for errors

### Wrong number of paths processed
**Example:** "254 paths found" but only "120 paths processed"
**Cause:** Some paths skipped due to:
- Invalid coordinates (NaN)
- Zero-length paths
- Pattern/gradient strokes

**Check console for warnings:**
```
Skipping path 42: no points generated
Skipping path 73: only fallback point (0,0)
```

## Performance Expectations

| File Size | Paths | Stage 1 (Quick) | Stage 2 (Process) |
|-----------|-------|-----------------|-------------------|
| Small     | < 50  | < 50ms          | < 500ms           |
| Medium    | 50-150| < 100ms         | 1-2 seconds       |
| Large     | 200+  | < 100ms         | 2-5 seconds       |

**Stage 1 is always fast** - shows path count immediately
**Stage 2 depends on complexity** - more paths = longer processing

## Benefits

1. **No Surprises** - See path count before committing
2. **User Control** - Decide when to process
3. **Better Feedback** - Clear status at each stage
4. **Easier Debugging** - Separate structure vs. processing errors
5. **Faster Iteration** - Can load multiple files to check path counts without processing
