/**
 * CollisionDetector Unit Tests
 * Tests collision detection and tagging rules:
 * - Neutral zone collisions (both pieces jailed)
 * - Same-team collisions (no jail)
 * - Enemy territory collisions (invader jailed)
 * - Own territory collisions (defender safe)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionDetector } from './CollisionDetector.js';
import { CommandProcessor } from './CommandProcessor.js';
import type { PiecePath } from './CommandProcessor.js';

// ============================================================================
// Helper Functions
// ============================================================================

function createTestGameState() {
  return {
    players: {
      A: {
        id: 'player-a',
        type: 'local-a' as const,
        pieces: [
          { id: 1, x: 4, y: 8, alive: true },
          { id: 2, x: 5, y: 8, alive: true },
          { id: 3, x: 6, y: 8, alive: true }
        ],
        jailedPieces: []
      },
      B: {
        id: 'player-b',
        type: 'local-b' as const,
        pieces: [
          { id: 1, x: 4, y: 2, alive: true },
          { id: 2, x: 5, y: 2, alive: true },
          { id: 3, x: 6, y: 2, alive: true }
        ],
        jailedPieces: []
      }
    },
    flags: {
      A: { x: 5, y: 10, carriedBy: null },
      B: { x: 5, y: 0, carriedBy: null }
    },
    rescueKeys: {
      A: null,
      B: null
    },
    noGuardZoneActive: {
      A: true,
      B: true
    },
    gameStatus: 'playing' as const
  };
}

// ============================================================================
// NEUTRAL ZONE COLLISION TESTS
// ============================================================================

test('CollisionDetector - Both pieces jailed in neutral zone (y=5)', () => {
  const detector = new CollisionDetector();
  const processor = new CommandProcessor();
  const gameState = createTestGameState();

  // Blue piece at (5,6) moves up 1 to neutral zone (5,5)
  gameState.players.A!.pieces[0] = { id: 1, x: 5, y: 6, alive: true };

  // Red piece at (5,4) moves down 1 to neutral zone (5,5)
  gameState.players.B!.pieces[0] = { id: 1, x: 5, y: 4, alive: true };

  const paths = processor.executeMovements(gameState, {
    playerA: [{ pieceId: 1, direction: 'up', distance: 1 }],
    playerB: [{ pieceId: 1, direction: 'down', distance: 1 }]
  });

  const collisions = detector.detectCollisions(paths);

  console.log('⚔️  NEUTRAL ZONE TEST: Both pieces meet at y=5');
  console.log(`   Blue piece path: (${gameState.players.A!.pieces[0].x},${gameState.players.A!.pieces[0].y}) → (5,5)`);
  console.log(`   Red piece path: (${gameState.players.B!.pieces[0].x},${gameState.players.B!.pieces[0].y}) → (5,5)`);
  console.log(`   Collisions detected: ${collisions.length}`);

  assert.strictEqual(collisions.length, 2, 'Should detect collision for both pieces');

  // Apply positions and resolve collisions
  processor.applyFinalPositions(gameState, paths);
  detector.resolveCollisions(gameState, collisions, () => {});

  const bluePiece = gameState.players.A!.pieces[0];
  const redPiece = gameState.players.B!.pieces[0];

  console.log(`   Blue piece alive: ${bluePiece.alive}`);
  console.log(`   Red piece alive: ${redPiece.alive}`);
  console.log(`   Blue jailed: ${gameState.players.A!.jailedPieces.includes(1)}`);
  console.log(`   Red jailed: ${gameState.players.B!.jailedPieces.includes(1)}`);

  // Both pieces should be jailed
  assert.strictEqual(bluePiece.alive, false, 'Blue piece should be jailed');
  assert.strictEqual(redPiece.alive, false, 'Red piece should be jailed');
  assert.ok(gameState.players.A!.jailedPieces.includes(1), 'Blue jail should have piece 1');
  assert.ok(gameState.players.B!.jailedPieces.includes(1), 'Red jail should have piece 1');

  console.log('   ✅ Both pieces jailed in neutral zone');
});

test('CollisionDetector - Neutral zone collision at y=5 (stationary vs moving)', () => {
  const detector = new CollisionDetector();
  const processor = new CommandProcessor();
  const gameState = createTestGameState();

  // Blue piece ALREADY at neutral zone (5,5)
  gameState.players.A!.pieces[0] = { id: 1, x: 5, y: 5, alive: true };

  // Red piece at (5,4) moves down 1 to neutral zone (5,5)
  gameState.players.B!.pieces[0] = { id: 1, x: 5, y: 4, alive: true };

  const paths = processor.executeMovements(gameState, {
    playerA: [], // Blue stays still
    playerB: [{ pieceId: 1, direction: 'down', distance: 1 }]
  });

  const collisions = detector.detectCollisions(paths);

  console.log('⚔️  NEUTRAL ZONE TEST: Stationary piece in neutral zone');
  console.log(`   Blue piece stationary at: (5,5)`);
  console.log(`   Red piece moves to: (5,5)`);
  console.log(`   Collisions detected: ${collisions.length}`);

  processor.applyFinalPositions(gameState, paths);
  detector.resolveCollisions(gameState, collisions, () => {});

  const bluePiece = gameState.players.A!.pieces[0];
  const redPiece = gameState.players.B!.pieces[0];

  console.log(`   Blue piece alive: ${bluePiece.alive}`);
  console.log(`   Red piece alive: ${redPiece.alive}`);

  // Both should be jailed (landing on stationary piece in neutral zone)
  assert.strictEqual(bluePiece.alive, false, 'Blue piece should be jailed');
  assert.strictEqual(redPiece.alive, false, 'Red piece should be jailed');

  console.log('   ✅ Both pieces jailed (stationary vs moving)');
});

// ============================================================================
// SAME-TEAM COLLISION TESTS
// ============================================================================

test('CollisionDetector - Same team collision (no jail)', () => {
  const detector = new CollisionDetector();
  const processor = new CommandProcessor();
  const gameState = createTestGameState();

  // Both Blue pieces move to same location
  gameState.players.A!.pieces[0] = { id: 1, x: 4, y: 8, alive: true };
  gameState.players.A!.pieces[1] = { id: 2, x: 6, y: 8, alive: true };

  const paths = processor.executeMovements(gameState, {
    playerA: [
      { pieceId: 1, direction: 'right', distance: 1 }, // 4,8 → 5,8
      { pieceId: 2, direction: 'left', distance: 1 }   // 6,8 → 5,8
    ],
    playerB: []
  });

  const collisions = detector.detectCollisions(paths);

  console.log('🔵🔵 SAME TEAM TEST: Two Blue pieces collide');
  console.log(`   Blue P1: (4,8) → (5,8)`);
  console.log(`   Blue P2: (6,8) → (5,8)`);
  console.log(`   Collisions detected: ${collisions.length}`);

  processor.applyFinalPositions(gameState, paths);
  detector.resolveCollisions(gameState, collisions, () => {});

  const piece1 = gameState.players.A!.pieces[0];
  const piece2 = gameState.players.A!.pieces[1];

  console.log(`   Blue P1 alive: ${piece1.alive}`);
  console.log(`   Blue P2 alive: ${piece2.alive}`);
  console.log(`   Blue jailed count: ${gameState.players.A!.jailedPieces.length}`);

  // Both should still be alive (same-team collision = no jail)
  assert.strictEqual(piece1.alive, true, 'Blue P1 should stay alive');
  assert.strictEqual(piece2.alive, true, 'Blue P2 should stay alive');
  assert.strictEqual(gameState.players.A!.jailedPieces.length, 0, 'No pieces jailed');

  console.log('   ✅ Same-team collision = no jail');
});

// ============================================================================
// TERRITORY-BASED COLLISION TESTS
// ============================================================================

test('CollisionDetector - Enemy territory collision (invader jailed)', () => {
  const detector = new CollisionDetector();
  const processor = new CommandProcessor();
  const gameState = createTestGameState();

  // Blue piece in Red territory (y=2), Red piece at same location
  gameState.players.A!.pieces[0] = { id: 1, x: 4, y: 3, alive: true };
  gameState.players.B!.pieces[0] = { id: 1, x: 4, y: 2, alive: true };

  const paths = processor.executeMovements(gameState, {
    playerA: [{ pieceId: 1, direction: 'up', distance: 1 }], // 4,3 → 4,2 (Red territory)
    playerB: [] // Red stays still
  });

  const collisions = detector.detectCollisions(paths);

  console.log('⚔️  ENEMY TERRITORY TEST: Blue invades Red territory');
  console.log(`   Blue piece moves to Red territory: (4,2)`);
  console.log(`   Red piece stationary at: (4,2)`);

  processor.applyFinalPositions(gameState, paths);
  detector.resolveCollisions(gameState, collisions, () => {});

  const bluePiece = gameState.players.A!.pieces[0];
  const redPiece = gameState.players.B!.pieces[0];

  console.log(`   Blue piece alive: ${bluePiece.alive} (should be jailed)`);
  console.log(`   Red piece alive: ${redPiece.alive} (should be safe)`);

  // Blue should be jailed (in enemy territory), Red should be safe (own territory)
  assert.strictEqual(bluePiece.alive, false, 'Blue should be jailed in enemy territory');
  assert.strictEqual(redPiece.alive, true, 'Red should be safe in own territory');

  console.log('   ✅ Invader jailed, defender safe');
});

test('CollisionDetector - Own territory collision (defender safe)', () => {
  const detector = new CollisionDetector();
  const processor = new CommandProcessor();
  const gameState = createTestGameState();

  // Blue piece in own territory (y=8), Red piece invades
  gameState.players.A!.pieces[0] = { id: 1, x: 5, y: 8, alive: true };
  gameState.players.B!.pieces[0] = { id: 1, x: 5, y: 7, alive: true };

  const paths = processor.executeMovements(gameState, {
    playerA: [], // Blue stays still in own territory
    playerB: [{ pieceId: 1, direction: 'down', distance: 1 }] // Red invades Blue territory
  });

  const collisions = detector.detectCollisions(paths);

  console.log('🛡️  OWN TERRITORY TEST: Red invades Blue territory');
  console.log(`   Blue piece stationary at: (5,8) (own territory)`);
  console.log(`   Red piece invades: (5,8) (Blue territory)`);

  processor.applyFinalPositions(gameState, paths);
  detector.resolveCollisions(gameState, collisions, () => {});

  const bluePiece = gameState.players.A!.pieces[0];
  const redPiece = gameState.players.B!.pieces[0];

  console.log(`   Blue piece alive: ${bluePiece.alive} (should be safe)`);
  console.log(`   Red piece alive: ${redPiece.alive} (should be jailed)`);

  // Blue should be safe (own territory), Red should be jailed (enemy territory)
  assert.strictEqual(bluePiece.alive, true, 'Blue should be safe in own territory');
  assert.strictEqual(redPiece.alive, false, 'Red should be jailed in enemy territory');

  console.log('   ✅ Defender safe, invader jailed');
});

console.log('\n✅ All Collision Detector tests defined\n');
