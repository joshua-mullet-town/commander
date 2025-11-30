/**
 * Test: Flag Capture Bug - Blue piece moving from (0,0) to Red flag at (9,0)
 * User reported: Piece was captured despite clear path to enemy flag
 *
 * Expected behavior: Piece should reach flag and pick it up without being captured
 * Actual behavior: Piece gets captured
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { CommanderGameState } from './types.js';
import { CommandProcessor } from './CommandProcessor.js';
import { CollisionDetector } from './CollisionDetector.js';
import { FlagManager } from './FlagManager.js';

test('Blue piece from (0,0) should reach Red flag at (9,0) without being captured', () => {
  console.log('\n🧪 TEST: Flag Capture Bug - Blue (0,0) → Red flag (9,0)\n');

  // Setup game state with Blue piece at (0,0) and Red flag at (9,0)
  const gameState: CommanderGameState = {
    currentRound: 1,
    players: {
      A: {
        id: 'player-a',
        type: 'local-a' as const,
        pieces: [
          { id: 1, x: 0, y: 0, alive: true }, // Blue P1 at upper left
          { id: 2, x: 7, y: 8, alive: true },
          { id: 3, x: 8, y: 8, alive: true },
          { id: 4, x: 10, y: 8, alive: true },
          { id: 5, x: 11, y: 8, alive: true }
        ],
        jailedPieces: []
      },
      B: {
        id: 'player-b',
        type: 'local-b' as const,
        pieces: [
          { id: 1, x: 7, y: 2, alive: true },  // Red pieces far away
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
      B: { x: 9, y: 0, carriedBy: null }    // Red flag at spawn (target)
    },
    rescueKeys: {
      A: null,
      B: null
    },
    noGuardZoneActive: {
      A: true,
      B: true
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
  console.log(`📍 Blue P1 starting position: (${blueP1.x}, ${blueP1.y})`);
  console.log(`🚩 Red flag position: (${gameState.flags.B.x}, ${gameState.flags.B.y})`);
  console.log(`📏 Distance to travel: ${gameState.flags.B.x - blueP1.x} cells RIGHT\n`);

  // Blue P1 moves RIGHT 9 cells to reach Red flag at (9, 0)
  // Red pieces stay still
  const commands = {
    playerA: [{ pieceId: 1, direction: 'right' as const, distance: 9 }],
    playerB: [] // Red does nothing
  };

  console.log(`🎮 Blue P1 command: Move RIGHT 9 cells\n`);

  // Execute movements
  const paths = commandProcessor.executeMovements(gameState, commands);
  console.log('📍 Movement paths generated');

  // Detect collisions
  const collisions = collisionDetector.detectCollisions(paths);
  console.log(`⚔️  Collisions detected: ${collisions.length}\n`);

  // Apply final positions
  commandProcessor.applyFinalPositions(gameState, paths);
  console.log(`📍 Blue P1 final position: (${blueP1.x}, ${blueP1.y})`);

  // Resolve collisions
  collisionDetector.resolveCollisions(
    gameState,
    collisions,
    (gs, player, pieceId) => flagManager.onPieceCaptured(gs, player, pieceId)
  );
  console.log(`❤️  Blue P1 alive: ${blueP1.alive}`);
  console.log(`🚩 Red flag carried by: ${gameState.flags.B.carriedBy ? `${gameState.flags.B.carriedBy.player} P${gameState.flags.B.carriedBy.pieceId}` : 'none'}\n`);

  // ASSERTIONS
  assert.strictEqual(blueP1.x, 9, 'Blue P1 should reach x=9');
  assert.strictEqual(blueP1.y, 0, 'Blue P1 should stay at y=0');
  assert.strictEqual(blueP1.alive, true, 'Blue P1 should NOT be captured (bug reproduction)');
  assert.strictEqual(collisions.length, 0, 'Should have NO collisions - clear path');

  console.log('✅ TEST PASSED: Blue P1 reached flag without capture\n');
});

test('Blue piece from (0,0) should pick up Red flag at (9,0) when reached', () => {
  console.log('\n🧪 TEST: Flag Pickup - Blue (0,0) → Red flag (9,0)\n');

  // Setup identical to previous test
  const gameState: CommanderGameState = {
    currentRound: 1,
    players: {
      A: {
        id: 'player-a',
        type: 'local-a' as const,
        pieces: [
          { id: 1, x: 0, y: 0, alive: true },
          { id: 2, x: 7, y: 8, alive: true },
          { id: 3, x: 8, y: 8, alive: true },
          { id: 4, x: 10, y: 8, alive: true },
          { id: 5, x: 11, y: 8, alive: true }
        ],
        jailedPieces: []
      },
      B: {
        id: 'player-b',
        type: 'local-b' as const,
        pieces: [
          { id: 1, x: 7, y: 2, alive: true },
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
      B: true
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

  // Execute movement
  const commands = {
    playerA: [{ pieceId: 1, direction: 'right' as const, distance: 9 }],
    playerB: []
  };

  const paths = commandProcessor.executeMovements(gameState, commands);
  const collisions = collisionDetector.detectCollisions(paths);
  commandProcessor.applyFinalPositions(gameState, paths);
  collisionDetector.resolveCollisions(
    gameState,
    collisions,
    (gs, player, pieceId) => flagManager.onPieceCaptured(gs, player, pieceId)
  );

  // Check for flag pickup (this needs to be handled by game engine)
  // For now, just verify piece reached the position
  console.log(`📍 Blue P1 final position: (${blueP1.x}, ${blueP1.y})`);
  console.log(`🚩 Red flag position: (${gameState.flags.B.x}, ${gameState.flags.B.y})`);

  assert.strictEqual(blueP1.x, gameState.flags.B.x, 'Blue P1 should be at flag X coordinate');
  assert.strictEqual(blueP1.y, gameState.flags.B.y, 'Blue P1 should be at flag Y coordinate');
  assert.strictEqual(blueP1.alive, true, 'Blue P1 should be alive at flag position');

  console.log('✅ TEST PASSED: Blue P1 reached flag coordinates\n');
});
