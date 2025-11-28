/**
 * CollisionDetector
 * Handles collision detection and resolution for piece movements
 */

import type { CommanderGameState } from './types';
import type { PiecePath } from './CommandProcessor';

export interface Collision {
  player: 'A' | 'B';
  pieceId: number;
  x: number;
  y: number;
}

export class CollisionDetector {
  /**
   * Detect all collisions from piece paths
   * Returns list of pieces involved in collisions
   */
  detectCollisions(allPaths: PiecePath[]): Collision[] {
    const collisions: Collision[] = [];

    // Disabled verbose logging for minimax performance
    // console.log(`🔍 Collision detection: checking ${allPaths.length} moving pieces`);
    // allPaths.forEach((p, idx) => {
    //   console.log(`  Path ${idx}: Player ${p.player} Piece ${p.pieceId}, ${p.path.length} steps, final: (${p.finalPosition.x},${p.finalPosition.y})`);
    // });

    // Check for same-cell collisions (two pieces occupy same cell at same step)
    for (let i = 0; i < allPaths.length; i++) {
      for (let j = i + 1; j < allPaths.length; j++) {
        const pathA = allPaths[i];
        const pathB = allPaths[j];
        // console.log(`  🔎 Checking collision between ${pathA.player}P${pathA.pieceId} and ${pathB.player}P${pathB.pieceId}`);

        // Check each step
        const maxSteps = Math.max(pathA.path.length, pathB.path.length);
        // console.log(`    MaxSteps: ${maxSteps} (A has ${pathA.path.length}, B has ${pathB.path.length})`);
        for (let step = 0; step < maxSteps; step++) {
          // Get position at this step (or final position if movement already completed)
          const posA = pathA.path[step] || pathA.finalPosition;
          const posB = pathB.path[step] || pathB.finalPosition;
          // console.log(`    Step ${step}: A at (${posA.x},${posA.y}) vs B at (${posB.x},${posB.y})`);

          if (posA.x === posB.x && posA.y === posB.y) {
            // console.log(`💥 Collision detected at step ${step}: ${pathA.player} Piece ${pathA.pieceId} and ${pathB.player} Piece ${pathB.pieceId} at (${posA.x},${posA.y})`);

            // Only add if not already recorded
            if (!collisions.find(c => c.player === pathA.player && c.pieceId === pathA.pieceId)) {
              collisions.push({ player: pathA.player, pieceId: pathA.pieceId, x: posA.x, y: posA.y });
            }
            if (!collisions.find(c => c.player === pathB.player && c.pieceId === pathB.pieceId)) {
              collisions.push({ player: pathB.player, pieceId: pathB.pieceId, x: posB.x, y: posB.y });
            }
            break; // Stop checking this pair after first collision
          }
        }
      }
    }

    // Check for head-on collisions (cell swaps)
    for (let i = 0; i < allPaths.length; i++) {
      for (let j = i + 1; j < allPaths.length; j++) {
        const pathA = allPaths[i];
        const pathB = allPaths[j];

        // Check if they swap positions at any step
        for (let step = 0; step < Math.min(pathA.path.length, pathB.path.length) - 1; step++) {
          const currentA = pathA.path[step];
          const nextA = pathA.path[step + 1];
          const currentB = pathB.path[step];
          const nextB = pathB.path[step + 1];

          // Head-on: A moves from (x1,y1) to (x2,y2) while B moves from (x2,y2) to (x1,y1)
          if (currentA.x === nextB.x && currentA.y === nextB.y &&
              currentB.x === nextA.x && currentB.y === nextA.y) {
            // console.log(`🔄 Head-on collision at step ${step}: ${pathA.player} Piece ${pathA.pieceId} and ${pathB.player} Piece ${pathB.pieceId} swapping cells`);

            // Add both pieces to collision list
            if (!collisions.find(c => c.player === pathA.player && c.pieceId === pathA.pieceId)) {
              collisions.push({ player: pathA.player, pieceId: pathA.pieceId, x: nextA.x, y: nextA.y });
            }
            if (!collisions.find(c => c.player === pathB.player && c.pieceId === pathB.pieceId)) {
              collisions.push({ player: pathB.player, pieceId: pathB.pieceId, x: nextB.x, y: nextB.y });
            }
            break;
          }
        }
      }
    }

    return collisions;
  }

  /**
   * Resolve collisions by applying territory-based tagging rules
   * Returns FlagManager for flag drop handling
   */
  resolveCollisions(
    gameState: CommanderGameState,
    collisions: Collision[],
    onPieceCaptured: (gameState: CommanderGameState, player: 'A' | 'B', pieceId: number) => void
  ): void {
    collisions.forEach(collision => {
      const playerData = gameState.players[collision.player];
      const piece = playerData?.pieces.find(p => p.id === collision.pieceId);
      if (!piece || !playerData) return;

      // Determine territory (A: rows 6-10, B: rows 0-4, Neutral: row 5)
      let territory: 'A' | 'B' | 'neutral';
      if (collision.y >= 6) territory = 'A';
      else if (collision.y <= 4) territory = 'B';
      else territory = 'neutral';

      // Check if opponent is also in collision (for same-team check)
      const opponentPlayer = collision.player === 'A' ? 'B' : 'A';
      const hasOpponentCollision = collisions.find(
        c => c.player === opponentPlayer && c.x === collision.x && c.y === collision.y
      );

      if (!hasOpponentCollision) {
        // Same team collision - pieces stay where they are
        // console.log(`🔵🔵 Same team collision for ${collision.player} Piece ${collision.pieceId} - no jail`);
        return;
      }

      // Enemy collision - apply jail rules
      if (territory === 'neutral') {
        // console.log(`⚖️ Neutral zone - ${collision.player} Piece ${collision.pieceId} goes to jail`);
        piece.alive = false;
        playerData.jailedPieces.push(collision.pieceId);
        onPieceCaptured(gameState, collision.player, collision.pieceId);
      } else if (territory !== collision.player) {
        // console.log(`⚔️ ${collision.player} Piece ${collision.pieceId} tagged in enemy territory - goes to jail`);
        piece.alive = false;
        playerData.jailedPieces.push(collision.pieceId);
        onPieceCaptured(gameState, collision.player, collision.pieceId);
      } else {
        // console.log(`🛡️ ${collision.player} Piece ${collision.pieceId} defending in own territory - safe`);
      }
    });
  }
}
