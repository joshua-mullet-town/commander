/**
 * Position Exploration Strategy - Open Lane Exploitation Test
 *
 * SCENARIO: Blue piece 1 moves left, opening up a clear lane for Red piece 1
 * to advance to Blue's back wall and safe zone.
 *
 * EXPECTED: Red piece 1 should move DOWN to exploit the open lane and score:
 * - Back wall bonus (+500)
 * - Safe zone bonus (+1000)
 * - Total: +1500 minimum
 *
 * ACTUAL BUG: All three Red pieces stack on same square instead of exploiting open lane
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PositionExplorationStrategy } from './PositionExplorationStrategy.js';
import { STARTING_POSITIONS } from '../../game/constants.js';
import type { CommanderGameState, Movement } from '../../game/types.js';

test('PositionExplorationStrategy - Open lane: AI should exploit clear path to back wall', async () => {
  // Create initial game state
  const gameState: CommanderGameState = {
    round: 2, // Round 2 because Blue already moved
    players: {
      A: {
        id: 'player-a',
        player: { id: 'player-a', side: 'A', type: 'local-a' },
        pieces: STARTING_POSITIONS.A.map(pos => ({ ...pos, alive: true })),
        jailedPieces: []
      },
      B: {
        id: 'player-b',
        player: { id: 'player-b', side: 'B', type: 'ai' },
        pieces: STARTING_POSITIONS.B.map(pos => ({ ...pos, alive: true })),
        jailedPieces: []
      }
    },
    commandQueue: {},
    rescueKeys: { A: null, B: null },
    flags: {
      A: { x: 5, y: 10, carriedBy: null }, // Blue flag at center back
      B: { x: 5, y: 0, carriedBy: null }   // Red flag at center back
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

  // BLUE'S MOVE: Piece 1 moves LEFT 1 (from (4,8) to (3,8))
  console.log('\n🎮 OPEN LANE TEST: Blue piece 1 moves left, opening lane');
  console.log('   Before: Blue P1 at (4,8), Red P1 at (4,2)');

  gameState.players.A.pieces[0].x = 3; // Blue piece 1 moved left
  gameState.players.A.pieces[0].y = 8;

  console.log('   After Blue move: Blue P1 at (3,8) - LANE IS OPEN at x=4');
  console.log('   Red P1 can now safely move UP to Blue back wall (4,10)');

  // Ask AI (Red, side B) to decide moves
  const strategy = new PositionExplorationStrategy();
  const result = await strategy.getCommands(gameState, 'B');

  console.log('\n📊 AI Decision:');
  result.commands.forEach((cmd, i) => {
    const piece = gameState.players.B!.pieces[i];
    console.log(`   Red P${cmd.pieceId}: (${piece.x},${piece.y}) → ${cmd.direction} ${cmd.distance}`);
  });

  // FIND RED PIECE 1's DECISION
  const redP1Command = result.commands.find(cmd => cmd.pieceId === 1);
  assert.ok(redP1Command, 'AI should return command for Red piece 1');

  console.log(`\n🔍 Red Piece 1 Decision: ${redP1Command.direction} ${redP1Command.distance}`);

  // CRITICAL ASSERTION: Red piece 1 should move UP (toward y=10, Blue's back wall)
  // Coordinate system: y=0 (bottom/Red) to y=10 (top/Blue)
  // Red at y=2 moving to y=10 = INCREASING Y = UP direction
  assert.strictEqual(
    redP1Command.direction,
    'up',
    `Red P1 should move UP to exploit open lane (chose: ${redP1Command.direction})`
  );

  // CRITICAL ASSERTION: Distance should be significant (at least 2+ to enter Blue territory)
  assert.ok(
    redP1Command.distance >= 2,
    `Red P1 should move UP at least 2 spaces to enter Blue territory (chose: ${redP1Command.distance})`
  );

  // IDEAL: Red P1 should move UP the full distance to back wall (8 spaces from y=2 to y=10)
  // But we'll accept any significant upward movement as "recognizing the opportunity"
  if (redP1Command.distance >= 8) {
    console.log('   ✅ EXCELLENT: Red P1 moves full distance to back wall (8+ spaces)');
  } else if (redP1Command.distance >= 4) {
    console.log('   ⚠️  PARTIAL: Red P1 moves up but not to back wall (4-7 spaces)');
  } else {
    console.log('   ⚠️  WEAK: Red P1 moves up but very cautiously (2-3 spaces)');
  }

  // ADDITIONAL CHECK: Other pieces should NOT all stack on same square
  const finalPositions = result.commands.map((cmd, i) => {
    const piece = gameState.players.B!.pieces[i];
    let finalX = piece.x;
    let finalY = piece.y;

    if (cmd.direction === 'left') finalX -= cmd.distance;
    if (cmd.direction === 'right') finalX += cmd.distance;
    if (cmd.direction === 'down') finalY -= cmd.distance;
    if (cmd.direction === 'up') finalY += cmd.distance;

    return { pieceId: cmd.pieceId, x: finalX, y: finalY };
  });

  console.log('\n📍 Final positions after AI moves:');
  finalPositions.forEach(pos => {
    console.log(`   Red P${pos.pieceId}: (${pos.x},${pos.y})`);
  });

  // Check for stacking bug (all pieces at same position)
  const uniquePositions = new Set(finalPositions.map(p => `${p.x},${p.y}`));
  assert.ok(
    uniquePositions.size >= 2,
    `AI should not stack all pieces on same square (found ${uniquePositions.size} unique positions)`
  );

  console.log('\n✅ PASS: Red P1 correctly exploits open lane by moving UP');
});

console.log('\n✅ Open lane test defined\n');
