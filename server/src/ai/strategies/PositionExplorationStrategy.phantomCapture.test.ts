/**
 * Position Exploration Strategy - Phantom Capture Bug Test
 *
 * FOCUSED TEST: Isolate the +1700 scoring bug where AI thinks stacking is valuable
 *
 * SCENARIO:
 * - Blue P1 at (3,8) - just moved here
 * - Red P1 at (4,2) - evaluating moves
 *
 * TEST: What score does Red P1 get for moving LEFT 1 to (3,2)?
 *
 * EXPECTED: No capture should occur - Blue at (3,8) and Red at (3,2) are far apart
 * ACTUAL BUG: AI thinks it captures Blue P1, scores +1000 for capturesThisRound
 *
 * This test bypasses the full AI and directly tests the simulation + scoring logic.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PositionExplorationStrategy } from './PositionExplorationStrategy.js';
import { CommandProcessor } from '../../game/CommandProcessor.js';
import { CollisionDetector } from '../../game/CollisionDetector.js';
import { FlagManager } from '../../game/FlagManager.js';
import { evaluateGameState } from '../../game/ScoreEvaluator.js';
import type { CommanderGameState, Movement } from '../../game/types.js';

// Helper to create test game state
function createTestState(): CommanderGameState {
  return {
    round: 2,
    players: {
      A: {
        id: 'player-a',
        player: { id: 'player-a', side: 'A', type: 'local-a' },
        pieces: [
          { id: 1, x: 3, y: 8, alive: true }, // Blue P1 at (3,8) - moved LEFT
          { id: 2, x: 5, y: 8, alive: true }, // Blue P2 at starting pos
          { id: 3, x: 6, y: 8, alive: true }  // Blue P3 at starting pos
        ],
        jailedPieces: []
      },
      B: {
        id: 'player-b',
        player: { id: 'player-b', side: 'B', type: 'ai' },
        pieces: [
          { id: 1, x: 4, y: 2, alive: true }, // Red P1 - testing this piece
          { id: 2, x: 5, y: 2, alive: true }, // Red P2 at starting pos
          { id: 3, x: 6, y: 2, alive: true }  // Red P3 at starting pos
        ],
        jailedPieces: []
      }
    },
    commandQueue: {},
    rescueKeys: { A: null, B: null },
    flags: {
      A: { x: 5, y: 10, carriedBy: null },
      B: { x: 5, y: 0, carriedBy: null }
    },
    noGuardZoneActive: { A: true, B: true },
    noGuardZoneBounds: {
      A: { minX: 4, maxX: 6, minY: 9, maxY: 10 },
      B: { minX: 4, maxX: 6, minY: 0, maxY: 1 }
    },
    gameStatus: 'playing',
    nextTickIn: 3,
    lastRoundTime: Date.now(),
    serverStartTime: Date.now()
  };
}

test('Phantom Capture Bug - Red P1 LEFT should NOT capture Blue P1', () => {
  console.log('\n🐛 PHANTOM CAPTURE TEST');
  console.log('   Testing: Red P1 at (4,2) moves LEFT 1 to (3,2)');
  console.log('   Blue P1 is at (3,8) - should be far away, no collision');

  const initialState = createTestState();
  const beforeState = JSON.parse(JSON.stringify(initialState)); // For capture detection

  // Manually simulate Red P1 moving LEFT 1
  const processor = new CommandProcessor();
  const collisionDetector = new CollisionDetector();
  const flagManager = new FlagManager();

  const redMove: Movement = { pieceId: 1, direction: 'left', distance: 1 };

  console.log('\n   📍 Initial positions:');
  console.log(`      Blue P1: (${initialState.players.A.pieces[0].x}, ${initialState.players.A.pieces[0].y})`);
  console.log(`      Red P1: (${initialState.players.B.pieces[0].x}, ${initialState.players.B.pieces[0].y})`);

  // Execute movements
  const paths = processor.executeMovements(initialState, {
    playerA: [], // Blue stays still
    playerB: [redMove] // Red P1 moves left
  });

  console.log('\n   🛤️  Paths generated:');
  paths.forEach(p => {
    console.log(`      ${p.player} P${p.pieceId}: ${p.path.length} steps, final: (${p.finalPosition.x},${p.finalPosition.y})`);
    console.log(`         Path: ${p.path.map(pos => `(${pos.x},${pos.y})`).join(' → ')}`);
  });

  // Detect collisions
  const collisions = collisionDetector.detectCollisions(paths);

  console.log(`\n   ⚔️  Collisions detected: ${collisions.length}`);
  if (collisions.length > 0) {
    collisions.forEach((c, i) => {
      console.log(`      [${i}] ${c.player} P${c.pieceId} at (${c.x},${c.y})`);
    });
  }

  // Apply final positions
  processor.applyFinalPositions(initialState, paths);

  // Resolve collisions
  collisionDetector.resolveCollisions(
    initialState,
    collisions,
    (gs, player, pieceId) => flagManager.onPieceCaptured(gs, player, pieceId)
  );

  // Check flag interactions
  flagManager.checkFlagInteractions(initialState);

  console.log('\n   📍 Final positions:');
  console.log(`      Blue P1: (${initialState.players.A.pieces[0].x}, ${initialState.players.A.pieces[0].y}) alive=${initialState.players.A.pieces[0].alive}`);
  console.log(`      Red P1: (${initialState.players.B.pieces[0].x}, ${initialState.players.B.pieces[0].y}) alive=${initialState.players.B.pieces[0].alive}`);

  // Count alive pieces
  const bluePiecesAlive = initialState.players.A.pieces.filter(p => p.alive).length;
  const redPiecesAlive = initialState.players.B.pieces.filter(p => p.alive).length;

  console.log(`\n   📊 Piece counts: Blue=${bluePiecesAlive}/3, Red=${redPiecesAlive}/3`);

  // Evaluate score
  const scoreBreakdown = evaluateGameState(initialState, 'B', beforeState);

  console.log('\n   💯 Score breakdown (from Red perspective):');
  console.log(`      capturesThisRound: ${scoreBreakdown.capturesThisRound}`);
  console.log(`      pieceAdvantage: ${scoreBreakdown.pieceAdvantage}`);
  console.log(`      weHaveFlag: ${scoreBreakdown.weHaveFlag}`);
  console.log(`      theyHaveFlag: ${scoreBreakdown.theyHaveFlag}`);
  console.log(`      TOTAL: ${scoreBreakdown.total}`);

  // ASSERTIONS
  console.log('\n   🧪 Running assertions...');

  // No collision should occur
  assert.strictEqual(
    collisions.length,
    0,
    `Expected 0 collisions (Blue at y=8, Red at y=2 are far apart), got ${collisions.length}`
  );

  // Blue P1 should still be alive
  assert.strictEqual(
    initialState.players.A.pieces[0].alive,
    true,
    'Blue P1 should still be alive (no collision occurred)'
  );

  // Red P1 should be at (3,2)
  assert.strictEqual(initialState.players.B.pieces[0].x, 3, 'Red P1 should be at x=3');
  assert.strictEqual(initialState.players.B.pieces[0].y, 2, 'Red P1 should be at y=2');

  // NO capture should be scored
  assert.strictEqual(
    scoreBreakdown.capturesThisRound,
    0,
    'capturesThisRound should be 0 (no collision, no capture)'
  );

  console.log('\n   ✅ ALL ASSERTIONS PASSED - No phantom capture!');
});

test('Phantom Capture Bug - Simulate what AI does (with enemy best move)', () => {
  console.log('\n🐛 PHANTOM CAPTURE TEST - AI SIMULATION');
  console.log('   Testing: Full AI simulation including enemy best move prediction');

  const initialState = createTestState();

  // Simulate what AI does: first find enemy's best move
  const processor = new CommandProcessor();
  const collisionDetector = new CollisionDetector();
  const flagManager = new FlagManager();

  console.log('\n   Step 1: Find enemy (Blue) best move when Red stays still');

  // Blue P1 already at (3,8) - simulate Blue choosing to stay still
  const blueMove: Movement = { pieceId: 1, direction: 'up', distance: 0 };

  console.log(`      Blue best move (simulated): stay still at (3,8)`);

  console.log('\n   Step 2: Find Red P1 best move against Blue staying still');

  const redMove: Movement = { pieceId: 1, direction: 'left', distance: 1 };

  console.log(`      Testing Red move: LEFT 1 from (4,2) to (3,2)`);

  // Simulate SIMULTANEOUS moves
  const beforeState = JSON.parse(JSON.stringify(initialState));
  const testState = JSON.parse(JSON.stringify(initialState));

  console.log('\n   🛤️  Simulating simultaneous movement...');

  const paths = processor.executeMovements(testState, {
    playerA: [blueMove], // Blue stays still
    playerB: [redMove]   // Red moves left
  });

  console.log(`      Generated ${paths.length} paths`);
  paths.forEach(p => {
    console.log(`      ${p.player} P${p.pieceId}: ${p.path.map(pos => `(${pos.x},${pos.y})`).join(' → ')}`);
  });

  const collisions = collisionDetector.detectCollisions(paths);

  console.log(`\n   ⚔️  Collisions: ${collisions.length}`);
  if (collisions.length > 0) {
    collisions.forEach((c, i) => {
      console.log(`      [${i}] ${c.player} P${c.pieceId} at (${c.x},${c.y})`);
    });
  }

  processor.applyFinalPositions(testState, paths);
  collisionDetector.resolveCollisions(
    testState,
    collisions,
    (gs, player, pieceId) => flagManager.onPieceCaptured(gs, player, pieceId)
  );
  flagManager.checkFlagInteractions(testState);

  const scoreBreakdown = evaluateGameState(testState, 'B', beforeState);

  console.log('\n   💯 Score (Red perspective):');
  console.log(`      capturesThisRound: ${scoreBreakdown.capturesThisRound}`);
  console.log(`      pieceAdvantage: ${scoreBreakdown.pieceAdvantage}`);
  console.log(`      TOTAL: ${scoreBreakdown.total}`);

  // ASSERTIONS
  assert.strictEqual(
    collisions.length,
    0,
    'No collision should occur when Red moves to (3,2) and Blue is at (3,8)'
  );

  assert.strictEqual(
    scoreBreakdown.capturesThisRound,
    0,
    'AI should not score captures when no collision occurs'
  );

  console.log('\n   ✅ AI simulation should NOT show phantom capture');
});

console.log('\n✅ Phantom capture tests defined\n');
