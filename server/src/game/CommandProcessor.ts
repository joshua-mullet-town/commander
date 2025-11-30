/**
 * CommandProcessor
 * Handles movement command execution and validation
 */

import type { CommanderGameState, Movement, Piece } from './types';
import { BOARD_WIDTH, BOARD_HEIGHT, NO_GUARD_ZONES } from './constants.js';

interface PiecePath {
  player: 'A' | 'B';
  pieceId: number;
  path: { x: number; y: number; step: number }[];
  finalPosition: { x: number; y: number };
}

export class CommandProcessor {
  /**
   * Execute movement commands for both players simultaneously
   * Returns paths of all pieces for collision detection
   */
  executeMovements(
    gameState: CommanderGameState,
    commands: { playerA: Movement[]; playerB: Movement[] }
  ): PiecePath[] {
    const allPaths: PiecePath[] = [];

    // Determine max distance across all commands
    const maxDistance = Math.max(
      ...commands.playerA.map(m => m.distance),
      ...commands.playerB.map(m => m.distance),
      1 // Ensure at least 1 step
    );

    // Player A - build paths for all alive pieces
    gameState.players.A?.pieces.forEach(piece => {
      if (!piece.alive) return;

      const moveCommand = commands.playerA.find(cmd => cmd.pieceId === piece.id);

      if (moveCommand) {
        // Piece is moving - calculate path
        const path = this.calculatePath(
          piece.x,
          piece.y,
          moveCommand.direction,
          moveCommand.distance,
          'A',
          gameState,
          piece.id
        );
        allPaths.push({
          player: 'A',
          pieceId: piece.id,
          path,
          finalPosition: path[path.length - 1]
        });
      } else {
        // Piece is stationary - create stationary path
        const stationaryPath = Array.from({ length: maxDistance + 1 }, (_, step) => ({
          x: piece.x,
          y: piece.y,
          step
        }));
        allPaths.push({
          player: 'A',
          pieceId: piece.id,
          path: stationaryPath,
          finalPosition: { x: piece.x, y: piece.y }
        });
      }
    });

    // Player B - build paths for all alive pieces
    gameState.players.B?.pieces.forEach(piece => {
      if (!piece.alive) return;

      const moveCommand = commands.playerB.find(cmd => cmd.pieceId === piece.id);

      if (moveCommand) {
        // Piece is moving - calculate path
        const path = this.calculatePath(
          piece.x,
          piece.y,
          moveCommand.direction,
          moveCommand.distance,
          'B',
          gameState,
          piece.id
        );
        allPaths.push({
          player: 'B',
          pieceId: piece.id,
          path,
          finalPosition: path[path.length - 1]
        });
      } else {
        // Piece is stationary - create stationary path
        const stationaryPath = Array.from({ length: maxDistance + 1 }, (_, step) => ({
          x: piece.x,
          y: piece.y,
          step
        }));
        allPaths.push({
          player: 'B',
          pieceId: piece.id,
          path: stationaryPath,
          finalPosition: { x: piece.x, y: piece.y }
        });
      }
    });

    return allPaths;
  }

  /**
   * Apply final positions to pieces after collision resolution
   */
  applyFinalPositions(
    gameState: CommanderGameState,
    paths: PiecePath[]
  ): void {
    paths.forEach(path => {
      const playerState = gameState.players[path.player];
      const piece = playerState?.pieces.find(p => p.id === path.pieceId);

      if (piece && piece.alive) {
        piece.x = path.finalPosition.x;
        piece.y = path.finalPosition.y;
      }
    });
  }

  /**
   * Calculate full path for a piece movement
   * Respects board boundaries and no-guard zones
   */
  private calculatePath(
    startX: number,
    startY: number,
    direction: 'up' | 'down' | 'left' | 'right',
    distance: number,
    player: 'A' | 'B',
    gameState: CommanderGameState,
    pieceId: number
  ): { x: number; y: number; step: number }[] {
    // 🐛 DEBUG: Log specific problematic move
    if (player === 'A' && pieceId === 1 && direction === 'up' && distance === 8 && startX === 3 && startY === 8) {
      console.log(`🐛 DEBUG: Blue P1 calculating path from (3,8) up 8`);
    }

    const path: { x: number; y: number; step: number }[] = [
      { x: startX, y: startY, step: 0 }
    ];

    let stepX = 0;
    let stepY = 0;
    switch (direction) {
      case 'up':
        stepY = 1; // Move toward y=10 (top/Blue side)
        break;
      case 'down':
        stepY = -1; // Move toward y=0 (bottom/Red side)
        break;
      case 'left':
        stepX = -1;
        break;
      case 'right':
        stepX = 1;
        break;
    }

    let currentX = startX;
    let currentY = startY;

    for (let step = 1; step <= distance; step++) {
      const nextX = currentX + stepX;
      const nextY = currentY + stepY;

      // Stop at board boundaries (use dynamic board size)
      if (nextX < 0 || nextX >= BOARD_WIDTH || nextY < 0 || nextY >= BOARD_HEIGHT) {
        console.log(`🚫 ${player} P${pieceId} STOPPED at boundary: would go to (${nextX},${nextY}) - board size ${BOARD_WIDTH}x${BOARD_HEIGHT}`);
        break;
      }

      // Stop at OWN no-guard zone boundary if zone is active
      // Note: This prevents defenders from camping too close to their own flag
      // EXCEPTION: Pieces carrying the enemy flag CAN enter to score!
      if (gameState.noGuardZoneActive) {
        const zoneActive = gameState.noGuardZoneActive[player];
        const enemySide = player === 'A' ? 'B' : 'A';
        const enemyFlag = gameState.flags[enemySide];

        // Check if this piece is carrying the enemy flag
        const pieceCarryingEnemyFlag = enemyFlag.carriedBy?.player === player &&
                                        enemyFlag.carriedBy?.pieceId === pieceId;

        // Block entry UNLESS carrying enemy flag
        if (zoneActive && this.isInNoGuardZone(nextX, nextY, player) && !pieceCarryingEnemyFlag) {
          console.log(`🚫 ${player} P${pieceId} STOPPED at no-guard zone: would go to (${nextX},${nextY})`);
          break;
        }
      }

      currentX = nextX;
      currentY = nextY;
      path.push({ x: currentX, y: currentY, step });
    }

    // 🐛 DEBUG: Log final path for problematic move
    if (player === 'A' && pieceId === 1 && direction === 'up' && distance === 8 && path[0].x === 3 && path[0].y === 8) {
      console.log(`🐛 DEBUG: Blue P1 final path:`, path);
      console.log(`🐛 DEBUG: Final position: (${currentX},${currentY})`);
    }

    return path;
  }

  /**
   * Check if a position is in a team's no-guard zone
   */
  private isInNoGuardZone(x: number, y: number, team: 'A' | 'B'): boolean {
    const zone = NO_GUARD_ZONES[team];
    return x >= zone.minX && x <= zone.maxX && y >= zone.minY && y <= zone.maxY;
  }
}

// Export type for other modules
export type { PiecePath };
