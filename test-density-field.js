// Quick test to verify density field is working correctly
const { DensityField } = require('./lib/density-field.js');

// Create field matching our test SVG (400x400)
const field = new DensityField(400, 400, 128);

// Light at center (200, 200) with radius 100
field.computeFromPointLight(200, 200, 100, 0, 1);

// Sample at various distances from center
console.log('Density Field Test:');
console.log('Light at center (200, 200), falloff radius 100');
console.log('');

const testPoints = [
  { x: 200, y: 200, desc: 'At light source (center)' },
  { x: 200, y: 220, desc: '20mm from center' },
  { x: 200, y: 250, desc: '50mm from center' },
  { x: 200, y: 280, desc: '80mm from center' },
  { x: 200, y: 300, desc: '100mm from center (falloff radius)' },
  { x: 200, y: 350, desc: '150mm from center' },
  { x: 200, y: 380, desc: '180mm from center (near edge)' },
];

testPoints.forEach(pt => {
  const density = field.sample(pt.x, pt.y);
  const noise = 0 + density * (2.0 - 0);
  const freq = 500 + density * (2 - 500);
  console.log(pt.desc + ':');
  console.log('  Position: (' + pt.x + ', ' + pt.y + ')');
  console.log('  Density: ' + density.toFixed(3) + ' (0=focus, 1=blur)');
  console.log('  Noise amplitude: ' + noise.toFixed(3));
  console.log('  Noise frequency: ' + freq.toFixed(1));
  console.log('');
});
