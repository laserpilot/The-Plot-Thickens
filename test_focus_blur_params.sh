#!/bin/bash
# Test script to generate multiple versions with different parameters

INPUT="pathtree_v1.svg"
BASE_PARAMS="--offset 0.51 --fill-mode focus-blur --focus-blur-light-mode point --focus-blur-light-pos-x 50 --focus-blur-light-pos-y 50 --offset-mode normal --envelope sinTaperBoth --min-passes 1 --max-passes 10 --max-length 300"

echo "Generating test outputs with different focus-blur parameters..."
echo "This will help you see the range of effects possible."
echo ""

# Test 1: Subtle effect (your original settings were close to this)
echo "1. Subtle effect..."
node process-svg.js $INPUT pathtree_fb_subtle.svg $BASE_PARAMS \
  --focus-blur-falloff-radius 280 \
  --focus-blur-noise-min 0 \
  --focus-blur-noise-max 0.5 \
  --focus-blur-freq-min 100 \
  --focus-blur-freq-max 10

# Test 2: Moderate effect (good balance)
echo "2. Moderate effect..."
node process-svg.js $INPUT pathtree_fb_moderate.svg $BASE_PARAMS \
  --focus-blur-falloff-radius 150 \
  --focus-blur-noise-min 0 \
  --focus-blur-noise-max 1.0 \
  --focus-blur-freq-min 200 \
  --focus-blur-freq-max 5

# Test 3: Dramatic effect (clear difference)
echo "3. Dramatic effect..."
node process-svg.js $INPUT pathtree_fb_dramatic.svg $BASE_PARAMS \
  --focus-blur-falloff-radius 100 \
  --focus-blur-noise-min 0 \
  --focus-blur-noise-max 1.5 \
  --focus-blur-freq-min 300 \
  --focus-blur-freq-max 3

# Test 4: Extreme effect (maximum contrast)
echo "4. Extreme effect..."
node process-svg.js $INPUT pathtree_fb_extreme.svg $BASE_PARAMS \
  --focus-blur-falloff-radius 80 \
  --focus-blur-noise-min 0 \
  --focus-blur-noise-max 2.5 \
  --focus-blur-freq-min 500 \
  --focus-blur-freq-max 2

echo ""
echo "Done! Generated 4 test files:"
echo "  - pathtree_fb_subtle.svg (subtle, wide focus)"
echo "  - pathtree_fb_moderate.svg (balanced)"
echo "  - pathtree_fb_dramatic.svg (clear contrast)"
echo "  - pathtree_fb_extreme.svg (maximum effect)"
echo ""
echo "Open these in Inkscape/Illustrator to compare the effects!"
