/**
 * GameEngine
 * Orchestrates round execution and game loop logic
 */

import type { CommanderGameState, Movement } from './types';
import { CommandProcessor, type PiecePath } from './CommandProcessor.js';
import { CollisionDetector } from './CollisionDetector.js';
import { FlagManager } from './FlagManager.js';

export class GameEngine {
  private commandProcessor: CommandProcessor = new CommandProcessor();
  private collisionDetector: CollisionDetector = new CollisionDetector();
  private flagManager: FlagManager = new FlagManager();

  /**
   * Execute a single round of the game
   * Returns updated game state
   */
  executeRound(
    gameState: CommanderGameState,
    roundCommands: { playerA: Movement[]; playerB: Movement[] }
  ): void {
    console.log(`🎮 Executing round ${gameState.round}`);

    // 1. Execute movements and get paths
    const allPaths = this.commandProcessor.executeMovements(gameState, roundCommands);

    // 2. Detect collisions
    const collisions = this.collisionDetector.detectCollisions(allPaths);

    // 3. Apply final positions
    this.commandProcessor.applyFinalPositions(gameState, allPaths);

    // 4. Resolve collisions (jail pieces)
    this.collisionDetector.resolveCollisions(
      gameState,
      collisions,
      this.flagManager.onPieceCaptured.bind(this.flagManager)
    );

    // 5. Handle flag and rescue key interactions
    this.flagManager.checkFlagInteractions(gameState);

    // 6. Check win condition
    this.checkWinCondition(gameState);

    // 8. Increment round
    gameState.round++;
    gameState.lastRoundTime = Date.now();

    console.log(`✅ Round ${gameState.round - 1} executed successfully`);
  }

  /**
   * Check if either team has won
   */
  private checkWinCondition(gameState: CommanderGameState): void {
    // Player A (Blue) wins if they bring Red flag to Blue territory (rows 6-10)
    if (gameState.flags.B.carriedBy?.player === 'A') {
      const carrier = gameState.players.A?.pieces.find(
        p => p.id === gameState.flags.B.carriedBy?.pieceId
      );
      if (carrier && carrier.y >= 6) {
        gameState.gameStatus = 'finished';
        gameState.winner = 'A';
        console.log(`🏆 Player A (Blue) wins! Brought Red flag to Blue territory`);
      }
    }

    // Player B (Red) wins if they bring Blue flag to Red territory (rows 0-4)
    if (gameState.flags.A.carriedBy?.player === 'B') {
      const carrier = gameState.players.B?.pieces.find(
        p => p.id === gameState.flags.A.carriedBy?.pieceId
      );
      if (carrier && carrier.y <= 4) {
        gameState.gameStatus = 'finished';
        gameState.winner = 'B';
        console.log(`🏆 Player B (Red) wins! Brought Blue flag to Red territory`);
      }
    }
  }
}
