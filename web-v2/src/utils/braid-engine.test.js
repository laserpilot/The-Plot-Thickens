/**
 * Test script for braid-engine.js
 *
 * Run with: node braid-engine.test.js
 */

import { generateBraid } from './braid-engine.js';

console.log('Testing braid-engine module...\n');

// Test 1: Straight backbone (null)
console.log('Test 1: Straight braid (null backbone)');
const straightBraid = generateBraid(null, {
  frequency: 2.0,
  braidLength: 600,
  fiberCount: 8,
  fiberBow: 0.6
});

console.log('  Outlines:', straightBraid.outlines.length);
console.log('  Fibers:', straightBraid.fibers.length);
console.log('  Center extrema:', straightBraid.metadata.centerExtremaCount);
console.log('  Continuations:', straightBraid.metadata.continuationCount);
console.log('  ✓ Generated successfully\n');

// Test 2: Simple vertical backbone
console.log('Test 2: Vertical backbone');
const verticalBackbone = {
  getPointAt(t) {
    return { x: 200, y: t * 800 };
  },
  getTangentAt(t) {
    return { x: 0, y: 1 };
  }
};

const verticalBraid = generateBraid(verticalBackbone, {
  frequency: 2.5,
  braidLength: 800,
  zigzagScale: 1.2,
  wallScale: 1.1,
  fiberCount: 12
});

console.log('  Outlines:', verticalBraid.outlines.length);
console.log('  Fibers:', verticalBraid.fibers.length);
console.log('  First outline point:', verticalBraid.outlines[0].points[0]);
console.log('  ✓ Generated successfully\n');

// Test 3: Wavy backbone (sine wave)
console.log('Test 3: Wavy backbone (sine wave)');
const wavyBackbone = {
  getPointAt(t) {
    const y = t * 800;
    const x = 200 + Math.sin(t * Math.PI * 2) * 100;
    return { x, y };
  },
  getTangentAt(t) {
    const delta = 0.001;
    const p0 = this.getPointAt(Math.max(0, t - delta));
    const p1 = this.getPointAt(Math.min(1, t + delta));
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    return { x: dx / len, y: dy / len };
  }
};

const wavyBraid = generateBraid(wavyBackbone, {
  frequency: 3.0,
  braidLength: 800,
  fiberBow: 0.7,
  bowGradient: 2.5,
  tipTaper: 0.3
});

console.log('  Outlines:', wavyBraid.outlines.length);
console.log('  Fibers:', wavyBraid.fibers.length);
console.log('  Metadata:', wavyBraid.metadata);
console.log('  ✓ Generated successfully\n');

// Test 4: Verify output structure
console.log('Test 4: Verify output structure');
const testBraid = generateBraid(null, { braidLength: 400 });

// Check outlines structure
const hasValidOutlines = testBraid.outlines.every(outline => {
  return (
    outline.side &&
    outline.type &&
    Array.isArray(outline.points) &&
    outline.points.length > 0 &&
    outline.points.every(p => typeof p.x === 'number' && typeof p.y === 'number')
  );
});

// Check fibers structure
const hasValidFibers = testBraid.fibers.every(fiber => {
  return (
    fiber.side &&
    Array.isArray(fiber.points) &&
    fiber.points.length > 0 &&
    typeof fiber.pairIndex === 'number' &&
    typeof fiber.fiberIndex === 'number'
  );
});

// Check metadata
const hasValidMetadata = (
  testBraid.metadata &&
  typeof testBraid.metadata.braidLength === 'number' &&
  typeof testBraid.metadata.fiberCount === 'number' &&
  testBraid.metadata.parameters
);

console.log('  Valid outlines:', hasValidOutlines ? '✓' : '✗');
console.log('  Valid fibers:', hasValidFibers ? '✓' : '✗');
console.log('  Valid metadata:', hasValidMetadata ? '✓' : '✗');

if (hasValidOutlines && hasValidFibers && hasValidMetadata) {
  console.log('  ✓ All structure checks passed\n');
} else {
  console.log('  ✗ Some structure checks failed\n');
  process.exit(1);
}

// Test 5: Parameter variations
console.log('Test 5: Parameter variations');
const variations = [
  { name: 'High frequency', params: { frequency: 4.0 } },
  { name: 'Low frequency', params: { frequency: 1.0 } },
  { name: 'Many fibers', params: { fiberCount: 20 } },
  { name: 'Few fibers', params: { fiberCount: 3 } },
  { name: 'Strong bow', params: { fiberBow: 1.0 } },
  { name: 'No bow', params: { fiberBow: 0.0 } },
  { name: 'High taper', params: { tipTaper: 0.8 } }
];

variations.forEach(({ name, params }) => {
  const braid = generateBraid(null, { braidLength: 600, ...params });
  console.log(`  ${name}:`, braid.fibers.length, 'fibers,', braid.outlines.length, 'outlines');
});

console.log('  ✓ All variations generated successfully\n');

console.log('✅ All tests passed!');
