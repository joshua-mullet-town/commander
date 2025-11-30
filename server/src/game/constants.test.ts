/**
 * Test: Verify starting positions are unique
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { STARTING_POSITIONS } from './constants.js';

test('All Team B starting positions should be unique', () => {
  const positions = STARTING_POSITIONS.B;

  console.log('\n📍 Team B Starting Positions:');
  positions.forEach(p => {
    console.log(`   P${p.id}: (${p.x}, ${p.y})`);
  });

  // Check for duplicates
  const positionStrings = positions.map(p => `${p.x},${p.y}`);
  const uniquePositions = new Set(positionStrings);

  assert.strictEqual(
    uniquePositions.size,
    positions.length,
    `Found duplicate starting positions! ${positionStrings.join(' | ')}`
  );

  // Specifically check P4 and P5
  const p4 = positions.find(p => p.id === 4);
  const p5 = positions.find(p => p.id === 5);

  assert.ok(p4, 'P4 should exist');
  assert.ok(p5, 'P5 should exist');

  console.log(`\n🔍 P4: (${p4!.x}, ${p4!.y})`);
  console.log(`🔍 P5: (${p5!.x}, ${p5!.y})`);

  assert.notStrictEqual(
    `${p4!.x},${p4!.y}`,
    `${p5!.x},${p5!.y}`,
    'P4 and P5 should have different positions!'
  );

  console.log('\n✅ All starting positions are unique\n');
});
