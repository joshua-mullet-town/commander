/**
 * PositionExplorationStrategy - Systematic Position Exploration with Best-Response
 *
 * Instead of random move generation, this strategy systematically explores
 * every position each piece can reach, evaluates the board state, and keeps
 * only the single best move per piece.
 *
 * Algorithm:
 * 1. For each enemy piece: find its single best move (holding AI still)
 * 2. Combine enemy best moves into one scenario
 * 3. For each AI piece: find its single best move (against enemy's best)
 * 4. Return AI's best moves
 *
 * Computational efficiency: ~120 board evaluations (vs 45,000 in Nash)
 */

import type { AIStrategy, AIResponse } from './AIStrategy.js';
import type { CommanderGameState, Movement, Piece } from '../../game/types.js';
import { CommandProcessor } from '../../game/CommandProcessor.js';
import { CollisionDetector } from '../../game/CollisionDetector.js';
import { FlagManager } from '../../game/FlagManager.js';
import { evaluateGameStateQuick, evaluateGameState } from '../../game/ScoreEvaluator.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Result of finding the best move for a single piece
 */
interface BestMoveResult {
  movement: Movement;
  scoreDelta: number; // Improvement over baseline (staying still)
  finalPosition: { x: number; y: number }; // Where piece ends up
}

/**
 * Best move in each direction for a single piece
 */
interface DirectionalMoves {
  up: BestMoveResult;
  down: BestMoveResult;
  left: BestMoveResult;
  right: BestMoveResult;
}

/**
 * Represents a complete set of moves for all 3 pieces
 */
type CombinedMove = {
  piece1: Movement;
  piece2: Movement;
  piece3: Movement;
};

// ============================================================================
// PositionExplorationStrategy Implementation
// ============================================================================

export class PositionExplorationStrategy implements AIStrategy {
  readonly name = 'position-exploration';
  readonly version = 'v1';
  readonly description = 'Systematic position exploration - finds best move per piece';

  private commandProcessor: CommandProcessor;
  private collisionDetector: CollisionDetector;
  private flagManager: FlagManager;

  constructor() {
    this.commandProcessor = new CommandProcessor();
    this.collisionDetector = new CollisionDetector();
    this.flagManager = new FlagManager();
  }

  /**
   * Generate AI move using systematic position exploration
   */
  async getCommands(gameState: CommanderGameState, side: 'A' | 'B'): Promise<AIResponse> {
    const startTime = Date.now();
    const enemySide = side === 'A' ? 'B' : 'A';

    console.log(`\n🎯 [POSITION EXPLORATION] Generating move for Player ${side}`);

    // Clone initial state for simulations
    const initialState = this.cloneGameState(gameState);

    // Step 1: Find enemy's best move per piece (holding AI still)
    console.log(`   Step 1: Finding enemy's best moves...`);
    const enemyPieces = initialState.players[enemySide].pieces.filter(p => p.alive);
    const enemyBestMoves: Movement[] = [];

    for (const piece of enemyPieces) {
      const result = this.findBestMoveForPiece(
        initialState,
        piece.id,
        enemySide,
        undefined // No enemy move - AI is staying still
      );
      enemyBestMoves.push(result.movement);
      console.log(`      Enemy piece ${piece.id}: delta=${result.scoreDelta.toFixed(2)}, move=${result.movement.direction} ${result.movement.distance}`);
    }

    // Step 2: Combine enemy best moves
    const enemyCombinedMove: CombinedMove = {
      piece1: enemyBestMoves[0] || { pieceId: 1, direction: 'up', distance: 0 },
      piece2: enemyBestMoves[1] || { pieceId: 2, direction: 'up', distance: 0 },
      piece3: enemyBestMoves[2] || { pieceId: 3, direction: 'up', distance: 0 }
    };

    // Step 3: Find AI's best moves per direction per piece (against enemy's best)
    console.log(`   Step 2: Finding AI's best moves per direction (against enemy response)...`);
    const aiPieces = initialState.players[side].pieces.filter(p => p.alive);

    const piece1Moves = this.findBestMovesPerDirection(
      initialState,
      1,
      side,
      enemyCombinedMove
    );

    const piece2Moves = this.findBestMovesPerDirection(
      initialState,
      2,
      side,
      enemyCombinedMove
    );

    const piece3Moves = this.findBestMovesPerDirection(
      initialState,
      3,
      side,
      enemyCombinedMove
    );

    console.log(`      P1 best per direction: UP=${piece1Moves.up.scoreDelta.toFixed(0)}, DOWN=${piece1Moves.down.scoreDelta.toFixed(0)}, LEFT=${piece1Moves.left.scoreDelta.toFixed(0)}, RIGHT=${piece1Moves.right.scoreDelta.toFixed(0)}`);
    console.log(`      P2 best per direction: UP=${piece2Moves.up.scoreDelta.toFixed(0)}, DOWN=${piece2Moves.down.scoreDelta.toFixed(0)}, LEFT=${piece2Moves.left.scoreDelta.toFixed(0)}, RIGHT=${piece2Moves.right.scoreDelta.toFixed(0)}`);
    console.log(`      P3 best per direction: UP=${piece3Moves.up.scoreDelta.toFixed(0)}, DOWN=${piece3Moves.down.scoreDelta.toFixed(0)}, LEFT=${piece3Moves.left.scoreDelta.toFixed(0)}, RIGHT=${piece3Moves.right.scoreDelta.toFixed(0)}`);

    // Step 4: Find best combination (avoids stacking)
    const aiBestMoves = this.findBestCombination(piece1Moves, piece2Moves, piece3Moves);

    // Step 5: Simulate final state with best moves and calculate predicted score breakdown
    const finalState = this.cloneGameState(gameState);

    // Build commands for both sides
    const commands = {
      playerA: side === 'A' ? aiBestMoves : enemyBestMoves,
      playerB: side === 'B' ? aiBestMoves : enemyBestMoves
    };

    // Execute the moves using the existing execution logic
    const paths = this.commandProcessor.executeMovements(finalState, commands);
    const collisions = this.collisionDetector.detectCollisions(paths);
    this.commandProcessor.applyFinalPositions(finalState, paths);
    this.collisionDetector.resolveCollisions(
      finalState,
      collisions,
      (gs, player, pieceId) => this.flagManager.onPieceCaptured(gs, player, pieceId)
    );
    this.flagManager.checkFlagInteractions(finalState);

    // Calculate score breakdown from both perspectives (with initial state for capture detection)
    const predictedScoreBreakdown = {
      A: evaluateGameState(finalState, 'A', gameState),
      B: evaluateGameState(finalState, 'B', gameState)
    };

    const executionTime = Date.now() - startTime;
    console.log(`   ✅ Best moves found`);
    console.log(`   ⏱️  Execution time: ${executionTime}ms`);

    // Generate analysis with predicted score breakdown
    const analysis = {
      executionTime,
      scenariosEvaluated: enemyPieces.length * 41 + aiPieces.length * 41, // 1 baseline + 40 moves
      worstCaseScore: 0,
      similarMoves: 0,
      chosenMoves: aiBestMoves,
      predictedEnemyMoves: enemyBestMoves,
      predictedScoreBreakdown,
      finalScore: predictedScoreBreakdown[side].totalScore
    };

    return {
      commands: aiBestMoves,
      reasoning: `Position Exploration: Systematic position-by-position evaluation`,
      analysis,
      prompt: '' // No LLM, no prompt
    };
  }

  /**
   * Find the best move for a single piece
   *
   * @param gameState - Current game state
   * @param pieceId - Which piece to move
   * @param side - Which side owns this piece
   * @param enemyMove - (Optional) Enemy's simultaneous move to simulate against
   * @returns The best movement and its score improvement
   */
  private findBestMoveForPiece(
    gameState: CommanderGameState,
    pieceId: number,
    side: 'A' | 'B',
    enemyMove?: CombinedMove
  ): BestMoveResult {
    const piece = gameState.players[side].pieces.find(p => p.id === pieceId);
    if (!piece || !piece.alive) {
      // Dead piece - return stay still
      return {
        movement: { pieceId, direction: 'up', distance: 0 },
        scoreDelta: 0
      };
    }

    // Step 1: Calculate baseline (piece stays still)
    const baselineState = this.cloneGameState(gameState);
    const baselineMovement: Movement = { pieceId, direction: 'up', distance: 0 };

    if (enemyMove) {
      // Simulate piece staying still + enemy moving
      this.applySimultaneousMoves(baselineState, baselineMovement, enemyMove, side);
    }
    // Else: piece stays still, enemy stays still - state unchanged

    const baselineScore = evaluateGameState(baselineState, side, gameState).total;

    // Step 2: Initialize best move as baseline (staying still)
    let bestMove: Movement = baselineMovement;
    let bestScoreDelta = 0;

    // Step 3: Explore all directions and distances
    const directions: ('up' | 'down' | 'left' | 'right')[] = ['up', 'down', 'left', 'right'];

    for (const direction of directions) {
      for (let distance = 1; distance <= 10; distance++) {
        const testState = this.cloneGameState(gameState);
        const testMovement: Movement = { pieceId, direction, distance };

        if (enemyMove) {
          // Simulate this move + enemy's best move simultaneously
          this.applySimultaneousMoves(testState, testMovement, enemyMove, side);
        } else {
          // Simulate just this move (enemy stays still)
          this.applySingleMove(testState, testMovement, side);
        }

        // Evaluate resulting state (pass gameState as beforeState to detect captures)
        const scoreBreakdown = evaluateGameState(testState, side, gameState);
        const score = scoreBreakdown.total;
        const scoreDelta = score - baselineScore;

        // 🐛 DEBUG LOGGING: Show high-scoring moves
        if (scoreDelta > 1000) {
          console.log(`      🔍 DEBUG P${pieceId} ${direction} ${distance}: delta=${scoreDelta.toFixed(0)}, breakdown:`, {
            weHaveFlag: scoreBreakdown.weHaveFlag,
            theyHaveFlag: scoreBreakdown.theyHaveFlag,
            weOnTheirFlag: scoreBreakdown.weOnTheirFlag,
            theyOnOurFlag: scoreBreakdown.theyOnOurFlag,
            weInTheirSafeZone: scoreBreakdown.weInTheirSafeZone,
            theyInOurSafeZone: scoreBreakdown.theyInOurSafeZone,
            weOnBackWall: scoreBreakdown.weOnBackWall,
            theyOnBackWall: scoreBreakdown.theyOnBackWall,
            pieceAdvantage: scoreBreakdown.pieceAdvantage,
            capturesThisRound: scoreBreakdown.capturesThisRound
          });
        }

        // Keep if better than current best
        if (scoreDelta > bestScoreDelta) {
          bestMove = testMovement;
          bestScoreDelta = scoreDelta;
        }
      }
    }

    // Calculate final position for the best move
    const currentPiece = gameState.players[side].pieces.find(p => p.id === pieceId)!;
    let finalX = currentPiece.x;
    let finalY = currentPiece.y;

    if (bestMove.direction === 'up') finalY += bestMove.distance;
    if (bestMove.direction === 'down') finalY -= bestMove.distance;
    if (bestMove.direction === 'left') finalX -= bestMove.distance;
    if (bestMove.direction === 'right') finalX += bestMove.distance;

    return {
      movement: bestMove,
      scoreDelta: bestScoreDelta,
      finalPosition: { x: finalX, y: finalY }
    };
  }

  /**
   * Find the best move PER DIRECTION for a single piece (for combinatorial selection)
   * Returns up to 4 moves: best UP, best DOWN, best LEFT, best RIGHT
   */
  private findBestMovesPerDirection(
    gameState: CommanderGameState,
    pieceId: number,
    side: 'A' | 'B',
    enemyMove?: CombinedMove
  ): DirectionalMoves {
    const piece = gameState.players[side].pieces.find(p => p.id === pieceId);
    if (!piece || !piece.alive) {
      // Dead piece - return stay still for all directions
      const stayStill: BestMoveResult = {
        movement: { pieceId, direction: 'up', distance: 0 },
        scoreDelta: 0,
        finalPosition: { x: piece?.x || 0, y: piece?.y || 0 }
      };
      return { up: stayStill, down: stayStill, left: stayStill, right: stayStill };
    }

    // Calculate baseline score (staying still)
    const baselineState = this.cloneGameState(gameState);
    const baselineMovement: Movement = { pieceId, direction: 'up', distance: 0 };

    if (enemyMove) {
      this.applySimultaneousMoves(baselineState, baselineMovement, enemyMove, side);
    }

    const baselineScore = evaluateGameState(baselineState, side, gameState).total;

    // Initialize best move per direction (staying still = 0 delta)
    const stayStill: BestMoveResult = {
      movement: { pieceId, direction: 'up', distance: 0 },
      scoreDelta: 0,
      finalPosition: { x: piece.x, y: piece.y }
    };

    const bestMoves: DirectionalMoves = {
      up: { ...stayStill, movement: { pieceId, direction: 'up', distance: 0 } },
      down: { ...stayStill, movement: { pieceId, direction: 'down', distance: 0 } },
      left: { ...stayStill, movement: { pieceId, direction: 'left', distance: 0 } },
      right: { ...stayStill, movement: { pieceId, direction: 'right', distance: 0 } }
    };

    // Explore all distances for each direction
    const directions: ('up' | 'down' | 'left' | 'right')[] = ['up', 'down', 'left', 'right'];

    for (const direction of directions) {
      for (let distance = 1; distance <= 10; distance++) {
        const testState = this.cloneGameState(gameState);
        const testMovement: Movement = { pieceId, direction, distance };

        if (enemyMove) {
          this.applySimultaneousMoves(testState, testMovement, enemyMove, side);
        } else {
          this.applySingleMove(testState, testMovement, side);
        }

        const scoreBreakdown = evaluateGameState(testState, side, gameState);
        const score = scoreBreakdown.total;
        const scoreDelta = score - baselineScore;

        // Calculate final position
        let finalX = piece.x;
        let finalY = piece.y;
        if (direction === 'up') finalY += distance;
        if (direction === 'down') finalY -= distance;
        if (direction === 'left') finalX -= distance;
        if (direction === 'right') finalX += distance;

        // Keep if better than current best for this direction
        if (scoreDelta > bestMoves[direction].scoreDelta) {
          bestMoves[direction] = {
            movement: testMovement,
            scoreDelta,
            finalPosition: { x: finalX, y: finalY }
          };
        }
      }
    }

    return bestMoves;
  }

  /**
   * Find the best COMBINATION of moves across all pieces
   *
   * Given 4 moves per piece (3 pieces), evaluates all 64 combinations,
   * filters out friendly collisions, and returns the combination with
   * highest total score.
   */
  private findBestCombination(
    piece1Moves: DirectionalMoves,
    piece2Moves: DirectionalMoves,
    piece3Moves: DirectionalMoves
  ): Movement[] {
    const directions: ('up' | 'down' | 'left' | 'right')[] = ['up', 'down', 'left', 'right'];

    let bestCombination: Movement[] = [
      { pieceId: 1, direction: 'up', distance: 0 },
      { pieceId: 2, direction: 'up', distance: 0 },
      { pieceId: 3, direction: 'up', distance: 0 }
    ];
    let bestTotalScore = 0;

    console.log('   🔀 Evaluating all combinations (4×4×4 = 64)...');

    // Try all combinations
    for (const dir1 of directions) {
      for (const dir2 of directions) {
        for (const dir3 of directions) {
          const move1 = piece1Moves[dir1];
          const move2 = piece2Moves[dir2];
          const move3 = piece3Moves[dir3];

          // Check for friendly stacking
          const pos1 = move1.finalPosition;
          const pos2 = move2.finalPosition;
          const pos3 = move3.finalPosition;

          const p1p2Stack = pos1.x === pos2.x && pos1.y === pos2.y;
          const p1p3Stack = pos1.x === pos3.x && pos1.y === pos3.y;
          const p2p3Stack = pos2.x === pos3.x && pos2.y === pos3.y;

          if (p1p2Stack || p1p3Stack || p2p3Stack) {
            // Friendly collision - skip this combination
            continue;
          }

          // Calculate total score
          const totalScore = move1.scoreDelta + move2.scoreDelta + move3.scoreDelta;

          // Keep if best so far
          if (totalScore > bestTotalScore) {
            bestTotalScore = totalScore;
            bestCombination = [move1.movement, move2.movement, move3.movement];
          }
        }
      }
    }

    console.log(`   ✅ Best combination: total delta = ${bestTotalScore.toFixed(0)}`);
    console.log(`      P1: ${bestCombination[0].direction} ${bestCombination[0].distance}`);
    console.log(`      P2: ${bestCombination[1].direction} ${bestCombination[1].distance}`);
    console.log(`      P3: ${bestCombination[2].direction} ${bestCombination[2].distance}`);

    return bestCombination;
  }

  /**
   * Apply a single piece movement (enemy stays still)
   */
  private applySingleMove(
    state: CommanderGameState,
    move: Movement,
    ourSide: 'A' | 'B'
  ): void {
    const enemySide = ourSide === 'A' ? 'B' : 'A';

    console.log(`         🔧 applySingleMove: P${move.pieceId} ${move.direction} ${move.distance} (side ${ourSide})`);

    // Build movement commands (only our piece moves)
    const commands = {
      playerA: ourSide === 'A' ? [move] : [],
      playerB: ourSide === 'B' ? [move] : []
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
   * Apply simultaneous moves for our piece + enemy's combined move
   */
  private applySimultaneousMoves(
    state: CommanderGameState,
    ourMove: Movement,
    enemyMove: CombinedMove,
    ourSide: 'A' | 'B'
  ): void {
    const enemySide = ourSide === 'A' ? 'B' : 'A';

    console.log(`         🔧 applySimultaneousMoves: Our P${ourMove.pieceId} ${ourMove.direction} ${ourMove.distance} (side ${ourSide})`);
    console.log(`            vs Enemy: P1=${enemyMove.piece1.direction} ${enemyMove.piece1.distance}, P2=${enemyMove.piece2.direction} ${enemyMove.piece2.distance}, P3=${enemyMove.piece3.direction} ${enemyMove.piece3.distance}`);

    // Build movement commands for BOTH players
    const commands = {
      playerA: ourSide === 'A'
        ? [ourMove]
        : [enemyMove.piece1, enemyMove.piece2, enemyMove.piece3],
      playerB: ourSide === 'B'
        ? [ourMove]
        : [enemyMove.piece1, enemyMove.piece2, enemyMove.piece3]
    };

    // Log piece counts BEFORE
    const ourPiecesBefore = state.players[ourSide]?.pieces.filter(p => p.alive).length || 0;
    const enemyPiecesBefore = state.players[enemySide]?.pieces.filter(p => p.alive).length || 0;

    // Execute movements
    const paths = this.commandProcessor.executeMovements(state, commands);

    // Detect collisions
    const collisions = this.collisionDetector.detectCollisions(paths);
    if (collisions.length > 0) {
      console.log(`            ⚔️  COLLISIONS: ${collisions.length} detected`);
      collisions.forEach((c, i) => {
        console.log(`               [${i}]`, JSON.stringify(c));
      });
    }

    // Apply final positions
    this.commandProcessor.applyFinalPositions(state, paths);

    // Resolve collisions (tagging)
    this.collisionDetector.resolveCollisions(
      state,
      collisions,
      (gs, player, pieceId) => this.flagManager.onPieceCaptured(gs, player, pieceId)
    );

    // Log piece counts AFTER
    const ourPiecesAfter = state.players[ourSide]?.pieces.filter(p => p.alive).length || 0;
    const enemyPiecesAfter = state.players[enemySide]?.pieces.filter(p => p.alive).length || 0;
    if (ourPiecesBefore !== ourPiecesAfter || enemyPiecesBefore !== enemyPiecesAfter) {
      console.log(`            📊 CAPTURES: Us ${ourPiecesBefore}→${ourPiecesAfter}, Enemy ${enemyPiecesBefore}→${enemyPiecesAfter}`);
    }

    // Check flag interactions
    this.flagManager.checkFlagInteractions(state);
  }

  /**
   * Deep clone game state for simulation
   */
  private cloneGameState(state: CommanderGameState): CommanderGameState {
    return JSON.parse(JSON.stringify(state));
  }
}

// Export singleton instance
export const PositionExplorationAI = new PositionExplorationStrategy();
