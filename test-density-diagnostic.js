const { DensityField } = require('./lib/density-field.js');

console.log('=== DENSITY FIELD DIAGNOSTIC ===\n');

// Test with different falloff radii
const configs = [
  { radius: 50, desc: 'Tight (r=50)' },
  { radius: 100, desc: 'Medium (r=100)' },
  { radius: 200, desc: 'Wide (r=200)' },
];

configs.forEach(config => {
  console.log(`Falloff radius: ${config.desc}`);
  const field = new DensityField(400, 400, 128);
  field.computeFromPointLight(200, 200, config.radius, 0, 1);
  
  // Sample at center and far edge
  const center = field.sample(200, 200);
  const edge = field.sample(380, 200); // 180mm from center
  const corner = field.sample(400, 400); // ~280mm from center
  
  console.log(`  At center (0mm): ${center.toFixed(3)}`);
  console.log(`  At 180mm away: ${edge.toFixed(3)}`);
  console.log(`  At corner (~280mm): ${corner.toFixed(3)}`);
  console.log(`  Range: ${(corner - center).toFixed(3)}`);
  console.log('');
});

console.log('\n=== NOISE MAPPING TEST ===\n');

// Show what happens with current settings
const field = new DensityField(400, 400, 128);
field.computeFromPointLight(200, 200, 50, 0, 1);

const noiseMin = 0.01;
const noiseMax = 5.0;
const freqMin = 50;
const freqMax = 8;

console.log('Settings: noiseMin=0.01, noiseMax=5.0, freqMin=50, freqMax=8\n');

const points = [
  { x: 200, y: 200, desc: 'Center (r=0)' },
  { x: 260, y: 200, desc: 'r=60' },
  { x: 300, y: 200, desc: 'r=100' },
  { x: 380, y: 200, desc: 'r=180 (outer circle)' },
];

points.forEach(pt => {
  const density = field.sample(pt.x, pt.y);
  const noise = noiseMin + density * (noiseMax - noiseMin);
  const freq = freqMin + density * (freqMax - freqMin);
  
  console.log(`${pt.desc}:`);
  console.log(`  Density: ${density.toFixed(3)}`);
  console.log(`  → Noise: ${noise.toFixed(3)} mm`);
  console.log(`  → Frequency: ${freq.toFixed(1)} mm`);
  console.log('');
});
