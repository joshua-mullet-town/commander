/**
 * HeuristicStrategy - Utility-based AI using weighted heuristics
 *
 * Based on industry best practices from Game AI Pro:
 * - Evaluates all possible moves with normalized scores (0-1)
 * - Combines multiple considerations with configurable weights
 * - Fast O(n) evaluation, no tree search needed
 * - Modular and tunable for different difficulty levels
 */

import type { AIStrategy, Command, AIResponse } from './AIStrategy.js';
import type { CommanderGameState } from '../../game/types.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type HeuristicWeights = {
  interceptEnemyWithFlag: number;  // Stop enemy carrying our flag
  canGrabEnemyFlag: number;        // Capture enemy flag
  defendOurFlag: number;           // Stay near our flag
  distanceToEnemyFlag: number;     // Move toward enemy flag
  protectFlagCarrier: number;      // Support our flag carrier
  grabRescueKey: number;           // Pick up rescue keys
  blockEnemyPath: number;          // Block enemy movement
  avoidGettingTagged: number;      // Don't suicide into enemy pieces in their territory
  avoidEnemyTerritory: number;     // Stay safe
  avoidEnemyPieces: number;        // Avoid enemy pieces
};

type Position = { x: number; y: number };
type Move = { pieceId: number; direction: 'up' | 'down' | 'left' | 'right'; distance: number; endPos: Position };
type Piece = { id: number; x: number; y: number; alive: boolean };

// ============================================================================
// Heuristic Strategy (Configurable Base Class)
// ============================================================================

export class HeuristicStrategy implements AIStrategy {
  constructor(
    public readonly name: string,
    public readonly version: string,
    public readonly description: string,
    private weights: HeuristicWeights
  ) {
    // Validate weights sum to ~1.0 (allow small floating point error)
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      console.warn(`⚠️ Weights for ${name} sum to ${sum.toFixed(3)}, should be 1.0`);
    }
  }

  async getCommands(gameState: CommanderGameState, aiPlayer: 'A' | 'B'): Promise<AIResponse> {
    const startTime = Date.now();

    const myPieces = gameState.players[aiPlayer]?.pieces.filter(p => p.alive) || [];
    const commands: Command[] = [];
    const moveExplanations: string[] = [];

    // Evaluate best move for each piece
    for (const piece of myPieces) {
      const bestMove = this.findBestMoveForPiece(piece, gameState, aiPlayer);

      if (bestMove) {
        commands.push({
          pieceId: bestMove.pieceId,
          direction: bestMove.direction,
          distance: bestMove.distance
        });
        moveExplanations.push(`P${piece.id}: ${bestMove.direction} ${bestMove.distance}`);
      }
    }

    const elapsedMs = Date.now() - startTime;
    const reasoning = `${this.description} (${commands.length} moves in ${elapsedMs}ms)`;

    console.log(`🎯 ${this.name}: Generated ${commands.length} commands in ${elapsedMs}ms`);

    return {
      commands,
      reasoning,
      prompt: `Heuristic AI (${this.name}) - No prompt needed`
    };
  }

  // ==========================================================================
  // Move Generation & Evaluation
  // ==========================================================================

  private findBestMoveForPiece(piece: Piece, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): Move | null {
    const possibleMoves = this.generatePossibleMoves(piece, gameState);

    if (possibleMoves.length === 0) {
      return null;
    }

    let bestScore = -Infinity;
    let bestMove: Move | null = null;

    for (const move of possibleMoves) {
      const score = this.evaluateMove(move, gameState, aiPlayer);

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private generatePossibleMoves(piece: Piece, gameState: CommanderGameState): Move[] {
    const moves: Move[] = [];
    const directions: Array<'up' | 'down' | 'left' | 'right'> = ['up', 'down', 'left', 'right'];

    // Try distances 1-10 in each direction
    for (const direction of directions) {
      for (let distance = 1; distance <= 10; distance++) {
        const endPos = this.calculateEndPosition(piece, direction, distance);

        // Validate move stays on board
        if (endPos.x >= 0 && endPos.x <= 10 && endPos.y >= 0 && endPos.y <= 10) {
          moves.push({
            pieceId: piece.id,
            direction,
            distance,
            endPos
          });
        } else {
          break; // Stop trying longer distances in this direction
        }
      }
    }

    return moves;
  }

  private calculateEndPosition(piece: Piece, direction: string, distance: number): Position {
    let x = piece.x;
    let y = piece.y;

    switch (direction) {
      case 'up': y -= distance; break;
      case 'down': y += distance; break;
      case 'left': x -= distance; break;
      case 'right': x += distance; break;
    }

    return { x, y };
  }

  // ==========================================================================
  // Scoring Function (Weighted Sum of Normalized Considerations)
  // ==========================================================================

  private evaluateMove(move: Move, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): number {
    const considerations = {
      interceptEnemyWithFlag: this.scoreInterceptEnemyWithFlag(move, gameState, aiPlayer),
      canGrabEnemyFlag: this.scoreCanGrabEnemyFlag(move, gameState, aiPlayer),
      defendOurFlag: this.scoreDefendOurFlag(move, gameState, aiPlayer),
      distanceToEnemyFlag: this.scoreDistanceToEnemyFlag(move, gameState, aiPlayer),
      protectFlagCarrier: this.scoreProtectFlagCarrier(move, gameState, aiPlayer),
      grabRescueKey: this.scoreGrabRescueKey(move, gameState, aiPlayer),
      blockEnemyPath: this.scoreBlockEnemyPath(move, gameState, aiPlayer),
      avoidGettingTagged: this.scoreAvoidGettingTagged(move, gameState, aiPlayer),
      avoidEnemyTerritory: this.scoreAvoidEnemyTerritory(move, gameState, aiPlayer),
      avoidEnemyPieces: this.scoreAvoidEnemyPieces(move, gameState, aiPlayer)
    };

    // Weighted sum (all scores normalized 0-1, weights sum to 1.0)
    let totalScore = 0;
    for (const [key, value] of Object.entries(considerations)) {
      totalScore += value * this.weights[key as keyof HeuristicWeights];
    }

    return totalScore;
  }

  // ==========================================================================
  // Heuristic Considerations (Each returns 0-1 normalized score)
  // ==========================================================================

  /**
   * CRITICAL: Intercept enemy carrying our flag
   * Returns 1.0 if move gets us closer to enemy with flag, 0.0 otherwise
   */
  private scoreInterceptEnemyWithFlag(move: Move, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): number {
    const ourFlag = gameState.flags[aiPlayer];
    const enemyPlayer = aiPlayer === 'A' ? 'B' : 'A';

    // Early-out: No threat if flag not carried by enemy
    if (!ourFlag.carriedBy || ourFlag.carriedBy.player !== enemyPlayer) {
      return 0;
    }

    // Find enemy piece carrying our flag
    const enemyWithFlag = gameState.players[enemyPlayer]?.pieces.find(
      p => p.id === ourFlag.carriedBy!.pieceId && p.alive
    );

    if (!enemyWithFlag) return 0;

    // Score based on distance after move (closer = better)
    const distanceAfterMove = this.manhattanDistance(move.endPos, enemyWithFlag);
    const maxDistance = 20; // Board diagonal

    return 1.0 - Math.min(distanceAfterMove / maxDistance, 1.0);
  }

  /**
   * HIGH: Can we grab the enemy flag with this move?
   * Returns 1.0 if we land on enemy flag, 0.0 otherwise
   */
  private scoreCanGrabEnemyFlag(move: Move, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): number {
    const enemyPlayer = aiPlayer === 'A' ? 'B' : 'A';
    const enemyFlag = gameState.flags[enemyPlayer];

    // Can only grab if flag is not already carried
    if (enemyFlag.carriedBy) return 0;

    // Check if move lands on flag
    if (move.endPos.x === enemyFlag.x && move.endPos.y === enemyFlag.y) {
      return 1.0; // JACKPOT!
    }

    return 0;
  }

  /**
   * HIGH: Defend our flag by staying near it
   * Returns higher score the closer we are to our flag
   */
  private scoreDefendOurFlag(move: Move, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): number {
    const ourFlag = gameState.flags[aiPlayer];

    // Don't defend if enemy already has it (intercept instead)
    if (ourFlag.carriedBy) return 0;

    const distanceAfterMove = this.manhattanDistance(move.endPos, ourFlag);
    const maxDistance = 20;

    // Closer to flag = higher score
    return 1.0 - Math.min(distanceAfterMove / maxDistance, 1.0);
  }

  /**
   * MEDIUM: Move toward enemy flag (general offensive positioning)
   */
  private scoreDistanceToEnemyFlag(move: Move, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): number {
    const enemyPlayer = aiPlayer === 'A' ? 'B' : 'A';
    const enemyFlag = gameState.flags[enemyPlayer];

    // Don't use if flag already carried (other heuristics handle that)
    if (enemyFlag.carriedBy) return 0;

    const distanceAfterMove = this.manhattanDistance(move.endPos, enemyFlag);
    const maxDistance = 20;

    return 1.0 - Math.min(distanceAfterMove / maxDistance, 1.0);
  }

  /**
   * MEDIUM: Protect our flag carrier by staying near them
   */
  private scoreProtectFlagCarrier(move: Move, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): number {
    const enemyPlayer = aiPlayer === 'A' ? 'B' : 'A';
    const enemyFlag = gameState.flags[enemyPlayer];

    // Early-out: Only relevant if WE have enemy flag
    if (!enemyFlag.carriedBy || enemyFlag.carriedBy.player !== aiPlayer) {
      return 0;
    }

    // Find our piece carrying the flag
    const ourCarrier = gameState.players[aiPlayer]?.pieces.find(
      p => p.id === enemyFlag.carriedBy!.pieceId && p.alive
    );

    if (!ourCarrier) return 0;

    // Don't score for the carrier itself
    if (move.pieceId === ourCarrier.id) return 0;

    const distanceAfterMove = this.manhattanDistance(move.endPos, ourCarrier);
    const maxDistance = 20;

    return 1.0 - Math.min(distanceAfterMove / maxDistance, 1.0);
  }

  /**
   * LOW: Grab rescue key if we have jailed pieces
   */
  private scoreGrabRescueKey(move: Move, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): number {
    const ourKey = gameState.rescueKeys[aiPlayer];
    const jailedPieces = gameState.players[aiPlayer]?.jailedPieces || [];

    // Early-out: No key or no jailed pieces
    if (!ourKey || jailedPieces.length === 0) {
      return 0;
    }

    // Check if move lands on key
    if (move.endPos.x === ourKey.x && move.endPos.y === ourKey.y) {
      return 1.0;
    }

    return 0;
  }

  /**
   * HIGH: Block enemy flag carrier's path to their territory
   * Must be: (1) Same column, AND (2) Between them and their goal
   */
  private scoreBlockEnemyPath(move: Move, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): number {
    const ourFlag = gameState.flags[aiPlayer];
    const enemyPlayer = aiPlayer === 'A' ? 'B' : 'A';

    // Early-out: Only relevant if enemy has our flag
    if (!ourFlag.carriedBy || ourFlag.carriedBy.player !== enemyPlayer) {
      return 0;
    }

    // Find enemy piece carrying our flag
    const enemyWithFlag = gameState.players[enemyPlayer]?.pieces.find(
      p => p.id === ourFlag.carriedBy!.pieceId && p.alive
    );

    if (!enemyWithFlag) return 0;

    // Enemy's goal direction:
    // Team A (Blue) needs to go DOWN (toward y=10)
    // Team B (Red) needs to go UP (toward y=0)
    const enemyGoingDown = enemyPlayer === 'A'; // Blue goes down, Red goes up

    // Are we in the same column as the flag carrier?
    if (move.endPos.x === enemyWithFlag.x) {
      // Check if we're BETWEEN them and their goal
      const weAreBetween = enemyGoingDown
        ? move.endPos.y > enemyWithFlag.y  // We're below them (blocking their path down)
        : move.endPos.y < enemyWithFlag.y; // We're above them (blocking their path up)

      if (!weAreBetween) {
        // We're in their column but BEHIND them - useless!
        return 0;
      }

      // PERFECT BLOCKING - Same column AND in front of them!
      // Closer to them = better (harder to go around)
      const yDistance = Math.abs(move.endPos.y - enemyWithFlag.y);
      const proximityBonus = Math.max(0, 1.0 - yDistance / 10);

      // Base score of 0.7 for blocking position, + up to 0.3 for proximity
      return 0.7 + (proximityBonus * 0.3);
    }

    // If we're within 1 column of them AND in front, we're "almost blocking"
    const xDistance = Math.abs(move.endPos.x - enemyWithFlag.x);
    if (xDistance === 1) {
      const weAreBetween = enemyGoingDown
        ? move.endPos.y > enemyWithFlag.y
        : move.endPos.y < enemyWithFlag.y;

      if (weAreBetween) {
        return 0.3; // Partial credit for being adjacent and in front
      }
    }

    return 0;
  }

  /**
   * CRITICAL: Avoid getting tagged - don't move to a cell with an enemy piece in their territory
   */
  private scoreAvoidGettingTagged(move: Move, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): number {
    const enemyPlayer = aiPlayer === 'A' ? 'B' : 'A';
    const enemyPieces = gameState.players[enemyPlayer]?.pieces.filter(p => p.alive) || [];

    // Determine enemy territory
    // Team A territory: y >= 6, Team B territory: y <= 4
    const isInEnemyTerritory = aiPlayer === 'A'
      ? move.endPos.y <= 4  // We're Team A, enemy territory is rows 0-4
      : move.endPos.y >= 6; // We're Team B, enemy territory is rows 6-10

    // If we're NOT in enemy territory, we can't get tagged (we're safe)
    if (!isInEnemyTerritory) {
      return 1.0;
    }

    // We're in enemy territory - check if any enemy piece is at our destination
    const enemyAtDestination = enemyPieces.some(
      enemy => enemy.x === move.endPos.x && enemy.y === move.endPos.y
    );

    if (enemyAtDestination) {
      // SUICIDE MOVE - We'll get tagged immediately!
      return 0.0;
    }

    // We're in enemy territory but not landing on an enemy
    // Still risky, but not instant death
    // Check if enemies are nearby (within 1 cell)
    const nearbyEnemies = enemyPieces.filter(enemy => {
      const distance = this.manhattanDistance(move.endPos, enemy);
      return distance <= 1;
    });

    if (nearbyEnemies.length > 0) {
      // Enemies are adjacent - very risky
      return 0.3;
    }

    // In enemy territory but no immediate threat
    return 0.7;
  }

  /**
   * LOW: Avoid enemy territory (stay safe)
   */
  private scoreAvoidEnemyTerritory(move: Move, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): number {
    const enemyTerritory = aiPlayer === 'A' ? [0, 1, 2, 3, 4] : [6, 7, 8, 9, 10];

    // If move is in enemy territory, score low (we want to avoid it)
    if (enemyTerritory.includes(move.endPos.y)) {
      return 0; // Penalize being in enemy territory
    }

    return 1.0; // Reward staying in safe zones
  }

  /**
   * LOW: Avoid enemy pieces
   */
  private scoreAvoidEnemyPieces(move: Move, gameState: CommanderGameState, aiPlayer: 'A' | 'B'): number {
    const enemyPlayer = aiPlayer === 'A' ? 'B' : 'A';
    const enemyPieces = gameState.players[enemyPlayer]?.pieces.filter(p => p.alive) || [];

    // Find closest enemy to our end position
    let minDistance = Infinity;
    for (const enemy of enemyPieces) {
      const distance = this.manhattanDistance(move.endPos, enemy);
      minDistance = Math.min(minDistance, distance);
    }

    if (minDistance === Infinity) return 1.0;

    // Farther from enemies = better
    const maxDistance = 20;
    return Math.min(minDistance / maxDistance, 1.0);
  }

  // ==========================================================================
  // Utility Functions
  // ==========================================================================

  private manhattanDistance(pos1: Position, pos2: Position): number {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
  }
}

// ============================================================================
// Pre-configured Strategy Instances
// ============================================================================

/**
 * Balanced Strategy - Even mix of offense and defense
 */
export const BalancedHeuristic = new HeuristicStrategy(
  'heuristic-balanced',
  'v3',
  'Balanced AI with path blocking and suicide prevention',
  {
    interceptEnemyWithFlag: 0.18,
    canGrabEnemyFlag: 0.18,
    defendOurFlag: 0.12,
    distanceToEnemyFlag: 0.12,
    protectFlagCarrier: 0.09,
    blockEnemyPath: 0.14,
    grabRescueKey: 0.04,
    avoidGettingTagged: 0.10,  // NEW - Prevent suicide moves!
    avoidEnemyTerritory: 0.02,
    avoidEnemyPieces: 0.01
  }
);

/**
 * Aggressive Strategy - Offense-focused, takes risks
 */
export const AggressiveHeuristic = new HeuristicStrategy(
  'heuristic-aggressive',
  'v2',
  'Offense-focused AI with calculated risks',
  {
    interceptEnemyWithFlag: 0.14,
    canGrabEnemyFlag: 0.32,
    defendOurFlag: 0.05,
    distanceToEnemyFlag: 0.23,
    protectFlagCarrier: 0.09,
    grabRescueKey: 0.04,
    blockEnemyPath: 0.03,
    avoidGettingTagged: 0.07,  // Lower weight - more willing to take risks
    avoidEnemyTerritory: 0.02,
    avoidEnemyPieces: 0.01
  }
);

/**
 * Defensive Strategy - Defense-focused, plays it safe
 */
export const DefensiveHeuristic = new HeuristicStrategy(
  'heuristic-defensive',
  'v3',
  'Defense-focused AI with path blocking and safety',
  {
    interceptEnemyWithFlag: 0.25,
    canGrabEnemyFlag: 0.09,
    defendOurFlag: 0.20,
    distanceToEnemyFlag: 0.04,
    protectFlagCarrier: 0.14,
    blockEnemyPath: 0.14,
    grabRescueKey: 0.03,
    avoidGettingTagged: 0.08,  // Higher weight - plays it safe
    avoidEnemyTerritory: 0.02,
    avoidEnemyPieces: 0.01
  }
);
