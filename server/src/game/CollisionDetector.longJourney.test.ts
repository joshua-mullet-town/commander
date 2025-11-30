/**
 * Test: Long Journey Bug - Red piece moving from Blue flag to Red flag
 *
 * Scenario (from user's description):
 * 1. Red piece is on Blue's flag at (9, 10)
 * 2. Blue piece at (0, 0) is moving RIGHT toward Red flag at (9, 0)
 * 3. Blue P3 is between Red piece and Red flag (somewhere in the middle)
 * 4. Red piece moves UP from (9, 10) to Red flag at (9, 0) - a journey of 10 cells
 * 5. Red should collide with Blue P3 on the way and be stopped
 * 6. Red should be blocked by their own no-guard zone near their flag
 *
 * Expected: Red piece stopped by Blue P3 blocker mid-journey
 * Bug: Red piece passes through Blue P3 and reaches their own flag
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { CommanderGameState } from './types.js';
import { CommandProcessor } from './CommandProcessor.js';
import { CollisionDetector } from './CollisionDetector.js';
import { FlagManager } from './FlagManager.js';

test('Red piece moving from Blue flag to Red flag should NOT pass through Blue blocker', () => {
  console.log('\n🧪 TEST: Long Journey Bug - Red returns to defend flag\n');

  const gameState: CommanderGameState = {
    currentRound: 15,
    players: {
      A: {
        id: 'player-a',
        type: 'local-a' as const,
        pieces: [
          { id: 1, x: 0, y: 0, alive: true },  // Blue P1 at upper left (attacking Red flag)
          { id: 2, x: 7, y: 8, alive: true },
          { id: 3, x: 9, y: 5, alive: true },  // Blue P3 BLOCKING at neutral zone - in Red's path!
          { id: 4, x: 10, y: 8, alive: true },
          { id: 5, x: 11, y: 8, alive: true }
        ],
        jailedPieces: []
      },
      B: {
        id: 'player-b',
        type: 'local-b' as const,
        pieces: [
          { id: 1, x: 9, y: 10, alive: true }, // Red P1 on Blue's flag (returning to defend)
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
      A: true,
      B: true  // Red's no-guard zone is ACTIVE
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

  console.log('📍 Initial positions:');
  console.log(`   Blue P1: (${blueP1.x}, ${blueP1.y}) - attacking Red flag`);
  console.log(`   Blue P3: (${blueP3.x}, ${blueP3.y}) - BLOCKER in neutral zone`);
  console.log(`   Red P1:  (${redP1.x}, ${redP1.y}) - on Blue's flag, returning to defend`);
  console.log(`   Red flag: (${gameState.flags.B.x}, ${gameState.flags.B.y})`);
  console.log(`   Red no-guard zone: y=0-1, x=7-11 (ACTIVE)\n`);

  // Blue P1 moves RIGHT toward Red flag
  // Red P1 moves DOWN to return to their flag
  const commands = {
    playerA: [{ pieceId: 1, direction: 'right' as const, distance: 9 }],
    playerB: [{ pieceId: 1, direction: 'down' as const, distance: 10 }] // Long journey!
  };

  console.log('🎮 Commands:');
  console.log(`   Blue P1: Move RIGHT 9 cells (toward Red flag)`);
  console.log(`   Red P1:  Move DOWN 10 cells (returning to Red flag)\n`);

  // Execute movements
  const paths = commandProcessor.executeMovements(gameState, commands);

  console.log('📍 Movement paths:');
  paths.forEach(p => {
    const pathStr = p.path.map(pos => `(${pos.x},${pos.y})`).join(' → ');
    console.log(`   ${p.player} P${p.pieceId}: ${pathStr} | final: (${p.finalPosition.x},${p.finalPosition.y})`);
  });

  // Detect collisions
  const collisions = collisionDetector.detectCollisions(paths);

  console.log(`\n⚔️  Collisions detected: ${collisions.length}`);
  collisions.forEach(c => {
    console.log(`   ${c.player} P${c.pieceId} at (${c.x}, ${c.y}) step ${c.step}`);
  });

  // Apply final positions
  commandProcessor.applyFinalPositions(gameState, paths);

  console.log('\n📍 Final positions (before collision resolution):');
  console.log(`   Blue P1: (${blueP1.x}, ${blueP1.y})`);
  console.log(`   Blue P3: (${blueP3.x}, ${blueP3.y})`);
  console.log(`   Red P1:  (${redP1.x}, ${redP1.y})\n`);

  // Resolve collisions
  collisionDetector.resolveCollisions(
    gameState,
    collisions,
    (gs, player, pieceId) => flagManager.onPieceCaptured(gs, player, pieceId)
  );

  console.log('❤️  Alive status:');
  console.log(`   Blue P1: ${blueP1.alive}`);
  console.log(`   Blue P3: ${blueP3.alive}`);
  console.log(`   Red P1:  ${redP1.alive}\n`);

  // ASSERTIONS
  // Red P1 should collide with Blue P3 at (9, 5) during step 5 of their journey
  assert.ok(collisions.length > 0, 'Should detect collision between Red P1 and Blue P3');

  const redP1Collision = collisions.find(c => c.player === 'B' && c.pieceId === 1);
  assert.ok(redP1Collision, 'Red P1 should be in collision list');

  // Red P1 should be stopped at collision point, NOT at their flag
  assert.strictEqual(redP1.y, 5, `Red P1 should be stopped at collision point y=5 (Blue P3 position), NOT at y=${redP1.y}`);

  // Red P1 should NOT reach their flag (y=0)
  assert.notStrictEqual(redP1.y, 0, 'Red P1 should NOT reach their flag at y=0');

  // Path should be truncated at collision point
  const redP1Path = paths.find(p => p.player === 'B' && p.pieceId === 1);
  assert.ok(redP1Path, 'Red P1 path should exist');
  assert.strictEqual(redP1Path.finalPosition.y, 5, 'Red P1 path should be truncated at y=5 (collision point)');

  console.log('✅ TEST PASSED: Red P1 correctly stopped by Blue P3 blocker at y=5\n');
});

test('Red piece should also be blocked by no-guard zone if it somehow gets past blocker', () => {
  console.log('\n🧪 TEST: No-guard zone blocks Red piece near their flag\n');

  const gameState: CommanderGameState = {
    currentRound: 15,
    players: {
      A: {
        id: 'player-a',
        type: 'local-a' as const,
        pieces: [
          { id: 1, x: 0, y: 0, alive: true },
          { id: 2, x: 7, y: 8, alive: true },
          { id: 3, x: 15, y: 8, alive: true },  // Blue P3 out of the way
          { id: 4, x: 10, y: 8, alive: true },
          { id: 5, x: 11, y: 8, alive: true }
        ],
        jailedPieces: []
      },
      B: {
        id: 'player-b',
        type: 'local-b' as const,
        pieces: [
          { id: 1, x: 9, y: 5, alive: true },  // Red P1 at neutral zone, no blockers
          { id: 2, x: 8, y: 2, alive: true },
          { id: 3, x: 10, y: 2, alive: true },
          { id: 4, x: 11, y: 2, alive: true },
          { id: 5, x: 15, y: 2, alive: true }
        ],
        jailedPieces: []
      }
    },
    flags: {
      A: { x: 9, y: 10, carriedBy: null },
      B: { x: 9, y: 0, carriedBy: null }
    },
    rescueKeys: {
      A: null,
      B: null
    },
    noGuardZoneActive: {
      A: true,
      B: true  // Red's no-guard zone is ACTIVE (y=0-1)
    },
    noGuardZoneBounds: {
      A: { minX: 7, maxX: 11, minY: 9, maxY: 10 },
      B: { minX: 7, maxX: 11, minY: 0, maxY: 1 }
    }
  };

  const commandProcessor = new CommandProcessor();
  const redP1 = gameState.players.B.pieces[0];

  console.log('📍 Initial: Red P1 at (9, 5) - neutral zone');
  console.log('🎮 Command: Red P1 moves DOWN 5 cells (trying to reach flag at y=0)');
  console.log('🚫 Expected: Stopped at y=2 (before no-guard zone at y=0-1)\n');

  const commands = {
    playerA: [],
    playerB: [{ pieceId: 1, direction: 'down' as const, distance: 5 }]
  };

  const paths = commandProcessor.executeMovements(gameState, commands);
  commandProcessor.applyFinalPositions(gameState, paths);

  console.log(`📍 Final: Red P1 at (${redP1.x}, ${redP1.y})\n`);

  // Red P1 should be stopped at y=2 (cannot enter y=0-1 no-guard zone)
  assert.strictEqual(redP1.y, 2, 'Red P1 should be stopped at y=2 by no-guard zone (cannot enter y=0-1)');
  assert.notStrictEqual(redP1.y, 0, 'Red P1 should NOT reach flag at y=0');
  assert.notStrictEqual(redP1.y, 1, 'Red P1 should NOT enter no-guard zone at y=1');

  console.log('✅ TEST PASSED: No-guard zone correctly blocks Red P1 at y=2\n');
});
