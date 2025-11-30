/**
 * Quick test: Does JSON.parse(JSON.stringify()) actually deep clone?
 */

import { STARTING_POSITIONS } from './game/constants.js';

const original = {
  players: {
    B: {
      pieces: STARTING_POSITIONS.B.map(pos => ({ ...pos, alive: true }))
    }
  }
};

console.log('\n📍 ORIGINAL:');
original.players.B.pieces.forEach(p => {
  console.log(`   P${p.id}: (${p.x}, ${p.y})`);
});

const cloned = JSON.parse(JSON.stringify(original));

console.log('\n📍 CLONED:');
cloned.players.B.pieces.forEach((p: any) => {
  console.log(`   P${p.id}: (${p.x}, ${p.y})`);
});

// Mutate cloned P5
const p5 = cloned.players.B.pieces.find((p: any) => p.id === 5);
p5.x = 999;

console.log('\n🔧 AFTER mutating CLONED P5.x = 999:');
console.log('   ORIGINAL P5:', original.players.B.pieces.find(p => p.id === 5));
console.log('   CLONED P5:  ', cloned.players.B.pieces.find((p: any) => p.id === 5));

if (original.players.B.pieces.find(p => p.id === 5)!.x === 999) {
  console.log('\n❌ BUG: Original was mutated!');
} else {
  console.log('\n✅ Deep clone working correctly');
}
