/**
 * MinimaxStrategy - Game tree search with alpha-beta pruning
 * Evaluates complete game states (not positions) to find optimal moves
 */

import { Negamax, Node } from 'minimaxer';
import { NO_GUARD_ZONES } from '../../game/constants.js';

// NodeType and NodeAim are const enums - use numeric values directly
const NodeType = {
  ROOT: 0,
  INNER: 1,
  LEAF: 2
} as const;

const NodeAim = {
  MIN: -1,
  NONE: 0,
  MAX: 1
} as const;
import type { AIStrategy, AIResponse } from './AIStrategy.js';
import type { CommanderGameState, Movement, Piece, PlayerData } from '../../game/types.js';
import { CommandProcessor } from '../../game/CommandProcessor.js';
import { CollisionDetector } from '../../game/CollisionDetector.js';
import { FlagManager } from '../../game/FlagManager.js';
import { evaluateGameState, type ScoreBreakdown } from '../../game/ScoreEvaluator.js';

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

/**
 * Represents simultaneous moves for both players
 */
type SimultaneousMove = {
  ourMove: CombinedMove;
  enemyMove: CombinedMove;
};

/**
 * Simplified game state for minimax (cloneable, comparable)
 */
type MinimaxGameState = {
  round: number;
  currentPlayer: 'A' | 'B';
  players: {
    A: {
      pieces: Piece[];
      jailedPieces: number[];
    };
    B: {
      pieces: Piece[];
      jailedPieces: number[];
    };
  };
  flags: {
    A: { x: number; y: number; carriedBy: { player: 'A' | 'B'; pieceId: number } | null };
    B: { x: number; y: number; carriedBy: { player: 'A' | 'B'; pieceId: number } | null };
  };
  rescueKeys: {
    A: { x: number; y: number } | null;
    B: { x: number; y: number } | null;
  };
  noGuardZoneActive: {
    A: boolean;
    B: boolean;
  };
  gameStatus: 'waiting' | 'playing' | 'finished' | 'paused';
  winner?: 'A' | 'B';
};

/**
 * Breakdown of score components for debugging (OUTCOME-BASED)
 */

// ============================================================================
// MinimaxStrategy Implementation
// ============================================================================

export class MinimaxStrategy implements AIStrategy {
  readonly name = 'minimax';
  readonly version = 'v2-montecarlo';
  readonly description = 'Monte Carlo sampling with simultaneous move evaluation - samples 5,000 game scenarios';

  private commandProcessor = new CommandProcessor();
  private collisionDetector = new CollisionDetector();
  private flagManager = new FlagManager();

  /**
   * Get optimal commands using Monte Carlo sampling
   * Evaluates simultaneous moves for both players
   */
  async getCommands(gameState: CommanderGameState, side: 'A' | 'B'): Promise<AIResponse> {
    const startTime = Date.now();
    const enemySide = side === 'A' ? 'B' : 'A';

    // Convert to minimax-compatible state
    const initialState = this.convertToMinimaxState(gameState, side);

    // Monte Carlo sampling parameters
    const OUR_MOVE_SAMPLES = 200;  // Sample 200 of our possible moves
    const ENEMY_MOVE_SAMPLES = 100;  // For each, sample 100 enemy responses

    // Generate random sample of our moves
    const ourMoves = this.generateRandomMoves(initialState, side, OUR_MOVE_SAMPLES);

    if (ourMoves.length === 0) {
      return {
        commands: [],
        reasoning: 'No valid moves available',
        prompt: 'N/A (Monte Carlo)'
      };
    }

    console.log(`🎲 Monte Carlo sampling: ${ourMoves.length} our moves × ${ENEMY_MOVE_SAMPLES} enemy moves = ${ourMoves.length * ENEMY_MOVE_SAMPLES} evaluations`);

    // Evaluate each of our moves against random enemy responses (MINIMAX)
    let bestMove: CombinedMove = ourMoves[0];
    let bestWorstScore = -Infinity;
    let worstCaseEnemyMove: CombinedMove | null = null;
    const moveScores: { move: CombinedMove; worstScore: number; worstEnemyMove: CombinedMove }[] = [];

    for (const ourMove of ourMoves) {
      // Generate random enemy responses
      const enemyMoves = this.generateRandomMoves(initialState, enemySide, ENEMY_MOVE_SAMPLES);

      // Evaluate this move against all sampled enemy responses
      const scores: { score: number; enemyMove: CombinedMove }[] = [];

      for (const enemyMove of enemyMoves) {
        const testState = this.cloneGameState(initialState);
        this.applySimultaneousMoves(testState, ourMove, enemyMove, side);
        const score = this.evaluateGameState(testState, side);
        scores.push({ score, enemyMove });
      }

      // MINIMAX: Assume enemy plays their best move (worst for us)
      const worstCase = scores.reduce((min, curr) => curr.score < min.score ? curr : min);
      const worstScore = worstCase.score;
      moveScores.push({ move: ourMove, worstScore, worstEnemyMove: worstCase.enemyMove });

      if (worstScore > bestWorstScore) {
        bestWorstScore = worstScore;
        bestMove = ourMove;
        worstCaseEnemyMove = worstCase.enemyMove;
      }
    }

    const elapsedTime = Date.now() - startTime;
    console.log(`🤖 Minimax complete in ${elapsedTime}ms. Best worst-case score: ${bestWorstScore.toFixed(2)}`);

    // Find all moves with scores close to best (for tie-breaking)
    const tolerance = 100; // Within 100 points of best worst-case
    const topMoves = moveScores.filter(m => m.worstScore >= bestWorstScore - tolerance);

    // Randomly pick from top moves
    const selectedMove = topMoves[Math.floor(Math.random() * topMoves.length)];
    bestMove = selectedMove.move;

    const commands = [bestMove.piece1, bestMove.piece2, bestMove.piece3];

    // Convert worst-case enemy move to commands
    const predictedEnemyCommands = worstCaseEnemyMove
      ? [worstCaseEnemyMove.piece1, worstCaseEnemyMove.piece2, worstCaseEnemyMove.piece3]
      : [];

    // Get score breakdown for the best move against worst-case enemy response
    const bestMoveState = this.cloneGameState(initialState);
    if (worstCaseEnemyMove) {
      this.applySimultaneousMoves(bestMoveState, bestMove, worstCaseEnemyMove, side);
    }
    const breakdown = this.getScoreBreakdown(bestMoveState, side);

    // Build structured analysis data
    const teamName = side === 'A' ? 'Blue' : 'Red';
    const enemyName = side === 'A' ? 'Red' : 'Blue';

    const ourPieces = bestMoveState.players[side].pieces.filter(p => p.alive);
    const enemyPieces = bestMoveState.players[side === 'A' ? 'B' : 'A'].pieces.filter(p => p.alive);
    const ourFlag = bestMoveState.flags[side];
    const enemyFlag = bestMoveState.flags[side === 'A' ? 'B' : 'A'];

    const ourScoring: import('../../game/types.js').PieceScoring[] = [];
    const enemyScoring: import('../../game/types.js').PieceScoring[] = [];

    // Flag possession
    if (enemyFlag.carriedBy?.player === side) {
      const carrier = ourPieces.find(p => p.id === enemyFlag.carriedBy?.pieceId);
      if (carrier) ourScoring.push({ pieceId: carrier.id, action: 'Carrying enemy flag', points: 8000 });
    }
    if (ourFlag.carriedBy?.player !== side) {
      const carrier = enemyPieces.find(p => p.id === ourFlag.carriedBy?.pieceId);
      if (carrier) enemyScoring.push({ pieceId: carrier.id, action: 'Carrying our flag', points: -8000 });
    }

    // Pieces on flags
    const onEnemyFlag = ourPieces.filter(p => p.x === enemyFlag.x && p.y === enemyFlag.y);
    onEnemyFlag.forEach(p => ourScoring.push({ pieceId: p.id, action: 'On enemy flag', points: 3000 }));

    const onOurFlag = enemyPieces.filter(p => p.x === ourFlag.x && p.y === ourFlag.y);
    onOurFlag.forEach(p => enemyScoring.push({ pieceId: p.id, action: 'On our flag', points: -3000 }));

    // Safe zones
    const ourSafeZone = NO_GUARD_ZONES[side];
    const enemySafeZone = NO_GUARD_ZONES[side === 'A' ? 'B' : 'A'];

    if (bestMoveState.noGuardZoneActive[side === 'A' ? 'B' : 'A']) {
      const inEnemySafe = ourPieces.filter(p =>
        p.x >= enemySafeZone.minX && p.x <= enemySafeZone.maxX &&
        p.y >= enemySafeZone.minY && p.y <= enemySafeZone.maxY
      );
      inEnemySafe.forEach(p => ourScoring.push({ pieceId: p.id, action: 'In enemy safe zone', points: 1000 }));
    }

    if (bestMoveState.noGuardZoneActive[side]) {
      const inOurSafe = enemyPieces.filter(p =>
        p.x >= ourSafeZone.minX && p.x <= ourSafeZone.maxX &&
        p.y >= ourSafeZone.minY && p.y <= ourSafeZone.maxY
      );
      inOurSafe.forEach(p => enemyScoring.push({ pieceId: p.id, action: 'In our safe zone', points: -1000 }));
    }

    // Back wall
    const enemyBackWall = side === 'A' ? 0 : 10;
    const ourBackWall = side === 'A' ? 10 : 0;

    const onEnemyBack = ourPieces.filter(p => p.y === enemyBackWall);
    onEnemyBack.forEach(p => ourScoring.push({ pieceId: p.id, action: 'On enemy back wall', points: 500 }));

    const onOurBack = enemyPieces.filter(p => p.y === ourBackWall);
    onOurBack.forEach(p => enemyScoring.push({ pieceId: p.id, action: 'On our back wall', points: -500 }));

    // Flag defense - reward pieces that are between their flag and enemy pieces
    if (!ourFlag.carriedBy) {
      console.log(`🛡️ [FLAG DEFENSE DEBUG] Checking ${side} team defense`);
      console.log(`   Our flag at: (${ourFlag.x}, ${ourFlag.y})`);
      console.log(`   Our pieces:`, ourPieces.map(p => `P${p.id}:(${p.x},${p.y})`).join(', '));
      console.log(`   Enemy pieces:`, enemyPieces.map(p => `P${p.id}:(${p.x},${p.y})`).join(', '));

      ourPieces.forEach(defender => {
        // Check if defender is on same column as our flag
        if (defender.x === ourFlag.x) {
          console.log(`   ✓ P${defender.id} is on flag column (x=${ourFlag.x})`);
          // Check if any enemies are threatening from the other side
          const enemiesOnColumn = enemyPieces.filter(e => e.x === ourFlag.x);
          console.log(`   Enemies on column:`, enemiesOnColumn.map(e => `P${e.id}:(${e.x},${e.y})`).join(', ') || 'none');

          const isBetweenFlagAndEnemy = enemiesOnColumn.some(enemy => {
            // Defender is between flag and enemy if they're in the middle
            const condition1 = defender.y > ourFlag.y && enemy.y > defender.y;
            const condition2 = defender.y < ourFlag.y && enemy.y < defender.y;
            console.log(`   Checking P${defender.id}:(${defender.x},${defender.y}) vs enemy P${enemy.id}:(${enemy.x},${enemy.y})`);
            console.log(`     Condition1 (${defender.y} > ${ourFlag.y} && ${enemy.y} > ${defender.y}): ${condition1}`);
            console.log(`     Condition2 (${defender.y} < ${ourFlag.y} && ${enemy.y} < ${defender.y}): ${condition2}`);
            return condition1 || condition2;
          });

          if (isBetweenFlagAndEnemy) {
            console.log(`   ✅ P${defender.id} IS defending! Adding +300 points`);
            ourScoring.push({ pieceId: defender.id, action: 'Defending our flag', points: 300 });
          } else {
            console.log(`   ❌ P${defender.id} is NOT between flag and enemy`);
          }
        }
      });
    }

    if (!enemyFlag.carriedBy) {
      enemyPieces.forEach(defender => {
        // Check if defender is on same column as their flag
        if (defender.x === enemyFlag.x) {
          // Check if any of our pieces are threatening from the other side
          const ourPiecesOnColumn = ourPieces.filter(p => p.x === enemyFlag.x);
          const isBetweenFlagAndEnemy = ourPiecesOnColumn.some(attacker => {
            return (defender.y > enemyFlag.y && attacker.y > defender.y) ||
                   (defender.y < enemyFlag.y && attacker.y < defender.y);
          });
          if (isBetweenFlagAndEnemy) {
            enemyScoring.push({ pieceId: defender.id, action: 'Defending their flag', points: -300 });
          }
        }
      });
    }

    // Team totals
    const ourTotal = ourScoring.reduce((sum, s) => sum + s.points, 0);
    const enemyTotal = enemyScoring.reduce((sum, s) => sum + s.points, 0);

    const totalEvals = ourMoves.length * ENEMY_MOVE_SAMPLES;

    // CRITICAL: Assign based on which side AI is playing
    // enemyScoring has negative values (from AI perspective), need to flip for display
    // When AI is B (Red): ourScoring=Red actions, enemyScoring=Blue actions (need sign flip)
    // When AI is A (Blue): ourScoring=Blue actions, enemyScoring=Red actions (need sign flip)
    const blueScoring = side === 'A'
      ? ourScoring
      : enemyScoring.map(s => ({ ...s, points: -s.points }));  // Flip sign for display

    const redScoring = side === 'A'
      ? enemyScoring.map(s => ({ ...s, points: -s.points }))  // Flip sign for display
      : ourScoring;

    const blueTotal = side === 'A' ? ourTotal : -enemyTotal;  // Flip sign for display
    const redTotal = side === 'A' ? -enemyTotal : ourTotal;   // Flip sign for display
    const blueAlive = side === 'A' ? ourPieces.length : enemyPieces.length;
    const redAlive = side === 'A' ? enemyPieces.length : ourPieces.length;

    const analysis: import('../../game/types.js').AIAnalysis = {
      executionTime: elapsedTime,
      scenariosEvaluated: totalEvals,
      worstCaseScore: bestWorstScore,
      similarMoves: topMoves.length,
      chosenMoves: commands,  // The actual moves AI chose this round
      predictedEnemyMoves: predictedEnemyCommands,  // What AI thought enemy would do
      blueTeam: {
        teamName: 'Blue',
        alivePieces: blueAlive,
        scoringPieces: blueScoring,
        totalPoints: blueTotal
      },
      redTeam: {
        teamName: 'Red',
        alivePieces: redAlive,
        scoringPieces: redScoring,
        totalPoints: redTotal
      },
      finalScore: breakdown.total
    };

    // DEBUG: Log analysis data
    console.log('📊 AI Analysis Generated:', JSON.stringify({
      ourSide: side,
      ourScoringCount: ourScoring.length,
      enemyScoringCount: enemyScoring.length,
      ourTotal,
      enemyTotal,
      finalScore: breakdown.total,
      blueScoring: analysis.blueTeam.scoringPieces,
      redScoring: analysis.redTeam.scoringPieces
    }, null, 2));

    return {
      commands,
      reasoning: `Minimax AI (${elapsedTime}ms, ${totalEvals} scenarios evaluated)`,
      analysis,
      prompt: undefined
    };
  }

  /**
   * Get scoring rules text for display
   */
  private getScoringRulesText(): string {
    return `📊 Minimax AI Scoring Rules:

🏆 Win/Loss: ±100,000 points

🚩 Flag Carrier Scoring:
  • We have their flag: +500
  • We have clear path home: +5,000 (can score next turn!)
  • They have our flag: -500
  • They have clear path home: -5,000 (they can score!)

⚔️ Flag Attack Paths:
  • Each piece with clear shot to enemy flag: +2,000
  • Each enemy with clear shot to our flag: -2,000

👥 Piece Count:
  • Each piece advantage: ±100

🎯 Strategic Positioning:
  • Each piece on enemy's back wall (their flag row): +500

🛡️ Active Defense (only when threats exist):
  • Our defenders (when enemy threatens our flag): +300 each
  • Enemy defenders (when we threaten their flag): -300 each

⚠️ Collision Avoidance (when no threat to our flag):
  • Lining up with enemy in their territory: -200 per piece

📈 Offensive Pressure (when no clear shots available):
  • Each piece in enemy territory: +50`;
  }

  // ============================================================================
  // Minimax Core Functions
  // ============================================================================

  /**
   * Create a child node by applying a move to the parent state
   */
  private createChildNode(
    parent: Node<MinimaxGameState, CombinedMove, undefined>,
    move: CombinedMove,
    ourSide: 'A' | 'B'
  ): Node<MinimaxGameState, CombinedMove, undefined> {
    // Clone parent state
    const newState = this.cloneGameState(parent.gamestate);

    // Apply the move
    this.applyMove(newState, move, newState.currentPlayer);

    // Switch player
    newState.currentPlayer = newState.currentPlayer === 'A' ? 'B' : 'A';
    newState.round++;

    // Generate moves for next player
    const nextMoves = this.generateAllMoveCombinations(newState, newState.currentPlayer);

    // Determine node type
    const isLeaf = newState.gameStatus === 'finished' || nextMoves.length === 0;
    const nodeType = isLeaf ? NodeType.LEAF : NodeType.INNER;

    // For Negamax, NodeAim is automatically handled - we don't need to set it
    // The algorithm will flip signs based on depth

    return new Node<MinimaxGameState, CombinedMove, undefined>(
      nodeType,
      newState,
      move,
      undefined, // No extra data
      NodeAim.NONE, // Negamax handles this automatically
      nextMoves
    );
  }

  /**
   * Evaluate a game state from our perspective
   * Positive = good for us, Negative = good for opponent
   */
  /**
   * Evaluate game state - uses centralized ScoreEvaluator
   */
  private evaluateGameState(state: MinimaxGameState, ourSide: 'A' | 'B'): number {
    // Cast MinimaxGameState to CommanderGameState (they have the same structure)
    return evaluateGameState(state as any as CommanderGameState, ourSide).total;
  }

  /**
   * Get detailed score breakdown - uses centralized ScoreEvaluator
   */
  private getScoreBreakdown(state: MinimaxGameState, ourSide: 'A' | 'B'): ScoreBreakdown {
    // Cast MinimaxGameState to CommanderGameState (they have the same structure)
    return evaluateGameState(state as any as CommanderGameState, ourSide);
  }

  // ============================================================================
  // Move Generation
  // ============================================================================

  /**
   * Generate all valid move combinations for all 3 pieces
   * Each piece can move in 4 directions × 3 distances + stay = ~13 moves per piece
   * Total: ~13^3 = ~2200 combinations (manageable!)
   */
  private generateAllMoveCombinations(state: MinimaxGameState, player: 'A' | 'B'): CombinedMove[] {
    const pieces = state.players[player].pieces.filter(p => p.alive);

    if (pieces.length === 0) return [];

    // Generate all valid moves for each piece
    const piece1Moves = this.generateMovesForPiece(pieces[0], state, player);
    const piece2Moves = pieces[1] ? this.generateMovesForPiece(pieces[1], state, player) : [this.stayMove(pieces[0])];
    const piece3Moves = pieces[2] ? this.generateMovesForPiece(pieces[2], state, player) : [this.stayMove(pieces[0])];

    // Generate all combinations
    const combinations: CombinedMove[] = [];

    for (const move1 of piece1Moves) {
      for (const move2 of piece2Moves) {
        for (const move3 of piece3Moves) {
          combinations.push({
            piece1: move1,
            piece2: move2,
            piece3: move3
          });
        }
      }
    }

    return combinations;
  }

  /**
   * Generate N random UNIQUE move combinations (for Monte Carlo sampling)
   * Uses hash set to guarantee no duplicates
   */
  private generateRandomMoves(state: MinimaxGameState, player: 'A' | 'B', count: number): CombinedMove[] {
    const pieces = state.players[player].pieces.filter(p => p.alive);
    if (pieces.length === 0) return [];

    const seen = new Set<string>();
    const combinations: CombinedMove[] = [];

    // Keep generating until we have enough unique moves
    // Safety: max 10x attempts to avoid infinite loop if count > total possible moves
    const maxAttempts = count * 10;
    let attempts = 0;

    while (combinations.length < count && attempts < maxAttempts) {
      attempts++;

      const move: CombinedMove = {
        piece1: this.generateRandomMoveForPiece(pieces[0], state, player),
        piece2: pieces[1] ? this.generateRandomMoveForPiece(pieces[1], state, player) : this.stayMove(pieces[0]),
        piece3: pieces[2] ? this.generateRandomMoveForPiece(pieces[2], state, player) : this.stayMove(pieces[0])
      };

      const hash = this.hashMove(move);

      if (!seen.has(hash)) {
        seen.add(hash);
        combinations.push(move);
      }
    }

    return combinations;
  }

  /**
   * Hash a move combination to detect duplicates
   */
  private hashMove(move: CombinedMove): string {
    return `${move.piece1.pieceId}:${move.piece1.direction}:${move.piece1.distance},` +
           `${move.piece2.pieceId}:${move.piece2.direction}:${move.piece2.distance},` +
           `${move.piece3.pieceId}:${move.piece3.direction}:${move.piece3.distance}`;
  }

  /**
   * Generate a random valid move for a single piece
   */
  private generateRandomMoveForPiece(piece: Piece, state: MinimaxGameState, player: 'A' | 'B'): Movement {
    // Calculate max distance in each direction
    const maxDistances = {
      up: this.getMaxDistance(piece, 'up', player, state),
      down: this.getMaxDistance(piece, 'down', player, state),
      left: this.getMaxDistance(piece, 'left', player, state),
      right: this.getMaxDistance(piece, 'right', player, state)
    };

    // Build list of valid moves (including stay)
    const validMoves: Movement[] = [];

    // Add stay move
    validMoves.push({ pieceId: piece.id, direction: 'up', distance: 0 });

    // Add all possible moves in each direction
    for (const [direction, maxDist] of Object.entries(maxDistances)) {
      for (let distance = 1; distance <= maxDist; distance++) {
        validMoves.push({
          pieceId: piece.id,
          direction: direction as 'up' | 'down' | 'left' | 'right',
          distance
        });
      }
    }

    // Pick random move from valid moves
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  /**
   * Generate all valid moves for a single piece
   * SMART: Calculate max possible distance in each direction based on position and obstacles
   */
  private generateMovesForPiece(piece: Piece, state: MinimaxGameState, player: 'A' | 'B'): Movement[] {
    const moves: Movement[] = [];

    // Add "stay in place" move
    moves.push({ pieceId: piece.id, direction: 'up', distance: 0 });

    // Calculate max distance in each direction
    const maxDistances = {
      up: this.getMaxDistance(piece, 'up', player, state),
      down: this.getMaxDistance(piece, 'down', player, state),
      left: this.getMaxDistance(piece, 'left', player, state),
      right: this.getMaxDistance(piece, 'right', player, state)
    };

    // Generate moves for each direction
    for (const [direction, maxDist] of Object.entries(maxDistances)) {
      for (let distance = 1; distance <= maxDist; distance++) {
        moves.push({
          pieceId: piece.id,
          direction: direction as 'up' | 'down' | 'left' | 'right',
          distance
        });
      }
    }

    return moves;
  }

  /**
   * Calculate maximum distance a piece can move in a given direction
   * Considers: board boundaries, no-guard zones
   */
  private getMaxDistance(
    piece: Piece,
    direction: 'up' | 'down' | 'left' | 'right',
    player: 'A' | 'B',
    state: MinimaxGameState
  ): number {
    let x = piece.x;
    let y = piece.y;
    let maxDist = 0;
    const MAX_MOVE_DISTANCE = 10; // Full board distance - engine handles boundary clamping

    for (let dist = 1; dist <= MAX_MOVE_DISTANCE; dist++) {
      // Calculate next position
      let nextX = x;
      let nextY = y;

      switch (direction) {
        case 'up': nextY = y - dist; break;
        case 'down': nextY = y + dist; break;
        case 'left': nextX = x - dist; break;
        case 'right': nextX = x + dist; break;
      }

      // Check board boundaries
      if (nextX < 0 || nextX > 10 || nextY < 0 || nextY > 10) {
        break;
      }

      // Check no-guard zone
      if (state.noGuardZoneActive[player] && this.isInNoGuardZone(nextX, nextY, player)) {
        break;
      }

      // Valid distance found
      maxDist = dist;
    }

    return maxDist;
  }

  /**
   * Create a "stay in place" move
   */
  private stayMove(piece: Piece): Movement {
    return { pieceId: piece.id, direction: 'up', distance: 0 };
  }

  /**
   * Check if position is in team's no-guard zone
   */
  private isInNoGuardZone(x: number, y: number, team: 'A' | 'B'): boolean {
    const zone = NO_GUARD_ZONES[team];
    return x >= zone.minX && x <= zone.maxX && y >= zone.minY && y <= zone.maxY;
  }

  // ============================================================================
  // Game State Manipulation
  // ============================================================================

  /**
   * Apply simultaneous moves for BOTH players to the game state (mutates state)
   */
  private applySimultaneousMoves(state: MinimaxGameState, ourMove: CombinedMove, enemyMove: CombinedMove, ourSide: 'A' | 'B'): void {
    const enemySide = ourSide === 'A' ? 'B' : 'A';

    // Convert to full game state format temporarily for processing
    const tempGameState = this.convertToFullGameState(state);

    // Build movement commands for BOTH players
    const commands = {
      playerA: ourSide === 'A' ? [ourMove.piece1, ourMove.piece2, ourMove.piece3] : [enemyMove.piece1, enemyMove.piece2, enemyMove.piece3],
      playerB: ourSide === 'B' ? [ourMove.piece1, ourMove.piece2, ourMove.piece3] : [enemyMove.piece1, enemyMove.piece2, enemyMove.piece3]
    };

    // Execute movements
    const paths = this.commandProcessor.executeMovements(tempGameState, commands);

    // Detect collisions
    const collisions = this.collisionDetector.detectCollisions(paths);

    // Apply final positions
    this.commandProcessor.applyFinalPositions(tempGameState, paths);

    // Resolve collisions (tagging)
    this.collisionDetector.resolveCollisions(
      tempGameState,
      collisions,
      (gs, p, pieceId) => this.flagManager.onPieceCaptured(gs as any, p, pieceId)
    );

    // Check flag interactions
    this.flagManager.checkFlagInteractions(tempGameState as any);

    // Copy changes back to minimax state
    this.copyGameStateChanges(tempGameState, state);
  }

  /**
   * Clone a minimax game state (deep copy)
   */
  private cloneGameState(state: MinimaxGameState): MinimaxGameState {
    return {
      round: state.round,
      currentPlayer: state.currentPlayer,
      players: {
        A: {
          pieces: state.players.A.pieces.map(p => ({ ...p })),
          jailedPieces: [...state.players.A.jailedPieces]
        },
        B: {
          pieces: state.players.B.pieces.map(p => ({ ...p })),
          jailedPieces: [...state.players.B.jailedPieces]
        }
      },
      flags: {
        A: { ...state.flags.A, carriedBy: state.flags.A.carriedBy ? { ...state.flags.A.carriedBy } : null },
        B: { ...state.flags.B, carriedBy: state.flags.B.carriedBy ? { ...state.flags.B.carriedBy } : null }
      },
      rescueKeys: {
        A: state.rescueKeys.A ? { ...state.rescueKeys.A } : null,
        B: state.rescueKeys.B ? { ...state.rescueKeys.B } : null
      },
      noGuardZoneActive: { ...state.noGuardZoneActive },
      gameStatus: state.gameStatus,
      winner: state.winner
    };
  }

  /**
   * Convert full CommanderGameState to MinimaxGameState
   */
  private convertToMinimaxState(fullState: CommanderGameState, currentPlayer: 'A' | 'B'): MinimaxGameState {
    return {
      round: fullState.round,
      currentPlayer,
      players: {
        A: {
          pieces: fullState.players.A?.pieces.map(p => ({ ...p })) || [],
          jailedPieces: fullState.players.A?.jailedPieces || []
        },
        B: {
          pieces: fullState.players.B?.pieces.map(p => ({ ...p })) || [],
          jailedPieces: fullState.players.B?.jailedPieces || []
        }
      },
      flags: {
        A: { ...fullState.flags.A },
        B: { ...fullState.flags.B }
      },
      rescueKeys: {
        A: fullState.rescueKeys.A ? { ...fullState.rescueKeys.A } : null,
        B: fullState.rescueKeys.B ? { ...fullState.rescueKeys.B } : null
      },
      noGuardZoneActive: fullState.noGuardZoneActive || { A: true, B: true },
      gameStatus: fullState.gameStatus,
      winner: fullState.winner
    };
  }

  /**
   * Convert MinimaxGameState to CommanderGameState (for processing)
   */
  private convertToFullGameState(minimaxState: MinimaxGameState): CommanderGameState {
    return {
      round: minimaxState.round,
      players: {
        A: minimaxState.players.A.pieces.length > 0 ? {
          id: 'player-a',
          player: { type: 'local', id: 'player-a', side: 'A' } as any,
          pieces: minimaxState.players.A.pieces,
          jailedPieces: minimaxState.players.A.jailedPieces
        } : null,
        B: minimaxState.players.B.pieces.length > 0 ? {
          id: 'player-b',
          player: { type: 'local', id: 'player-b', side: 'B' } as any,
          pieces: minimaxState.players.B.pieces,
          jailedPieces: minimaxState.players.B.jailedPieces
        } : null
      },
      commandQueue: {},
      rescueKeys: minimaxState.rescueKeys,
      flags: minimaxState.flags,
      noGuardZoneActive: minimaxState.noGuardZoneActive,
      noGuardZoneBounds: {
        A: { minX: 4, maxX: 6, minY: 9, maxY: 10 },
        B: { minX: 4, maxX: 6, minY: 0, maxY: 1 }
      },
      gameStatus: minimaxState.gameStatus,
      winner: minimaxState.winner,
      nextTickIn: 3,
      lastRoundTime: Date.now()
    };
  }

  /**
   * Copy changes from full game state back to minimax state
   */
  private copyGameStateChanges(source: CommanderGameState, target: MinimaxGameState): void {
    // Update pieces
    if (source.players.A) {
      target.players.A.pieces = source.players.A.pieces.map(p => ({ ...p }));
      target.players.A.jailedPieces = [...source.players.A.jailedPieces];
    }
    if (source.players.B) {
      target.players.B.pieces = source.players.B.pieces.map(p => ({ ...p }));
      target.players.B.jailedPieces = [...source.players.B.jailedPieces];
    }

    // Update flags
    target.flags = {
      A: { ...source.flags.A },
      B: { ...source.flags.B }
    };

    // Update game status
    target.gameStatus = source.gameStatus;
    target.winner = source.winner;
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Get Manhattan distance from piece to target position
   */
  private manhattanDistance(from: { x: number; y: number }, to: { x: number; y: number }): number {
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
  }

  /**
   * Get distance from piece to their own territory
   */
  private getDistanceToTerritory(piece: Piece, team: 'A' | 'B'): number {
    const territory = TERRITORY[team];

    if (piece.y >= territory.min && piece.y <= territory.max) {
      return 0; // Already in territory
    }

    if (team === 'A') {
      return territory.min - piece.y; // Distance to row 6
    } else {
      return piece.y - territory.max; // Distance to row 4
    }
  }

  /**
   * Get closest piece distance to a target
   */
  private getClosestPieceDistance(pieces: Piece[], target: { x: number; y: number }): number {
    const alivePieces = pieces.filter(p => p.alive);
    if (alivePieces.length === 0) return 999;

    return Math.min(...alivePieces.map(p => this.manhattanDistance(p, target)));
  }

  /**
   * Check if piece is in a territory
   */
  private isInTerritory(piece: Piece, team: 'A' | 'B'): boolean {
    const territory = TERRITORY[team];
    return piece.y >= territory.min && piece.y <= territory.max;
  }

  /**
   * Check if piece has clear path to enemy flag (same column, no enemy pieces blocking)
   */
  private hasClearPathToFlag(
    piece: Piece,
    targetFlag: { x: number; y: number },
    state: MinimaxGameState,
    flagOwner: 'A' | 'B'
  ): boolean {
    // Must be in same column as flag
    if (piece.x !== targetFlag.x) return false;

    // Check if any enemy pieces are between this piece and the flag
    const enemyPieces = state.players[flagOwner].pieces.filter(p => p.alive);

    const minY = Math.min(piece.y, targetFlag.y);
    const maxY = Math.max(piece.y, targetFlag.y);

    for (const enemy of enemyPieces) {
      // Enemy is in same column and between piece and flag
      if (enemy.x === piece.x && enemy.y > minY && enemy.y < maxY) {
        return false; // Blocked!
      }
    }

    return true; // Clear path!
  }

  /**
   * Check if flag carrier has clear path to their home territory (can score)
   */
  private hasClearPathToTerritory(
    carrier: Piece,
    carrierTeam: 'A' | 'B',
    state: MinimaxGameState
  ): boolean {
    const enemyTeam = carrierTeam === 'A' ? 'B' : 'A';
    const territory = TERRITORY[carrierTeam];

    // Already in home territory - can score!
    if (this.isInTerritory(carrier, carrierTeam)) {
      return true;
    }

    // Check if any enemy pieces are blocking the path in the same column
    const enemyPieces = state.players[enemyTeam].pieces.filter(p => p.alive);

    // For team A (rows 6-10), check enemies between carrier.y and row 6 (inclusive)
    // For team B (rows 0-4), check enemies between carrier.y and row 4 (inclusive)
    if (carrierTeam === 'A') {
      // Heading north to rows 6-10
      for (const enemy of enemyPieces) {
        // Enemy blocks if same column and between current position and territory entrance (inclusive)
        if (enemy.x === carrier.x && enemy.y > carrier.y && enemy.y <= territory.min) {
          return false; // Blocked!
        }
      }
    } else {
      // Heading south to rows 0-4
      for (const enemy of enemyPieces) {
        // Enemy blocks if same column and between current position and territory entrance (inclusive)
        if (enemy.x === carrier.x && enemy.y < carrier.y && enemy.y >= territory.max) {
          return false; // Blocked!
        }
      }
    }

    return true; // Clear path home!
  }
}

// Export singleton instance
export const MinimaxAI = new MinimaxStrategy();
