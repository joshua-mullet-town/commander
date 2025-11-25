/**
 * NashStrategy - Best Response Dynamics for Simultaneous-Move Games
 *
 * This strategy assumes the opponent will play their optimal move (from their perspective)
 * and chooses our move that leaves us in the best position after their best response.
 *
 * Algorithm:
 * 1. Generate N possible moves for us
 * 2. For each of our moves:
 *    a. Generate M possible enemy moves
 *    b. Find which enemy move is best for THEM (evalThem)
 *    c. Evaluate resulting state for US (evalMe)
 * 3. Pick our move with highest evalMe score after enemy's best response
 *
 * This is more realistic than minimax (worst-case) because it assumes
 * the enemy is playing to WIN, not to counter us specifically.
 */

import type { AIStrategy, AIResponse } from './AIStrategy.js';
import type { CommanderGameState, Movement, Piece, PlayerData } from '../../game/types.js';
import { CommandProcessor } from '../../game/CommandProcessor.js';
import { CollisionDetector } from '../../game/CollisionDetector.js';
import { FlagManager } from '../../game/FlagManager.js';
import { evaluateGameStateQuick, evaluateGameState } from '../../game/ScoreEvaluator.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Represents a complete set of moves for all 3 pieces
 */
type CombinedMove = {
  piece1: Movement;
  piece2: Movement;
  piece3: Movement;
};

// ============================================================================
// Configuration
// ============================================================================

const OUR_MOVE_SAMPLES = 300;    // Number of our moves to test
const ENEMY_MOVE_SAMPLES = 150;  // Number of enemy responses per our move

// ============================================================================
// NashStrategy Implementation
// ============================================================================

export class NashStrategy implements AIStrategy {
  readonly name = 'nash';
  readonly version = 'v1-best-response';
  readonly description = 'Best Response Dynamics - assumes opponent plays optimally for themselves';

  private commandProcessor: CommandProcessor;
  private collisionDetector: CollisionDetector;
  private flagManager: FlagManager;

  constructor() {
    this.commandProcessor = new CommandProcessor();
    this.collisionDetector = new CollisionDetector();
    this.flagManager = new FlagManager();
  }

  /**
   * Generate AI move using best-response dynamics
   */
  async getCommands(gameState: CommanderGameState, side: 'A' | 'B'): Promise<AIResponse> {
    const startTime = Date.now();
    const enemySide = side === 'A' ? 'B' : 'A';

    console.log(`\n🎯 [NASH STRATEGY] Generating move for Player ${side}`);

    // Clone initial state for simulations
    const initialState = this.cloneGameState(gameState);

    // Generate candidate moves
    const ourMoves = this.generateRandomMoves(initialState, side, OUR_MOVE_SAMPLES);
    console.log(`   Generated ${ourMoves.length} candidate moves for us`);

    // For each of our moves, find enemy's best response and evaluate
    let bestOurScore = -Infinity;
    let bestOurMove: CombinedMove | null = null;
    let bestEnemyResponse: CombinedMove | null = null;

    const moveScores: { move: CombinedMove; ourScore: number; enemyResponse: CombinedMove }[] = [];

    for (const ourMove of ourMoves) {
      // Generate possible enemy responses
      const enemyMoves = this.generateRandomMoves(initialState, enemySide, ENEMY_MOVE_SAMPLES);

      // Find enemy's best response (from THEIR perspective)
      let bestEnemyScore = -Infinity;
      let bestEnemyMove: CombinedMove | null = null;
      let bestEnemyState: CommanderGameState | null = null;

      for (const enemyMove of enemyMoves) {
        const testState = this.cloneGameState(initialState);
        this.applySimultaneousMoves(testState, ourMove, enemyMove, side);

        // Evaluate from ENEMY perspective using centralized evaluator
        const enemyScore = evaluateGameStateQuick(testState, enemySide);

        if (enemyScore > bestEnemyScore) {
          bestEnemyScore = enemyScore;
          bestEnemyMove = enemyMove;
          bestEnemyState = testState;
        }
      }

      // Now evaluate that state from OUR perspective using centralized evaluator
      const ourScore = evaluateGameStateQuick(bestEnemyState!, side);

      moveScores.push({ move: ourMove, ourScore, enemyResponse: bestEnemyMove! });

      if (ourScore > bestOurScore) {
        bestOurScore = ourScore;
        bestOurMove = ourMove;
        bestEnemyResponse = bestEnemyMove;
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(`   ✅ Best move found with score ${bestOurScore} (enemy response score from their perspective: evaluated)`);
    console.log(`   ⏱️  Execution time: ${executionTime}ms`);
    console.log(`   📊 Evaluated ${OUR_MOVE_SAMPLES * ENEMY_MOVE_SAMPLES} scenarios`);

    if (!bestOurMove) {
      throw new Error('Nash strategy failed to find a move');
    }

    // Convert best move to commands
    const commands = this.combinedMoveToCommands(bestOurMove);

    // Generate detailed analysis
    const analysis = this.generateAnalysis(
      initialState,
      side,
      bestOurMove,
      bestEnemyResponse!,
      bestOurScore,
      executionTime,
      OUR_MOVE_SAMPLES * ENEMY_MOVE_SAMPLES,
      moveScores
    );

    return {
      commands,
      reasoning: `Nash Strategy: Found best response move with score ${bestOurScore}`,
      analysis,
      prompt: '' // Nash is deterministic, no LLM prompt
    };
  }

  /**
   * Generate detailed analysis for the chosen move
   */
  private generateAnalysis(
    initialState: CommanderGameState,
    side: 'A' | 'B',
    ourMove: CombinedMove,
    enemyResponse: CombinedMove,
    finalScore: number,
    executionTime: number,
    scenariosEvaluated: number,
    moveScores: { move: CombinedMove; ourScore: number }[]
  ): import('../../game/types.js').AIAnalysis {
    // Apply both moves to get final state
    const finalState = this.cloneGameState(initialState);
    this.applySimultaneousMoves(finalState, ourMove, enemyResponse, side);

    // Get score breakdown using centralized evaluator (with before state to detect captures)
    const predictedScoreBreakdown = {
      A: evaluateGameState(finalState, 'A', initialState),
      B: evaluateGameState(finalState, 'B', initialState)
    };

    // Count similar moves (within 10% of best score)
    const similarMoves = moveScores.filter(m =>
      Math.abs(m.ourScore - finalScore) < Math.abs(finalScore) * 0.1
    ).length;

    return {
      executionTime,
      scenariosEvaluated,
      worstCaseScore: finalScore, // In Nash, this is "best after enemy's best response"
      similarMoves,
      chosenMoves: this.combinedMoveToCommands(ourMove),
      predictedEnemyMoves: this.combinedMoveToCommands(enemyResponse),
      predictedScoreBreakdown,
      finalScore
    };
  }


  /**
   * Generate random moves for a player
   */
  private generateRandomMoves(state: CommanderGameState, side: 'A' | 'B', count: number): CombinedMove[] {
    const moves: CombinedMove[] = [];
    const pieces = state.players[side].pieces.filter(p => p.alive);

    if (pieces.length === 0) return moves;

    const directions: ('up' | 'down' | 'left' | 'right')[] = ['up', 'down', 'left', 'right'];

    for (let i = 0; i < count; i++) {
      const move: CombinedMove = {
        piece1: {
          pieceId: pieces[0]?.id || 1,
          direction: directions[Math.floor(Math.random() * directions.length)],
          distance: Math.floor(Math.random() * 5) + 1
        },
        piece2: {
          pieceId: pieces[1]?.id || 2,
          direction: directions[Math.floor(Math.random() * directions.length)],
          distance: Math.floor(Math.random() * 5) + 1
        },
        piece3: {
          pieceId: pieces[2]?.id || 3,
          direction: directions[Math.floor(Math.random() * directions.length)],
          distance: Math.floor(Math.random() * 5) + 1
        }
      };
      moves.push(move);
    }

    return moves;
  }

  /**
   * Apply simultaneous moves to game state
   */
  private applySimultaneousMoves(
    state: CommanderGameState,
    ourMove: CombinedMove,
    enemyMove: CombinedMove,
    ourSide: 'A' | 'B'
  ): void {
    const enemySide = ourSide === 'A' ? 'B' : 'A';

    // Build movement commands for BOTH players
    const commands = {
      playerA: ourSide === 'A'
        ? [ourMove.piece1, ourMove.piece2, ourMove.piece3]
        : [enemyMove.piece1, enemyMove.piece2, enemyMove.piece3],
      playerB: ourSide === 'B'
        ? [ourMove.piece1, ourMove.piece2, ourMove.piece3]
        : [enemyMove.piece1, enemyMove.piece2, enemyMove.piece3]
    };

    // Execute movements
    const paths = this.commandProcessor.executeMovements(state, commands);

    // Detect collisions
    const collisions = this.collisionDetector.detectCollisions(paths);

    // Apply final positions
    this.commandProcessor.applyFinalPositions(state, paths);

    // Resolve collisions (tagging)
    this.collisionDetector.resolveCollisions(
      state,
      collisions,
      (gs, player, pieceId) => this.flagManager.onPieceCaptured(gs, player, pieceId)
    );

    // Check flag interactions
    this.flagManager.checkFlagInteractions(state);
  }

  /**
   * Deep clone game state for simulation
   */
  private cloneGameState(state: CommanderGameState): CommanderGameState {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Convert CombinedMove to Movement[] array
   */
  private combinedMoveToCommands(move: CombinedMove): Movement[] {
    return [move.piece1, move.piece2, move.piece3];
  }
}

// Export singleton instance
export const NashAI = new NashStrategy();
