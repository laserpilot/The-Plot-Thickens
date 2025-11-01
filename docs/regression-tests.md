# Regression Tests

These commands represent "known good" workflows that must continue to work throughout the refactor.

## Test Cases

### 1. Basic offset fill (length-based)
```bash
node process-svg.js test-input.svg output/test-basic.svg \
  --offset 0.3 \
  --min-passes 2 \
  --max-passes 8
```
**Expected**: Paths get 2-8 offset passes based on their length

### 2. Focus-blur with point light
```bash
node process-svg.js test-input.svg output/test-focus-blur.svg \
  --fill-mode offset \
  --noise 0.3 \
  --noise-frequency 20 \
  --offset 0.25 \
  --min-passes 3 \
  --max-passes 10
```
**Note**: Focus-blur uses the focusBlur config object in process-svg.js

### 3. Striped fill mode
```bash
node process-svg.js pathtree_v1.svg output/test-striped.svg \
  --fill-mode striped \
  --stripe-filled 2 \
  --stripe-empty 1 \
  --offset 0.4 \
  --min-passes 1 \
  --max-passes 5
```
**Expected**: Every 3rd path is empty (2 filled, 1 empty pattern)

### 4. Spiral/twisted fill
```bash
node process-svg.js pathtree_v1.svg output/test-spiral.svg \
  --fill-mode spiral \
  --stripe-filled 3 \
  --stripe-empty 2 \
  --spiral-twist-rate 0.01 \
  --spiral-twist-offset 45 \
  --offset 0.3
```
**Expected**: Barber-pole/candy-cane weaving effect

### 5. Crosshatch fill
```bash
node process-svg.js test-input.svg output/test-crosshatch.svg \
  --fill-mode crosshatch \
  --crosshatch-angles "0,45,90" \
  --crosshatch-spacing 1.5
```
**Expected**: Three hatch angles at 1.5mm spacing

## Verification Checklist

Before declaring parity with legacy system:

- [ ] All 5 test commands execute without errors
- [ ] Output SVGs are valid and render in browser/viewer
- [ ] Visual comparison shows similar results (allow for minor numeric differences)
- [ ] File sizes are comparable (within 20%)
- [ ] CLI command generation from web UI matches these formats

## Input/Output Pairs

Store sample outputs in `output/regression/` for visual diff checking:
```bash
mkdir -p output/regression
# Run tests and save outputs with timestamp
```
