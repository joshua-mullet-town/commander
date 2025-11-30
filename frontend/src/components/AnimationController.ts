import type { GamePiece, GameState, Movement } from '../types/game';

/**
 * AnimationController
 * Handles all piece movement animations in the battle arena
 */
export class AnimationController {
  private container: HTMLElement;
  private currentMoves: { playerA: Movement[]; playerB: Movement[] } | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    console.log('✅ AnimationController initialized - refactored code is running!');
  }

  /**
   * Set the movement commands for the current round (used for step-by-step animation)
   */
  setCurrentMoves(moves: { playerA: Movement[]; playerB: Movement[] }): void {
    this.currentMoves = moves;
  }

  /**
   * Animate pieces that moved between two game states
   */
  animateMovingPieces(prevState: GameState, newState: GameState): void {
    const animationLayer = this.container.querySelector('#animationLayer');
    if (!animationLayer) return;

    // Check Player A pieces
    if (prevState.players.A && newState.players.A) {
      prevState.players.A.pieces.forEach(prevPiece => {
        const newPiece = newState.players.A!.pieces.find(p => p.id === prevPiece.id);
        if (!newPiece) return;

        // Find the movement command for this piece
        const moveCommand = this.currentMoves?.playerA.find(m => m.pieceId === prevPiece.id);

        // Piece moved and is still alive
        if (prevPiece.alive && newPiece.alive && (prevPiece.x !== newPiece.x || prevPiece.y !== newPiece.y)) {
          this.createSteppedAnimation(prevPiece, newPiece, 'A', animationLayer, false, newState, moveCommand);
        }
        // Piece was alive, moved, and got jailed
        else if (prevPiece.alive && !newPiece.alive && (prevPiece.x !== newPiece.x || prevPiece.y !== newPiece.y)) {
          this.createSteppedAnimation(prevPiece, newPiece, 'A', animationLayer, true, newState, moveCommand);
        }
      });
    }

    // Check Player B pieces
    if (prevState.players.B && newState.players.B) {
      prevState.players.B.pieces.forEach(prevPiece => {
        const newPiece = newState.players.B!.pieces.find(p => p.id === prevPiece.id);
        if (!newPiece) return;

        // Find the movement command for this piece
        const moveCommand = this.currentMoves?.playerB.find(m => m.pieceId === prevPiece.id);

        // Piece moved and is still alive
        if (prevPiece.alive && newPiece.alive && (prevPiece.x !== newPiece.x || prevPiece.y !== newPiece.y)) {
          this.createSteppedAnimation(prevPiece, newPiece, 'B', animationLayer, false, newState, moveCommand);
        }
        // Piece was alive, moved, and got jailed
        else if (prevPiece.alive && !newPiece.alive && (prevPiece.x !== newPiece.x || prevPiece.y !== newPiece.y)) {
          this.createSteppedAnimation(prevPiece, newPiece, 'B', animationLayer, true, newState, moveCommand);
        }
      });
    }

    // Clear moves after animation
    this.currentMoves = null;
  }

  /**
   * Create step-by-step hopping animation
   */
  private createSteppedAnimation(
    fromPiece: GamePiece,
    toPiece: GamePiece,
    player: 'A' | 'B',
    animationLayer: Element,
    gotJailed: boolean,
    gameState: GameState,
    moveCommand?: Movement
  ): void {
    // Calculate the path step-by-step
    const path: { x: number; y: number }[] = [];
    let currentX = fromPiece.x;
    let currentY = fromPiece.y;

    path.push({ x: currentX, y: currentY });

    if (moveCommand) {
      // Use the command to calculate the actual path taken
      let stepX = 0;
      let stepY = 0;
      switch (moveCommand.direction) {
        case 'up': stepY = 1; break; // up = increase Y toward 10
        case 'down': stepY = -1; break; // down = decrease Y toward 0
        case 'left': stepX = -1; break;
        case 'right': stepX = 1; break;
      }

      // Calculate path until we reach the final position or hit boundaries
      for (let step = 0; step < moveCommand.distance; step++) {
        const nextX = currentX + stepX;
        const nextY = currentY + stepY;

        // Stop at board boundaries
        if (nextX < 0 || nextX >= gameState.boardWidth || nextY < 0 || nextY >= gameState.boardHeight) break;

        currentX = nextX;
        currentY = nextY;
        path.push({ x: currentX, y: currentY });

        // Stop if we've reached the final position
        if (currentX === toPiece.x && currentY === toPiece.y) break;
      }
    } else {
      // Fallback: direct line from start to end
      path.push({ x: toPiece.x, y: toPiece.y });
    }

    // Animate the ghost piece through the path
    this.animateAlongPath(path, fromPiece.id, player, animationLayer, gotJailed);
  }

  /**
   * Animate a piece hopping along a path
   */
  private animateAlongPath(
    path: { x: number; y: number }[],
    pieceId: number,
    player: 'A' | 'B',
    animationLayer: Element,
    gotJailed: boolean
  ): void {
    if (path.length === 0) return;

    // Get first cell to determine sizing
    const firstCell = this.container.querySelector(`#cell-${path[0].x}-${path[0].y}`) as HTMLElement;
    if (!firstCell) return;

    const board = this.container.querySelector('#board') as HTMLElement;
    if (!board) return;

    const boardRect = board.getBoundingClientRect();
    const firstCellRect = firstCell.getBoundingClientRect();
    const cellWidth = firstCellRect.width;
    const ghostPieceSize = cellWidth * 0.75;
    const halfPiece = ghostPieceSize / 2;

    // Create ghost piece
    const ghost = document.createElement('div');
    ghost.className = `absolute rounded-full flex items-center justify-center font-black z-50 ${
      player === 'A'
        ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white border-2 border-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.8)]'
        : 'bg-gradient-to-br from-red-400 to-red-600 text-white border-2 border-red-300 shadow-[0_0_15px_rgba(239,68,68,0.8)]'
    }`;
    ghost.style.width = `${ghostPieceSize}px`;
    ghost.style.height = `${ghostPieceSize}px`;
    ghost.style.fontSize = 'clamp(0.35rem, 2.5vw, 0.875rem)';
    ghost.textContent = pieceId.toString();
    ghost.style.transition = 'all 0.1s ease-out'; // 0.1s per step

    animationLayer.appendChild(ghost);

    // Animate through each step
    let currentStep = 0;
    const stepInterval = 100; // 100ms = 0.1s per step

    const animateNextStep = () => {
      if (currentStep >= path.length) {
        // Animation complete
        if (gotJailed) {
          // Shake and fade out
          ghost.style.animation = 'shake 0.3s ease-in-out, fadeOut 0.3s ease-in-out';
          ghost.style.animationDelay = '0s, 0.15s';
          setTimeout(() => ghost.remove(), 600);
        } else {
          ghost.remove();
        }
        return;
      }

      const pos = path[currentStep];
      const cell = this.container.querySelector(`#cell-${pos.x}-${pos.y}`) as HTMLElement;
      if (!cell) {
        currentStep++;
        animateNextStep();
        return;
      }

      const cellRect = cell.getBoundingClientRect();
      const x = cellRect.left - boardRect.left + cellRect.width / 2 - halfPiece;
      const y = cellRect.top - boardRect.top + cellRect.height / 2 - halfPiece;

      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;

      currentStep++;
      setTimeout(animateNextStep, stepInterval);
    };

    // Start animation
    animateNextStep();
  }

  /**
   * Create a ghost piece animation from one position to another
   * (Legacy method - keeping for backwards compatibility)
   */
  private createGhostAnimation(
    fromPiece: GamePiece,
    toPiece: GamePiece,
    player: 'A' | 'B',
    animationLayer: Element,
    gotJailed: boolean
  ): void {
    // Get actual cell elements to calculate exact positions
    const fromCell = this.container.querySelector(`#cell-${fromPiece.x}-${fromPiece.y}`) as HTMLElement;
    const toCell = this.container.querySelector(`#cell-${toPiece.x}-${toPiece.y}`) as HTMLElement;

    if (!fromCell || !toCell) return;

    const board = this.container.querySelector('#board') as HTMLElement;
    if (!board) return;

    // Get board position as reference
    const boardRect = board.getBoundingClientRect();

    // Get cell positions relative to board
    const fromCellRect = fromCell.getBoundingClientRect();
    const toCellRect = toCell.getBoundingClientRect();
    const cellWidth = toCellRect.width;
    const ghostPieceSize = cellWidth * 0.75; // Piece is 75% of cell width
    const halfPiece = ghostPieceSize / 2;

    // Calculate center positions relative to board
    const fromX = fromCellRect.left - boardRect.left + fromCellRect.width / 2 - halfPiece;
    const fromY = fromCellRect.top - boardRect.top + fromCellRect.height / 2 - halfPiece;
    let toX = toCellRect.left - boardRect.left + toCellRect.width / 2 - halfPiece;
    let toY = toCellRect.top - boardRect.top + toCellRect.height / 2 - halfPiece;

    // If collision/jail, stop one cell width before target, then add 7px back
    if (gotJailed) {
      const cellWidth = toCellRect.width;
      const deltaX = toX - fromX;
      const deltaY = toY - fromY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Stop at: full distance - one cell width + 7px
      const stopDistance = distance - cellWidth + 7;
      const ratio = stopDistance / distance;

      toX = fromX + (deltaX * ratio);
      toY = fromY + (deltaY * ratio);
    }

    // Create ghost piece - size it based on cell size for responsiveness
    const ghost = document.createElement('div');
    ghost.className = `absolute rounded-full flex items-center justify-center font-black z-50 ${
      player === 'A'
        ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white border-2 border-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.8)]'
        : 'bg-gradient-to-br from-red-400 to-red-600 text-white border-2 border-red-300 shadow-[0_0_15px_rgba(239,68,68,0.8)]'
    }`;
    ghost.style.width = `${ghostPieceSize}px`;
    ghost.style.height = `${ghostPieceSize}px`;
    ghost.style.fontSize = 'clamp(0.35rem, 2.5vw, 0.875rem)';
    ghost.textContent = fromPiece.id.toString();
    ghost.style.left = `${fromX}px`;
    ghost.style.top = `${fromY}px`;
    ghost.style.transition = 'all 0.4s ease-out';

    animationLayer.appendChild(ghost);

    // Trigger movement animation on next frame
    requestAnimationFrame(() => {
      ghost.style.left = `${toX}px`;
      ghost.style.top = `${toY}px`;
    });

    if (gotJailed) {
      // After moving to collision point, pause briefly, then shake and fade out
      setTimeout(() => {
        // Add shake animation
        ghost.style.animation = 'shake 0.3s ease-in-out, fadeOut 0.3s ease-in-out';
        ghost.style.animationDelay = '0s, 0.15s';
      }, 600);

      // Remove ghost after pause + shake + fade
      setTimeout(() => {
        ghost.remove();
      }, 1300);
    } else {
      // Normal movement - remove after animation
      setTimeout(() => {
        ghost.remove();
      }, 400);
    }
  }
}
