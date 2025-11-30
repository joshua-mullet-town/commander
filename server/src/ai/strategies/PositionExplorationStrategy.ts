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
import { PIECES_PER_TEAM, BOARD_WIDTH, BOARD_HEIGHT } from '../../game/constants.js';

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
 * Represents a complete set of moves for all pieces
 */
type CombinedMove = Movement[];

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

    // DEBUG: Log actual piece positions from game state
    console.log(`📍 GAME STATE PIECES (Side ${side}):`);
    gameState.players[side].pieces.forEach(p => {
      console.log(`   P${p.id}: (${p.x}, ${p.y}) alive: ${p.alive}`);
    });

    // Clone initial state for simulations
    const initialState = this.cloneGameState(gameState);

    // DEBUG: Verify cloned state matches
    console.log(`📍 CLONED STATE PIECES (Side ${side}):`);
    initialState.players[side].pieces.forEach(p => {
      console.log(`   P${p.id}: (${p.x}, ${p.y}) alive: ${p.alive}`);
    });

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

    // Step 2: Combine enemy best moves (fill missing pieces with stay-still)
    const enemyCombinedMove: CombinedMove = [];
    for (let i = 1; i <= PIECES_PER_TEAM; i++) {
      enemyCombinedMove.push(
        enemyBestMoves.find(m => m.pieceId === i) || { pieceId: i, direction: 'up', distance: 0 }
      );
    }

    // Step 3: Find AI's best moves per direction per piece (against enemy's best)
    console.log(`   Step 2: Finding AI's best moves per direction (against enemy response)...`);
    const aiPieces = initialState.players[side].pieces.filter(p => p.alive);

    // Find best moves per direction for each ALIVE piece only
    const allPieceMoves: DirectionalMoves[] = [];
    for (const piece of aiPieces) {
      const pieceMoves = this.findBestMovesPerDirection(
        initialState,
        piece.id,
        side,
        enemyCombinedMove
      );
      allPieceMoves.push(pieceMoves);

      console.log(`      P${piece.id} best per direction: UP=${pieceMoves.up.scoreDelta.toFixed(0)}, DOWN=${pieceMoves.down.scoreDelta.toFixed(0)}, LEFT=${pieceMoves.left.scoreDelta.toFixed(0)}, RIGHT=${pieceMoves.right.scoreDelta.toFixed(0)}`);
    }

    // Step 4: Find best combination (avoids stacking)
    const aliveMovesOnly = this.findBestCombination(allPieceMoves);

    // Fill in dead pieces with "stay still" commands
    const aiBestMoves: Movement[] = [];
    for (let pieceId = 1; pieceId <= PIECES_PER_TEAM; pieceId++) {
      const aliveMove = aliveMovesOnly.find(m => m.pieceId === pieceId);
      if (aliveMove) {
        aiBestMoves.push(aliveMove);
      } else {
        // Dead piece - stay still
        aiBestMoves.push({ pieceId, direction: 'up', distance: 0 });
      }
    }

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
    const maxDistance = Math.max(BOARD_WIDTH, BOARD_HEIGHT); // Max possible move distance

    for (const direction of directions) {
      for (let distance = 1; distance <= maxDistance; distance++) {
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
    const maxDistance = Math.max(BOARD_WIDTH, BOARD_HEIGHT); // Max possible move distance

    for (const direction of directions) {
      for (let distance = 1; distance <= maxDistance; distance++) {
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
   * Given 4 moves per piece (N pieces), evaluates all 4^N combinations,
   * filters out friendly collisions, and returns the combination with
   * highest total score.
   */
  private findBestCombination(allPieceMoves: DirectionalMoves[]): Movement[] {
    const directions: ('up' | 'down' | 'left' | 'right')[] = ['up', 'down', 'left', 'right'];
    const numPieces = allPieceMoves.length;
    const totalCombinations = Math.pow(4, numPieces);

    // Initialize best combination (all pieces stay still)
    // Use the actual piece IDs from the moves
    let bestCombination: Movement[] = allPieceMoves.map(pieceMoves =>
      pieceMoves.up.movement // All directions have same pieceId, use 'up'
    );
    let bestTotalScore = 0;

    console.log(`   🔀 Evaluating all combinations (4^${numPieces} = ${totalCombinations})...`);

    // Generate all combinations using recursive helper
    const evaluateCombination = (directionIndices: number[]) => {
      // Build moves array from direction indices
      const moves: BestMoveResult[] = allPieceMoves.map((pieceMoves, pieceIdx) => {
        const dirIdx = directionIndices[pieceIdx];
        const dir = directions[dirIdx];
        return pieceMoves[dir];
      });

      // Check for friendly stacking
      for (let i = 0; i < moves.length; i++) {
        for (let j = i + 1; j < moves.length; j++) {
          const pos1 = moves[i].finalPosition;
          const pos2 = moves[j].finalPosition;
          if (pos1.x === pos2.x && pos1.y === pos2.y) {
            // Friendly collision - skip this combination
            return;
          }
        }
      }

      // Calculate total score
      const totalScore = moves.reduce((sum, move) => sum + move.scoreDelta, 0);

      // Keep if best so far
      if (totalScore > bestTotalScore) {
        bestTotalScore = totalScore;
        bestCombination = moves.map(m => m.movement);
      }
    };

    // Recursively generate all combinations
    const generateCombinations = (currentIndices: number[]) => {
      if (currentIndices.length === numPieces) {
        evaluateCombination(currentIndices);
        return;
      }

      for (let dirIdx = 0; dirIdx < 4; dirIdx++) {
        generateCombinations([...currentIndices, dirIdx]);
      }
    };

    generateCombinations([]);

    console.log(`   ✅ Best combination: total delta = ${bestTotalScore.toFixed(0)}`);
    bestCombination.forEach((move, i) => {
      console.log(`      P${i+1}: ${move.direction} ${move.distance}`);
    });

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

    const enemyMoveStr = enemyMove.map((m, i) => `P${i+1}=${m.direction} ${m.distance}`).join(', ');
    console.log(`         🔧 applySimultaneousMoves: Our P${ourMove.pieceId} ${ourMove.direction} ${ourMove.distance} (side ${ourSide})`);
    console.log(`            vs Enemy: ${enemyMoveStr}`);

    // Build movement commands for BOTH players
    const commands = {
      playerA: ourSide === 'A' ? [ourMove] : enemyMove,
      playerB: ourSide === 'B' ? [ourMove] : enemyMove
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
