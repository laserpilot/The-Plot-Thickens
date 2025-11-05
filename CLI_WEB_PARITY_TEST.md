# CLI vs Web UI Feature Parity Checklist

## Test Date: 2025-11-05
## Branch: v2-refactor (claude/shape-fill-mode-011CUp71QgN9MUJGuYeQMWEQ)

---

## Core Features

| Feature | CLI Support | Web UI Support | Test Command | Status |
|---------|-------------|----------------|--------------|--------|
| **Basic Offset** | ✅ `--offset` | ✅ | `node process-svg.js input.svg output.svg --offset 0.25` | ✅ PASS |
| **Noise** | ✅ `--noise` | ✅ | `node process-svg.js input.svg output.svg --noise 0.1` | ✅ PASS |
| **Min/Max Passes** | ✅ `--min-passes`, `--max-passes` | ✅ | `node process-svg.js input.svg output.svg --min-passes 2 --max-passes 10` | ✅ PASS |
| **Envelope Presets** | ✅ `--envelope` | ✅ | `node process-svg.js input.svg output.svg --envelope sinTaperBoth` | ✅ PASS |
| **Length Curve** | ✅ `--curve` | ✅ | `node process-svg.js input.svg output.svg --curve exponential` | ✅ PASS |

---

## Fill Modes

| Fill Mode | CLI Support | Web UI Support | Test Command | Status |
|-----------|-------------|----------------|--------------|--------|
| **Offset** | ✅ (default) | ✅ | `node process-svg.js input.svg output.svg --fill-mode offset` | ✅ PASS |
| **Crosshatch** | ✅ `--fill-mode crosshatch` | ✅ | `node process-svg.js input.svg output.svg --fill-mode crosshatch --hatch-angles 45,135` | ✅ PASS |
| **Striped** | ✅ `--fill-mode striped` | ✅ | `node process-svg.js input.svg output.svg --fill-mode striped --stripe-filled 2 --stripe-empty 1` | ✅ PASS |
| **Spiral** | ✅ `--fill-mode spiral` | ✅ | `node process-svg.js input.svg output.svg --fill-mode spiral --spiral-twist-rate 0.02` | ✅ PASS |
| **Stippling** | ✅ `--fill-mode stippling` | ❌ | `node process-svg.js input.svg output.svg --fill-mode stippling` | ⚠️ CLI only |
| **Hatch Gradient** | ✅ `--fill-mode hatch-gradient` | ✅ | `node process-svg.js input.svg output.svg --fill-mode hatch-gradient --light-angle 45` | ✅ PASS |
| **Focus Blur** | ✅ (via flags) | ✅ | `node process-svg.js input.svg output.svg --fill-mode focus-blur --focus-blur-light-angle 45` | ⚠️ NEEDS TEST |
| **Shape Fill** | ❌ **MISSING** | ✅ | N/A | ❌ **NEEDS IMPLEMENTATION** |

---

## Advanced Features

| Feature | CLI Support | Web UI Support | Test Command | Status |
|---------|-------------|----------------|--------------|--------|
| **Noise Gradient** | ✅ `--noise-gradient` | ✅ | `node process-svg.js input.svg output.svg --noise-gradient fuzzy-crisp --noise-min 0.05 --noise-max 0.4` | ✅ PASS |
| **Attractors** | ✅ `--attractors <file>` | ✅ | `node process-svg.js input.svg output.svg --attractors attractors.json` | ⚠️ NEEDS TEST |
| **Outline Extraction** | ✅ `--add-outline` | ✅ | `node process-svg.js input.svg output.svg --add-outline --outline-passes 3` | ✅ PASS |
| **Length Binning** | ✅ `--bins` | ✅ | `node process-svg.js input.svg output.svg --bins 4` | ✅ PASS |
| **Organic Hatch** | ✅ `--organic-hatch` | ❌ | `node process-svg.js input.svg output.svg --fill-mode crosshatch --organic-hatch --hatch-wiggle 0.2` | ⚠️ CLI only |

---

## Shape Fill Parameters (NEW - MISSING FROM CLI)

| Parameter | CLI Flag | Web UI | Default | Status |
|-----------|----------|--------|---------|--------|
| Shape Type | `--shape-type` | ✅ | circle | ❌ MISSING |
| Shape Fill Mode | `--shape-fill-mode` | ✅ | filled | ❌ MISSING |
| Shape Spacing | `--shape-spacing` | ✅ | 1.0 | ❌ MISSING |
| Max Width | `--shape-max-width` | ✅ | 3.0 | ❌ MISSING |
| Min Width | `--shape-min-width` | ✅ | 0.0 | ❌ MISSING |

---

## Test Script

```bash
#!/bin/bash
# Feature parity test script

echo "=== CLI vs Web UI Parity Test ==="
echo "Testing with sample SVG..."

# Create test SVG
cat > test-parity.svg << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <path d="M 20 50 L 80 50" stroke="black" fill="none" />
  <path d="M 50 20 L 50 80" stroke="black" fill="none" />
</svg>
EOF

echo "✓ Test SVG created"

# Test basic offset
echo "Testing: Basic Offset"
node process-svg.js test-parity.svg output/parity-offset.svg --offset 0.25 --max-passes 5
echo "✓ Basic offset test complete"

# Test envelopes
echo "Testing: Envelope (sinTaperBoth)"
node process-svg.js test-parity.svg output/parity-envelope.svg --envelope sinTaperBoth --offset 0.25
echo "✓ Envelope test complete"

# Test noise gradient
echo "Testing: Noise Gradient"
node process-svg.js test-parity.svg output/parity-noise-gradient.svg --noise-gradient fuzzy-crisp --noise-min 0.05 --noise-max 0.3
echo "✓ Noise gradient test complete"

# Test crosshatch
echo "Testing: Crosshatch Fill"
node process-svg.js test-parity.svg output/parity-crosshatch.svg --fill-mode crosshatch --hatch-angles 45,135 --hatch-spacing 1.0
echo "✓ Crosshatch test complete"

# Test spiral
echo "Testing: Spiral Fill"
node process-svg.js test-parity.svg output/parity-spiral.svg --fill-mode spiral --spiral-twist-rate 0.02
echo "✓ Spiral test complete"

# Test hatch gradient
echo "Testing: Hatch Gradient"
node process-svg.js test-parity.svg output/parity-hatch-gradient.svg --fill-mode hatch-gradient --light-angle 45 --light-strength 0.8
echo "✓ Hatch gradient test complete"

# Test outline extraction
echo "Testing: Outline Extraction"
node process-svg.js test-parity.svg output/parity-outline.svg --add-outline --outline-passes 3 --outline-offset 0.3
echo "✓ Outline test complete"

# Test shape fill (should fail until implemented)
echo "Testing: Shape Fill (EXPECTED TO FAIL)"
node process-svg.js test-parity.svg output/parity-shape-fill.svg --fill-mode shape-fill --shape-spacing 1.0 --shape-max-width 3.0 2>&1 || echo "✗ Shape fill not implemented in CLI"

echo ""
echo "=== Test Summary ==="
echo "Check output/ directory for generated files"
echo "Compare with web UI results for visual parity"

# Cleanup
rm test-parity.svg
