/**
 * Test: Round 7 Bug - AI Fails to Block Obvious Flag Capture
 *
 * Scenario:
 * - Blue P4 at (9, 10) - clear path to Red flag at (9, 0)
 * - Red P6 at (10, 2) - can move LEFT 1 to intercept at (9, 2)
 * - Blue P4 will move DOWN 10 → straight to flag
 * - Red P6 should block by moving LEFT 1
 *
 * Bug: AI chooses worstCaseScore = 0 (stay still) instead of blocking
 *
 * This test will:
 * 1. Set up exact Round 7 board state
 * 2. Simulate Red P6 evaluating LEFT 1 with enemy move "Blue P4 DOWN 10"
 * 3. Check if collision is detected
 * 4. Check if score reflects defensive save
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { CommanderGameState } from '../../game/types.js';
import { PositionExplorationStrategy } from './PositionExplorationStrategy.js';

test('Round 7 Bug: Red P5 should block Blue P4 flag capture with LEFT 1', async () => {
  console.log('\n🧪 TEST: ROUND 7 BUG - AI SHOULD BLOCK FLAG CAPTURE\n');

  // Round 7 exact board state
  const gameState: CommanderGameState = {
    currentRound: 7,
    players: {
      A: {
        id: 'player-a',
        type: 'local-a' as const,
        pieces: [
          { id: 1, x: 0, y: 10, alive: true },
          { id: 2, x: 6, y: 10, alive: true },
          { id: 3, x: 8, y: 12, alive: true },
          { id: 4, x: 9, y: 10, alive: true },   // Blue P4 - clear path to Red flag!
          { id: 5, x: 10, y: 10, alive: true },
          { id: 6, x: 11, y: 10, alive: true },
          { id: 7, x: 12, y: 10, alive: true }
        ],
        jailedPieces: []
      },
      B: {
        id: 'player-b',
        type: 'ai-position-exploration' as const,
        pieces: [
          { id: 1, x: 8, y: 12, alive: false },  // JAILED
          { id: 2, x: 10, y: 12, alive: true },  // Red P2 - deep in enemy territory with Blue flag
          { id: 3, x: 0, y: 2, alive: true },
          { id: 4, x: 9, y: 10, alive: false },  // JAILED
          { id: 5, x: 12, y: 2, alive: true },
          { id: 6, x: 10, y: 2, alive: true },   // Red P6 - can intercept at (9,2)!
          { id: 7, x: 9, y: 10, alive: false }   // JAILED
        ],
        jailedPieces: []
      }
    },
    flags: {
      A: { x: 10, y: 12, carriedBy: { team: 'B', pieceId: 2 } },  // Blue flag carried by Red P2
      B: { x: 9, y: 0, carriedBy: null }                          // Red flag vulnerable!
    },
    rescueKeys: {
      A: null,
      B: null
    },
    noGuardZoneActive: {
      A: false,  // Blue flag captured by Red P2
      B: true    // Red flag still at base
    },
    noGuardZoneBounds: {
      A: { minX: 7, maxX: 11, minY: 9, maxY: 10 },
      B: { minX: 7, maxX: 11, minY: 0, maxY: 1 }
    }
  };

  console.log('📍 ROUND 7 BOARD STATE:');
  console.log('   Blue P4: (9, 10) - clear path to Red flag at (9, 0)');
  console.log('   Red P6:  (10, 2) - can intercept by moving LEFT 1 to (9, 2)');
  console.log('   Red P2:  (10, 12) - HAS BLUE FLAG (deep in enemy territory)');
  console.log('   Red flag: (9, 0) - VULNERABLE\n');

  const ai = new PositionExplorationStrategy();

  console.log('🎯 EXPECTED AI DECISION:');
  console.log('   Red P5 or P6 moves to (9, 2) to intercept Blue P4');
  console.log('   In Red territory: Blue P4 = invader = JAILED');
  console.log('   Score swing: -8000 (flag capture prevented) → +8000 delta\n');

  // Get AI commands
  const result = await ai.getCommands(gameState, 'B');
  const commands = result.commands;

  console.log('🤖 AI DECISION:');
  commands.forEach((cmd, i) => {
    const piece = gameState.players.B.pieces.find(p => p.id === cmd.pieceId);
    console.log(`   Red P${cmd.pieceId}: ${cmd.direction} ${cmd.distance} from (${piece?.x}, ${piece?.y})`);
  });

  // Check if EITHER P5 or P6 blocked at (9, 2)
  const p5Command = commands.find(c => c.pieceId === 5);
  const p6Command = commands.find(c => c.pieceId === 6);

  assert.ok(p5Command, 'AI should return command for Red P5');
  assert.ok(p6Command, 'AI should return command for Red P6');

  // Calculate P5 final position
  const p5 = gameState.players.B.pieces.find(p => p.id === 5)!;
  let p5X = p5.x, p5Y = p5.y;
  if (p5Command.direction === 'left') p5X -= p5Command.distance;
  if (p5Command.direction === 'right') p5X += p5Command.distance;
  if (p5Command.direction === 'up') p5Y += p5Command.distance;
  if (p5Command.direction === 'down') p5Y -= p5Command.distance;

  // Calculate P6 final position
  const p6 = gameState.players.B.pieces.find(p => p.id === 6)!;
  let p6X = p6.x, p6Y = p6.y;
  if (p6Command.direction === 'left') p6X -= p6Command.distance;
  if (p6Command.direction === 'right') p6X += p6Command.distance;
  if (p6Command.direction === 'up') p6Y += p6Command.distance;
  if (p6Command.direction === 'down') p6Y -= p6Command.distance;

  console.log(`\n🔍 Red P5 chose: ${p5Command.direction} ${p5Command.distance} → (${p5X}, ${p5Y})`);
  console.log(`🔍 Red P6 chose: ${p6Command.direction} ${p6Command.distance} → (${p6X}, ${p6Y})\n`);

  // ASSERTION: Either P5 or P6 should block at (9, 2)
  const p5Blocks = (p5X === 9 && p5Y === 2);
  const p6Blocks = (p6X === 9 && p6Y === 2);

  if (p5Blocks || p6Blocks) {
    const blocker = p5Blocks ? 'P5' : 'P6';
    console.log(`✅ TEST PASSED: AI correctly chose Red ${blocker} to block flag capture at (9, 2)\n`);
  } else {
    console.log('❌ TEST FAILED: AI did not block - flag capture imminent!\n');
    console.log(`   Neither P5 nor P6 ended at (9, 2) to intercept Blue P4\n`);
    assert.fail('AI should block flag capture');
  }
});
