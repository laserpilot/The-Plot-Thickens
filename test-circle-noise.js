const { DensityField } = require('./lib/density-field.js');

const field = new DensityField(400, 400, 128);
field.computeFromPointLight(200, 200, 80, 0, 1);

const noiseMin = 0;
const noiseMax = 3.0;
const freqMin = 1000;
const freqMax = 0.5;

console.log('Expected noise per circle:');
console.log('Light at (200,200), radius 80mm, noiseMin=0, noiseMax=3.0, freqMin=1000, freqMax=0.5');
console.log('');

const circles = [
  { r: 20, desc: 'Inner circle (r=20)' },
  { r: 40, desc: 'Circle r=40' },
  { r: 60, desc: 'Circle r=60' },
  { r: 80, desc: 'Circle r=80 (at falloff radius)' },
  { r: 100, desc: 'Circle r=100' },
  { r: 120, desc: 'Circle r=120' },
  { r: 140, desc: 'Circle r=140' },
  { r: 160, desc: 'Circle r=160' },
  { r: 180, desc: 'Outer circle (r=180)' },
];

circles.forEach(circle => {
  const x = 200 + circle.r;
  const y = 200;
  const density = field.sample(x, y);
  const noiseAmp = noiseMin + density * (noiseMax - noiseMin);
  const freq = freqMin + density * (freqMax - freqMin);
  
  console.log(circle.desc + ':');
  console.log('  Density: ' + density.toFixed(3));
  console.log('  Noise amplitude: ' + noiseAmp.toFixed(3) + ' mm');
  console.log('  Noise frequency: ' + freq.toFixed(2) + ' mm');
  console.log('');
});
