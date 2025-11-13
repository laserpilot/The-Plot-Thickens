# Utility Tools

Standalone tools for testing and tuning The Plot Thickens features.

## Barber Pole Tuner

**File:** `barber-pole-tuner.html`

A real-time visual tuning tool for dialing in barber pole stripe taper parameters.

### Usage

1. Open `barber-pole-tuner.html` in a web browser (requires a local server due to ES6 modules)

   **Option A - Using Python:**
   ```bash
   # From the project root
   python3 -m http.server 8000
   # Then open: http://localhost:8000/utils/barber-pole-tuner.html
   ```

   **Option B - Using Node.js (if you have http-server installed):**
   ```bash
   npx http-server -p 8000
   # Then open: http://localhost:8000/utils/barber-pole-tuner.html
   ```

2. Use the sliders to adjust parameters in real-time
3. Try different sample path types (wavy, straight, curved, s-curve)
4. Copy the CLI command once you find settings you like

### Key Parameters

- **Edge Sharpness**: Controls how pointy the stripe pinch is at transitions (0.1-5.0)
- **Middle Angle**: Controls the diagonal slope in the middle section (0.1-3.0)
- **Stripe Height**: Perpendicular thickness of stripe band (2-15mm)
- **Twist Frequency**: Controls "horizontal" stretch of stripes along path (0.1-1.0)

### Tips

- Start with default values (1.0 for both edge sharpness and middle angle)
- Increase edge sharpness for pointier spiral ends
- Increase middle angle for steeper diagonal slopes
- Enable "Show Gap Outlines" to see boundary lines
- Try different envelope presets to see how stripes interact with path tapers
