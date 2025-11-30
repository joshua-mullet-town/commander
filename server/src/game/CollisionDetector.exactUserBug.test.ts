/**
 * Test: Exact User Bug Scenario
 *
 * User's exact description:
 * - Blue P1 at (0, 0) - top-left corner, attacking
 * - Red piece at (9, 10) - on Blue's flag
 * - Blue P3 at (9, 8) - BLOCKING Red's path home
 * - Red moves from (9, 10) DOWN 10 cells to (9, 0) - their flag
 * - Red should collide with Blue P3 at (9, 8) on step 2
 * - Red should be blocked by no-guard zone (y=0-1)
 *
 * Bug: Red somehow passes through Blue P3 and reaches (9, 0)
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { CommanderGameState } from './types.js';
import { CommandProcessor } from './CommandProcessor.js';
import { CollisionDetector } from './CollisionDetector.js';
import { FlagManager } from './FlagManager.js';

test('EXACT USER BUG: Red at (9,10) should NOT pass through Blue P3 at (9,8)', () => {
  console.log('\n🧪 TEST: EXACT USER BUG SCENARIO\n');

  const gameState: CommanderGameState = {
    currentRound: 20,
    players: {
      A: {
        id: 'player-a',
        type: 'local-a' as const,
        pieces: [
          { id: 1, x: 0, y: 0, alive: true },   // Blue P1 attacking from top-left
          { id: 2, x: 7, y: 8, alive: true },
          { id: 3, x: 9, y: 8, alive: true },   // Blue P3 BLOCKING at (9, 8)!!!
          { id: 4, x: 10, y: 8, alive: true },
          { id: 5, x: 11, y: 8, alive: true }
        ],
        jailedPieces: []
      },
      B: {
        id: 'player-b',
        type: 'local-b' as const,
        pieces: [
          { id: 1, x: 9, y: 10, alive: true },  // Red P1 on Blue's flag, returning home
          { id: 2, x: 8, y: 2, alive: true },
          { id: 3, x: 10, y: 2, alive: true },
          { id: 4, x: 11, y: 2, alive: true },
          { id: 5, x: 15, y: 2, alive: true }
        ],
        jailedPieces: []
      }
    },
    flags: {
      A: { x: 9, y: 10, carriedBy: null },  // Blue flag at spawn
      B: { x: 9, y: 0, carriedBy: null }    // Red flag at spawn
    },
    rescueKeys: {
      A: null,
      B: null
    },
    noGuardZoneActive: {
      A: true,   // Blue no-guard zone active
      B: true    // Red no-guard zone ACTIVE (user confirmed flag not captured)
    },
    noGuardZoneBounds: {
      A: { minX: 7, maxX: 11, minY: 9, maxY: 10 },
      B: { minX: 7, maxX: 11, minY: 0, maxY: 1 }
    }
  };

  const commandProcessor = new CommandProcessor();
  const collisionDetector = new CollisionDetector();
  const flagManager = new FlagManager();

  const blueP1 = gameState.players.A.pieces[0];
  const blueP3 = gameState.players.A.pieces[2];
  const redP1 = gameState.players.B.pieces[0];

  console.log('📍 EXACT SCENARIO FROM USER:');
  console.log(`   Blue P1: (${blueP1.x}, ${blueP1.y}) - top-left corner, attacking`);
  console.log(`   Blue P3: (${blueP3.x}, ${blueP3.y}) - BLOCKING Red's path!`);
  console.log(`   Red P1:  (${redP1.x}, ${redP1.y}) - on Blue's flag`);
  console.log(`   Red flag: (9, 0)`);
  console.log(`   Red no-guard zone: y=0-1 (ACTIVE)\n`);

  // User said they moved RIGHT toward Red flag
  // Red moved DOWN to their flag
  const commands = {
    playerA: [{ pieceId: 1, direction: 'right' as const, distance: 9 }],  // Blue P1 → (9,0)
    playerB: [{ pieceId: 1, direction: 'down' as const, distance: 10 }]   // Red P1 → (9,0)
  };

  console.log('🎮 Commands:');
  console.log(`   Blue P1: Move RIGHT 9 cells (0,0) → (9,0)`);
  console.log(`   Red P1:  Move DOWN 10 cells (9,10) → (9,0)\n`);

  console.log('🔍 EXPECTED BEHAVIOR:');
  console.log('   Step 1: Red at (9,10) moves to (9,9)');
  console.log('   Step 2: Red at (9,9) moves to (9,8) → COLLISION with Blue P3!');
  console.log('   Step 3+: Red path should be TRUNCATED at (9,8)');
  console.log('   Result: Both Red P1 and Blue P3 should be jailed at (9,8)\n');

  // Execute movements
  const paths = commandProcessor.executeMovements(gameState, commands);

  console.log('📍 Movement paths generated:');
  const redPath = paths.find(p => p.player === 'B' && p.pieceId === 1);
  if (redPath) {
    const pathStr = redPath.path.slice(0, 5).map(pos => `(${pos.x},${pos.y})`).join(' → ');
    console.log(`   Red P1: ${pathStr}... | final: (${redPath.finalPosition.x},${redPath.finalPosition.y})`);
  }

  // Detect collisions
  const collisions = collisionDetector.detectCollisions(paths);

  console.log(`\n⚔️  Collisions detected: ${collisions.length}`);
  collisions.forEach(c => {
    console.log(`   ${c.player} P${c.pieceId} at (${c.x}, ${c.y}) step ${c.step}`);
  });

  // Apply final positions
  commandProcessor.applyFinalPositions(gameState, paths);

  console.log('\n📍 Final positions:');
  console.log(`   Blue P1: (${blueP1.x}, ${blueP1.y}) alive: ${blueP1.alive}`);
  console.log(`   Blue P3: (${blueP3.x}, ${blueP3.y}) alive: ${blueP3.alive}`);
  console.log(`   Red P1:  (${redP1.x}, ${redP1.y}) alive: ${redP1.alive}\n`);

  // Resolve collisions
  collisionDetector.resolveCollisions(
    gameState,
    collisions,
    (gs, player, pieceId) => flagManager.onPieceCaptured(gs, player, pieceId)
  );

  console.log('❤️  Final alive status:');
  console.log(`   Blue P1: ${blueP1.alive}`);
  console.log(`   Blue P3: ${blueP3.alive}`);
  console.log(`   Red P1:  ${redP1.alive}\n`);

  // ASSERTIONS
  assert.ok(collisions.length >= 2, 'Should detect collision between Red P1 and Blue P3');

  const redCollision = collisions.find(c => c.player === 'B' && c.pieceId === 1);
  const blueP3Collision = collisions.find(c => c.player === 'A' && c.pieceId === 3);

  assert.ok(redCollision, 'Red P1 should be in collision list');
  assert.ok(blueP3Collision, 'Blue P3 should be in collision list');

  // Critical: Collision should happen at (9, 8) on step 2
  assert.strictEqual(redCollision.x, 9, 'Red collision should be at x=9');
  assert.strictEqual(redCollision.y, 8, 'Red collision should be at y=8 (Blue P3 position)');
  assert.strictEqual(redCollision.step, 2, 'Red collision should be at step 2 of journey');

  // Red P1 should be stopped at (9, 8), NOT reach (9, 0)
  assert.strictEqual(redP1.x, 9, 'Red P1 should stay at x=9');
  assert.strictEqual(redP1.y, 8, `Red P1 should be STOPPED at y=8, not y=${redP1.y}`);
  assert.notStrictEqual(redP1.y, 0, 'Red P1 should NOT reach their flag at y=0');

  // Territory check: y=8 is Blue territory (y>=6)
  // Red P1 (invader) collides with Blue P3 (defender in own territory)
  // CORRECT BEHAVIOR: Red jailed, Blue P3 stays safe (defender advantage)
  assert.strictEqual(redP1.alive, false, 'Red P1 should be jailed (invader in enemy territory)');
  assert.strictEqual(blueP3.alive, true, 'Blue P3 should stay alive (defender in own territory)');

  console.log('✅ TEST PASSED: Red P1 correctly stopped at (9,8) by Blue P3\n');
});
