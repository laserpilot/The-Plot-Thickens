const { DensityField } = require('./lib/density-field.js');

const field = new DensityField(400, 400, 128);
field.computeFromPointLight(200, 200, 60, 0, 1);

const noiseMin = 0;
const noiseMax = 4.0;
const freqMin = 10000;
const freqMax = 15;

console.log('CORRECTED: Expected noise per circle:');
console.log('Light at (200,200), radius 60mm, noiseMin=0, noiseMax=4.0, freqMin=10000, freqMax=15');
console.log('');

const circles = [
  { r: 20, desc: 'Inner circle (r=20)' },
  { r: 40, desc: 'Circle r=40' },
  { r: 60, desc: 'Circle r=60 (at falloff)' },
  { r: 80, desc: 'Circle r=80' },
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
  const wavelength = freq;
  const circumference = 2 * Math.PI * circle.r;
  const wavesPerCircle = circumference / wavelength;
  
  console.log(circle.desc + ':');
  console.log('  Density: ' + density.toFixed(3));
  console.log('  Noise amplitude: ' + noiseAmp.toFixed(3) + ' mm (±' + (noiseAmp/2).toFixed(2) + 'mm)');
  console.log('  Noise wavelength: ' + freq.toFixed(1) + ' mm');
  console.log('  Waves around circle: ' + wavesPerCircle.toFixed(1));
  console.log('');
});
