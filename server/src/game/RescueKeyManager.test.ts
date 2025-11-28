/**
 * RescueKeyManager Unit Tests
 * Tests rescue key mechanics:
 * - Key spawning when teammates are jailed
 * - Key pickup and rescue logic
 * - Piece reset behavior
 * - Independent key operation for both teams
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RescueKeyManager } from './RescueKeyManager.js';
import { STARTING_POSITIONS, KEY_POSITIONS } from './constants.js';

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
    rescueKeys: {
      A: null,
      B: null
    },
    flags: {
      A: { x: 5, y: 10, carriedBy: null },
      B: { x: 5, y: 0, carriedBy: null }
    },
    gameStatus: 'playing' as const
  };
}

// ============================================================================
// KEY SPAWNING TESTS
// ============================================================================

test('RescueKeyManager - Key spawns when teammate is jailed', () => {
  const manager = new RescueKeyManager();
  const gameState = createTestGameState();

  // Jail a Blue piece
  gameState.players.A!.pieces[0].alive = false;
  gameState.players.A!.jailedPieces.push(1);

  // Update keys
  manager.updateKeys(gameState);

  console.log('🔑 KEY SPAWN TEST: Blue piece jailed');
  console.log(`   Blue key exists: ${gameState.rescueKeys.A !== null}`);
  console.log(`   Blue key position: ${gameState.rescueKeys.A ? `(${gameState.rescueKeys.A.x},${gameState.rescueKeys.A.y})` : 'null'}`);
  console.log(`   Expected position: (${KEY_POSITIONS.A.x},${KEY_POSITIONS.A.y})`);

  assert.ok(gameState.rescueKeys.A !== null, 'Blue key should spawn when teammate is jailed');
  assert.strictEqual(gameState.rescueKeys.A!.x, KEY_POSITIONS.A.x, 'Blue key x position');
  assert.strictEqual(gameState.rescueKeys.A!.y, KEY_POSITIONS.A.y, 'Blue key y position');

  console.log('   ✅ Blue key spawned correctly');
});

test('RescueKeyManager - Key spawns in enemy territory', () => {
  const manager = new RescueKeyManager();
  const gameState = createTestGameState();

  // Jail Blue piece
  gameState.players.A!.pieces[0].alive = false;
  gameState.players.A!.jailedPieces.push(1);

  // Jail Red piece
  gameState.players.B!.pieces[0].alive = false;
  gameState.players.B!.jailedPieces.push(1);

  manager.updateKeys(gameState);

  console.log('🔑 KEY TERRITORY TEST: Keys spawn in enemy territory');
  console.log(`   Blue key at (${gameState.rescueKeys.A!.x},${gameState.rescueKeys.A!.y}) - should be in Red territory (y≤4)`);
  console.log(`   Red key at (${gameState.rescueKeys.B!.x},${gameState.rescueKeys.B!.y}) - should be in Blue territory (y≥6)`);

  // Blue key should be in Red territory (y <= 4)
  assert.ok(gameState.rescueKeys.A!.y <= 4, 'Blue key should be in Red territory');

  // Red key should be in Blue territory (y >= 6)
  assert.ok(gameState.rescueKeys.B!.y >= 6, 'Red key should be in Blue territory');

  console.log('   ✅ Keys correctly positioned in enemy territory');
});

test('RescueKeyManager - Key does not spawn when no one is jailed', () => {
  const manager = new RescueKeyManager();
  const gameState = createTestGameState();

  // All pieces alive, no one jailed
  manager.updateKeys(gameState);

  console.log('🔑 NO KEY TEST: No jailed pieces');
  console.log(`   Blue key: ${gameState.rescueKeys.A}`);
  console.log(`   Red key: ${gameState.rescueKeys.B}`);

  assert.strictEqual(gameState.rescueKeys.A, null, 'Blue key should not spawn');
  assert.strictEqual(gameState.rescueKeys.B, null, 'Red key should not spawn');

  console.log('   ✅ No keys spawned correctly');
});

test('RescueKeyManager - Both keys can exist simultaneously', () => {
  const manager = new RescueKeyManager();
  const gameState = createTestGameState();

  // Jail pieces from both teams
  gameState.players.A!.pieces[0].alive = false;
  gameState.players.A!.jailedPieces.push(1);
  gameState.players.B!.pieces[0].alive = false;
  gameState.players.B!.jailedPieces.push(1);

  manager.updateKeys(gameState);

  console.log('🔑 DUAL KEY TEST: Both teams have jailed pieces');
  console.log(`   Blue key exists: ${gameState.rescueKeys.A !== null}`);
  console.log(`   Red key exists: ${gameState.rescueKeys.B !== null}`);

  assert.ok(gameState.rescueKeys.A !== null, 'Blue key should exist');
  assert.ok(gameState.rescueKeys.B !== null, 'Red key should exist');

  console.log('   ✅ Both keys exist simultaneously');
});

// ============================================================================
// KEY PICKUP AND RESCUE TESTS
// ============================================================================

test('RescueKeyManager - Picking up key rescues all jailed teammates', () => {
  const manager = new RescueKeyManager();
  const gameState = createTestGameState();

  // Jail TWO Blue pieces
  gameState.players.A!.pieces[0].alive = false;
  gameState.players.A!.pieces[1].alive = false;
  gameState.players.A!.jailedPieces = [1, 2];

  // Spawn the key
  manager.updateKeys(gameState);

  // Move Blue piece 3 to the key position
  gameState.players.A!.pieces[2].x = KEY_POSITIONS.A.x;
  gameState.players.A!.pieces[2].y = KEY_POSITIONS.A.y;

  console.log('🔑 RESCUE TEST: Picking up key');
  console.log(`   Jailed before: ${gameState.players.A!.jailedPieces.length} pieces`);

  // Check for rescue
  manager.checkForRescue(gameState);

  console.log(`   Jailed after: ${gameState.players.A!.jailedPieces.length} pieces`);
  console.log(`   Piece 1 alive: ${gameState.players.A!.pieces[0].alive}`);
  console.log(`   Piece 2 alive: ${gameState.players.A!.pieces[1].alive}`);

  assert.strictEqual(gameState.players.A!.jailedPieces.length, 0, 'All pieces should be rescued');
  assert.ok(gameState.players.A!.pieces[0].alive, 'Piece 1 should be alive');
  assert.ok(gameState.players.A!.pieces[1].alive, 'Piece 2 should be alive');

  console.log('   ✅ All jailed teammates rescued');
});

test('RescueKeyManager - Rescued pieces reset to starting positions', () => {
  const manager = new RescueKeyManager();
  const gameState = createTestGameState();

  // Jail Blue piece 1
  gameState.players.A!.pieces[0].alive = false;
  gameState.players.A!.pieces[0].x = 999; // Wrong position
  gameState.players.A!.pieces[0].y = 999;
  gameState.players.A!.jailedPieces = [1];

  manager.updateKeys(gameState);

  // Move Blue piece 2 to key
  gameState.players.A!.pieces[1].x = KEY_POSITIONS.A.x;
  gameState.players.A!.pieces[1].y = KEY_POSITIONS.A.y;

  manager.checkForRescue(gameState);

  const piece1 = gameState.players.A!.pieces[0];
  const expectedPos = STARTING_POSITIONS.A.find(p => p.id === 1)!;

  console.log('🔑 RESET TEST: Rescued piece position');
  console.log(`   Piece 1 position: (${piece1.x},${piece1.y})`);
  console.log(`   Expected position: (${expectedPos.x},${expectedPos.y})`);

  assert.strictEqual(piece1.x, expectedPos.x, 'Rescued piece x position');
  assert.strictEqual(piece1.y, expectedPos.y, 'Rescued piece y position');

  console.log('   ✅ Rescued piece at correct starting position');
});

test('RescueKeyManager - Key disappears after rescue', () => {
  const manager = new RescueKeyManager();
  const gameState = createTestGameState();

  // Jail and rescue Blue piece
  gameState.players.A!.pieces[0].alive = false;
  gameState.players.A!.jailedPieces = [1];
  manager.updateKeys(gameState);

  gameState.players.A!.pieces[1].x = KEY_POSITIONS.A.x;
  gameState.players.A!.pieces[1].y = KEY_POSITIONS.A.y;

  console.log('🔑 KEY REMOVAL TEST: Before and after rescue');
  console.log(`   Key before rescue: ${gameState.rescueKeys.A !== null}`);

  manager.checkForRescue(gameState);

  console.log(`   Key after rescue: ${gameState.rescueKeys.A !== null}`);

  assert.strictEqual(gameState.rescueKeys.A, null, 'Key should be removed after rescue');

  console.log('   ✅ Key removed after rescue');
});

test('RescueKeyManager - Rescuer stays at key position (delayed reset)', () => {
  const manager = new RescueKeyManager();
  const gameState = createTestGameState();

  // Jail Blue piece 1
  gameState.players.A!.pieces[0].alive = false;
  gameState.players.A!.jailedPieces = [1];
  manager.updateKeys(gameState);

  // Blue piece 2 picks up key
  const rescuerOriginalX = gameState.players.A!.pieces[1].x;
  const rescuerOriginalY = gameState.players.A!.pieces[1].y;
  gameState.players.A!.pieces[1].x = KEY_POSITIONS.A.x;
  gameState.players.A!.pieces[1].y = KEY_POSITIONS.A.y;

  manager.checkForRescue(gameState);

  const rescuer = gameState.players.A!.pieces[1];

  console.log('🔑 RESCUER DELAY TEST: Rescuer should stay at key');
  console.log(`   Rescuer at: (${rescuer.x},${rescuer.y})`);
  console.log(`   Key position: (${KEY_POSITIONS.A.x},${KEY_POSITIONS.A.y})`);

  // Rescuer should still be at key position (NOT reset yet)
  assert.strictEqual(rescuer.x, KEY_POSITIONS.A.x, 'Rescuer should stay at key x');
  assert.strictEqual(rescuer.y, KEY_POSITIONS.A.y, 'Rescuer should stay at key y');

  console.log('   ✅ Rescuer stays at key position');

  // Now reset rescuers (simulates next round)
  manager.resetRescuingPieces(gameState);

  const expectedPos = STARTING_POSITIONS.A.find(p => p.id === 2)!;

  console.log(`   After next round: (${rescuer.x},${rescuer.y})`);
  console.log(`   Expected: (${expectedPos.x},${expectedPos.y})`);

  assert.strictEqual(rescuer.x, expectedPos.x, 'Rescuer should reset to start x');
  assert.strictEqual(rescuer.y, expectedPos.y, 'Rescuer should reset to start y');

  console.log('   ✅ Rescuer reset on next round');
});

test('RescueKeyManager - Keys operate independently', () => {
  const manager = new RescueKeyManager();
  const gameState = createTestGameState();

  // Jail pieces from both teams
  gameState.players.A!.pieces[0].alive = false;
  gameState.players.A!.jailedPieces = [1];
  gameState.players.B!.pieces[0].alive = false;
  gameState.players.B!.jailedPieces = [1];

  manager.updateKeys(gameState);

  // Blue picks up their key
  gameState.players.A!.pieces[1].x = KEY_POSITIONS.A.x;
  gameState.players.A!.pieces[1].y = KEY_POSITIONS.A.y;

  console.log('🔑 INDEPENDENCE TEST: Blue rescues, Red key should remain');
  console.log(`   Blue key exists before: ${gameState.rescueKeys.A !== null}`);
  console.log(`   Red key exists before: ${gameState.rescueKeys.B !== null}`);

  manager.checkForRescue(gameState);

  console.log(`   Blue key exists after: ${gameState.rescueKeys.A !== null}`);
  console.log(`   Red key exists after: ${gameState.rescueKeys.B !== null}`);
  console.log(`   Blue jailed count: ${gameState.players.A!.jailedPieces.length}`);
  console.log(`   Red jailed count: ${gameState.players.B!.jailedPieces.length}`);

  // Blue key should be gone, Red key should still exist
  assert.strictEqual(gameState.rescueKeys.A, null, 'Blue key should be removed');
  assert.ok(gameState.rescueKeys.B !== null, 'Red key should still exist');

  // Blue jail should be empty, Red jail should still have 1
  assert.strictEqual(gameState.players.A!.jailedPieces.length, 0, 'Blue jail cleared');
  assert.strictEqual(gameState.players.B!.jailedPieces.length, 1, 'Red jail unchanged');

  console.log('   ✅ Keys operate independently');
});

console.log('\n✅ All Rescue Key Manager tests defined\n');
