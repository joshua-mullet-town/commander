/**
 * ScoreEvaluator - Centralized scoring logic for game state evaluation
 *
 * This is the SINGLE SOURCE OF TRUTH for all scoring calculations.
 * Used by:
 * - Nash AI strategy
 * - Minimax AI strategy
 * - Frontend display (via game state)
 * - Any other evaluation needs
 */

import type { CommanderGameState, Piece } from './types.js';
import { NO_GUARD_ZONES } from './constants.js';

/**
 * Detailed breakdown of all scoring factors
 */
export type ScoreBreakdown = {
  total: number;
  weHaveFlag: number;
  theyHaveFlag: number;
  weOnTheirFlag: number;
  theyOnOurFlag: number;
  weInTheirSafeZone: number;
  theyInOurSafeZone: number;
  weOnBackWall: number;
  theyOnBackWall: number;
  pieceAdvantage: number;
  capturesThisRound: number; // Points for capturing enemy pieces THIS round
};

/**
 * Evaluate a game state from a specific side's perspective
 *
 * @param state - The game state to evaluate
 * @param ourSide - Which side we're evaluating from ('A' = Blue, 'B' = Red)
 * @param beforeState - Optional previous state to detect captures this round
 * @returns Detailed breakdown of scores with total
 */
export function evaluateGameState(
  state: CommanderGameState,
  ourSide: 'A' | 'B',
  beforeState?: CommanderGameState
): ScoreBreakdown {
  const opponentSide = ourSide === 'A' ? 'B' : 'A';
  const breakdown: ScoreBreakdown = {
    total: 0,
    weHaveFlag: 0,
    theyHaveFlag: 0,
    weOnTheirFlag: 0,
    theyOnOurFlag: 0,
    weInTheirSafeZone: 0,
    theyInOurSafeZone: 0,
    weOnBackWall: 0,
    theyOnBackWall: 0,
    pieceAdvantage: 0,
    capturesThisRound: 0
  };

  // Terminal state: we won
  if (state.winner === ourSide) {
    breakdown.total = 10000;
    return breakdown;
  }

  // Terminal state: we lost
  if (state.winner === opponentSide) {
    breakdown.total = -10000;
    return breakdown;
  }

  const ourFlag = state.flags[ourSide];
  const enemyFlag = state.flags[opponentSide];
  const ourPieces = state.players[ourSide]?.pieces.filter(p => p.alive) || [];
  const enemyPieces = state.players[opponentSide]?.pieces.filter(p => p.alive) || [];

  // ============================================================================
  // 1. CRITICAL OUTCOMES - Flag possession (Highest Priority)
  // ============================================================================

  // We captured their flag
  if (enemyFlag.carriedBy?.player === ourSide) {
    breakdown.weHaveFlag = 8000;
  }

  // They captured our flag
  if (ourFlag.carriedBy?.player === opponentSide) {
    breakdown.theyHaveFlag = -8000;
  }

  // ============================================================================
  // 2. CRITICAL POSITIONS - Pieces on flags
  // ============================================================================

  // Count our pieces standing on their flag (about to capture!)
  if (!enemyFlag.carriedBy) {
    const weOnTheirFlagCount = ourPieces.filter(p =>
      p.x === enemyFlag.x && p.y === enemyFlag.y
    ).length;
    breakdown.weOnTheirFlag = weOnTheirFlagCount * 3000;
  }

  // Count enemy pieces standing on our flag (danger!)
  if (!ourFlag.carriedBy) {
    const theyOnOurFlagCount = enemyPieces.filter(p =>
      p.x === ourFlag.x && p.y === ourFlag.y
    ).length;
    breakdown.theyOnOurFlag = theyOnOurFlagCount * -3000;
  }

  // ============================================================================
  // 3. SAFE ZONE VIOLATIONS
  // ============================================================================

  // Check if no-guard zones are active
  const ourSafeZone = NO_GUARD_ZONES[ourSide];
  const theirSafeZone = NO_GUARD_ZONES[opponentSide];

  // Enemy in our safe zone (while active and not carrying flags)
  if (state.noGuardZoneActive?.[ourSide] && !enemyFlag.carriedBy) {
    const enemiesInOurZone = enemyPieces.filter(p =>
      p.x >= ourSafeZone.minX && p.x <= ourSafeZone.maxX &&
      p.y >= ourSafeZone.minY && p.y <= ourSafeZone.maxY
    ).length;
    breakdown.theyInOurSafeZone = enemiesInOurZone * -1000;
  }

  // We in their safe zone (while active and not carrying flags)
  if (state.noGuardZoneActive?.[opponentSide] && !ourFlag.carriedBy) {
    const weInTheirZone = ourPieces.filter(p =>
      p.x >= theirSafeZone.minX && p.x <= theirSafeZone.maxX &&
      p.y >= theirSafeZone.minY && p.y <= theirSafeZone.maxY
    ).length;
    breakdown.weInTheirSafeZone = weInTheirZone * 1000;
  }

  // ============================================================================
  // 4. TACTICAL POSITIONS - Back wall pressure
  // ============================================================================

  const enemyBackWallY = opponentSide === 'A' ? 10 : 0;
  const ourBackWallY = ourSide === 'A' ? 10 : 0;

  const weOnBackWall = ourPieces.filter(p =>
    p.y === enemyBackWallY
  ).length;
  breakdown.weOnBackWall = weOnBackWall * 500;

  const theyOnBackWall = enemyPieces.filter(p =>
    p.y === ourBackWallY
  ).length;
  breakdown.theyOnBackWall = theyOnBackWall * -500;

  // ============================================================================
  // 5. PIECE COUNT
  // ============================================================================

  breakdown.pieceAdvantage = (ourPieces.length - enemyPieces.length) * 200;

  // ============================================================================
  // 6. CAPTURES THIS ROUND (if beforeState provided)
  // ============================================================================

  if (beforeState) {
    // Count how many enemy pieces were alive before but are dead now
    const enemyPiecesBefore = beforeState.players[opponentSide]?.pieces.filter(p => p.alive) || [];
    const enemyPiecesNow = state.players[opponentSide]?.pieces.filter(p => p.alive) || [];
    const enemyCaptured = enemyPiecesBefore.length - enemyPiecesNow.length;

    // Count how many of our pieces were alive before but are dead now
    const ourPiecesBefore = beforeState.players[ourSide]?.pieces.filter(p => p.alive) || [];
    const ourPiecesNow = state.players[ourSide]?.pieces.filter(p => p.alive) || [];
    const weCaptured = ourPiecesBefore.length - ourPiecesNow.length;

    // Net captures: we get points for capturing enemies, lose points for being captured
    breakdown.capturesThisRound = (enemyCaptured * 1000) - (weCaptured * 1000);
  }

  // Calculate total
  breakdown.total =
    breakdown.weHaveFlag +
    breakdown.theyHaveFlag +
    breakdown.weOnTheirFlag +
    breakdown.theyOnOurFlag +
    breakdown.weInTheirSafeZone +
    breakdown.theyInOurSafeZone +
    breakdown.weOnBackWall +
    breakdown.theyOnBackWall +
    breakdown.pieceAdvantage +
    breakdown.capturesThisRound;

  return breakdown;
}

/**
 * Quick evaluation - returns just the total score
 */
export function evaluateGameStateQuick(
  state: CommanderGameState,
  side: 'A' | 'B'
): number {
  return evaluateGameState(state, side).total;
}
