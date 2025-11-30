/**
 * Test: Blue pieces should be able to enter Red territory (y=0-1)
 *
 * User bug: Blue pieces get sent to jail when trying to enter y=0 or y=1
 * Expected: Blue pieces should be able to move freely in Red territory
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { CommanderGameState } from './types.js';
import { CommandProcessor } from './CommandProcessor.js';

test('Blue piece should be able to move into Red territory at y=0', () => {
  console.log('\n🧪 TEST: Blue can enter Red territory (y=0)\n');

  const gameState: CommanderGameState = {
    currentRound: 10,
    players: {
      A: {
        id: 'player-a',
        type: 'local-a' as const,
        pieces: [
          { id: 1, x: 9, y: 1, alive: true },  // Blue P1 at y=1, trying to move to y=0
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
          { id: 3, x: 10, y: 2, alive: true },  // Red pieces away from flag
          { id: 4, x: 11, y: 2, alive: true },
          { id: 5, x: 15, y: 2, alive: true }
        ],
        jailedPieces: []
      }
    },
    flags: {
      A: { x: 9, y: 10, carriedBy: null },
      B: { x: 9, y: 0, carriedBy: null }    // Red flag at (9, 0)
    },
    rescueKeys: {
      A: null,
      B: null
    },
    noGuardZoneActive: {
      A: true,
      B: true  // Red no-guard zone active at y=0-1
    },
    noGuardZoneBounds: {
      A: { minX: 7, maxX: 11, minY: 9, maxY: 10 },
      B: { minX: 7, maxX: 11, minY: 0, maxY: 1 }
    }
  };

  const commandProcessor = new CommandProcessor();
  const blueP1 = gameState.players.A.pieces[0];

  console.log(`📍 Blue P1 starting position: (${blueP1.x}, ${blueP1.y})`);
  console.log(`🎮 Command: Move DOWN 1 cell to (9, 0) - Red flag position`);
  console.log(`🚫 Red no-guard zone: y=0-1, x=7-11 (should NOT block Blue attackers!)\n`);

  const commands = {
    playerA: [{ pieceId: 1, direction: 'down' as const, distance: 1 }],
    playerB: []
  };

  const paths = commandProcessor.executeMovements(gameState, commands);
  commandProcessor.applyFinalPositions(gameState, paths);

  console.log(`📍 Blue P1 final position: (${blueP1.x}, ${blueP1.y})`);
  console.log(`❤️  Blue P1 alive: ${blueP1.alive}\n`);

  // Blue P1 should successfully move to (9, 0)
  assert.strictEqual(blueP1.x, 9, 'Blue P1 should stay at x=9');
  assert.strictEqual(blueP1.y, 0, 'Blue P1 should reach y=0 (Red flag position)');
  assert.strictEqual(blueP1.alive, true, 'Blue P1 should still be alive (no collision)');

  console.log('✅ TEST PASSED: Blue piece can enter Red territory at y=0\n');
});

test('Blue piece should be able to move into Red no-guard zone at y=1', () => {
  console.log('\n🧪 TEST: Blue can enter Red no-guard zone (y=1)\n');

  const gameState: CommanderGameState = {
    currentRound: 10,
    players: {
      A: {
        id: 'player-a',
        type: 'local-a' as const,
        pieces: [
          { id: 1, x: 9, y: 2, alive: true },  // Blue P1 at y=2, trying to move to y=1
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
  const blueP1 = gameState.players.A.pieces[0];

  console.log(`📍 Blue P1 starting position: (${blueP1.x}, ${blueP1.y})`);
  console.log(`🎮 Command: Move DOWN 1 cell to (9, 1) - Red no-guard zone`);
  console.log(`✅ Expected: Blue SHOULD be able to enter (attackers allowed)\n`);

  const commands = {
    playerA: [{ pieceId: 1, direction: 'down' as const, distance: 1 }],
    playerB: []
  };

  const paths = commandProcessor.executeMovements(gameState, commands);
  commandProcessor.applyFinalPositions(gameState, paths);

  console.log(`📍 Blue P1 final position: (${blueP1.x}, ${blueP1.y})`);
  console.log(`❤️  Blue P1 alive: ${blueP1.alive}\n`);

  // Blue P1 should successfully move to (9, 1) - attackers CAN enter enemy no-guard zone
  assert.strictEqual(blueP1.x, 9, 'Blue P1 should stay at x=9');
  assert.strictEqual(blueP1.y, 1, 'Blue P1 should reach y=1 (Red no-guard zone)');
  assert.strictEqual(blueP1.alive, true, 'Blue P1 should still be alive');

  console.log('✅ TEST PASSED: Blue attacker can enter Red no-guard zone\n');
});
