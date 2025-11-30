import type { GamePiece, Command, GameState } from '../types/game';

interface DragState {
  pieceId: number;
  player: 'A' | 'B';
  startX: number;
  startY: number;
  startGridX: number;
  startGridY: number;
  lastGhostCell?: string;
  lastDirection?: 'up' | 'down' | 'left' | 'right';
  lastDistance?: number;
}

export interface QueuedMove {
  direction: 'up' | 'down' | 'left' | 'right';
  distance: number;
  player: 'A' | 'B';
}

/**
 * DragDropHandler
 * Handles drag-and-drop interactions for piece movement
 */
export class DragDropHandler {
  private container: HTMLElement;
  private dragState: DragState | null = null;
  private queuedMoves: Map<number, QueuedMove> = new Map();
  private onQueueMove?: (command: Command) => void;
  private showGhostInCell: (x: number, y: number, pieceId: number, player: 'A' | 'B', isBlocked?: boolean) => void;
  private gameState: GameState | null = null;

  // Board dimensions (read from gameState when available, with fallback defaults)
  private get BOARD_WIDTH(): number {
    return this.gameState?.boardWidth ?? 19;
  }

  private get BOARD_HEIGHT(): number {
    return this.gameState?.boardHeight ?? 13;
  }

  constructor(
    container: HTMLElement,
    showGhostInCell: (x: number, y: number, pieceId: number, player: 'A' | 'B', isBlocked?: boolean) => void,
    onQueueMove?: (command: Command) => void
  ) {
    this.container = container;
    this.showGhostInCell = showGhostInCell;
    this.onQueueMove = onQueueMove;
    console.log('✅ No-guard zone now uses dynamic bounds from game state - v4');
  }

  /**
   * Update game state for no-guard zone validation
   */
  updateGameState(gameState: GameState): void {
    this.gameState = gameState;
  }

  /**
   * Get queued moves map
   */
  getQueuedMoves(): Map<number, QueuedMove> {
    return this.queuedMoves;
  }

  /**
   * Start piece drag
   */
  handlePieceDragStart(e: MouseEvent, piece: GamePiece, player: 'A' | 'B'): void {
    e.preventDefault();

    this.dragState = {
      pieceId: piece.id,
      player,
      startX: e.clientX,
      startY: e.clientY,
      startGridX: piece.x,
      startGridY: piece.y
    };

    // Add global mouse move and up handlers
    const handleMouseMove = (e: MouseEvent) => this.handlePieceDragMove(e);
    const handleMouseUp = (e: MouseEvent) => {
      this.handlePieceDragEnd(e);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  /**
   * Handle piece drag movement
   */
  private handlePieceDragMove(e: MouseEvent): void {
    if (!this.dragState) return;

    // Temporarily hide all pieces to detect the cell underneath
    const pieces = this.container.querySelectorAll('.piece');
    pieces.forEach(p => (p as HTMLElement).style.pointerEvents = 'none');

    // Use elementFromPoint to detect which cell is under the cursor
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const cell = element?.closest('[id^="cell-"]') as HTMLElement;

    // Restore pointer events
    pieces.forEach(p => (p as HTMLElement).style.pointerEvents = '');

    if (cell && cell.id.startsWith('cell-')) {
      // Extract grid coordinates from cell ID (format: cell-x-y)
      const parts = cell.id.split('-');
      const hoverX = parseInt(parts[1]);
      const hoverY = parseInt(parts[2]);

      // Calculate deltas from start position
      const gridDeltaX = hoverX - this.dragState.startGridX;
      const gridDeltaY = hoverY - this.dragState.startGridY;

      // Show visual feedback (arrow overlay)
      this.showDragArrow(this.dragState.startGridX, this.dragState.startGridY, gridDeltaX, gridDeltaY);

      // Determine and store direction/distance for use on drop
      let direction: 'up' | 'down' | 'left' | 'right' | null = null;
      let distance = 0;

      if (Math.abs(gridDeltaX) > Math.abs(gridDeltaY)) {
        // Horizontal movement
        if (gridDeltaX > 0) {
          direction = 'right';
          distance = gridDeltaX;
        } else if (gridDeltaX < 0) {
          direction = 'left';
          distance = Math.abs(gridDeltaX);
        }
      } else {
        // Vertical movement
        // Frontend Y increases going DOWN screen, but backend 'up' means increase Y coordinate
        if (gridDeltaY > 0) {
          direction = 'up'; // Dragging DOWN screen = move toward y=10 = 'up'
          distance = gridDeltaY;
        } else if (gridDeltaY < 0) {
          direction = 'down'; // Dragging UP screen = move toward y=0 = 'down'
          distance = Math.abs(gridDeltaY);
        }
      }

      // Store for use on drop
      this.dragState.lastDirection = direction || undefined;
      this.dragState.lastDistance = distance > 0 ? distance : undefined;

      // Show ghost at ACTUAL destination based on direction/distance, not hover position
      if (direction && distance > 0) {
        // Calculate actual destination based on direction and distance
        let destX = this.dragState.startGridX;
        let destY = this.dragState.startGridY;

        switch (direction) {
          case 'up':
            destY = Math.min(this.BOARD_HEIGHT - 1, this.dragState.startGridY + distance); // up = increase Y
            break;
          case 'down':
            destY = Math.max(0, this.dragState.startGridY - distance); // down = decrease Y
            break;
          case 'left':
            destX = Math.max(0, this.dragState.startGridX - distance);
            break;
          case 'right':
            destX = Math.min(this.BOARD_WIDTH - 1, this.dragState.startGridX + distance);
            break;
        }

        // Check if destination is in active no-guard zone
        const isBlocked = this.isInNoGuardZone(destX, destY, this.dragState.player);

        const cellKey = `${destX}-${destY}`;
        if (this.dragState.lastGhostCell !== cellKey) {
          // Clear ALL ghost previews before creating new one
          this.container.querySelectorAll('.ghost-preview').forEach(el => el.remove());

          if (isBlocked) {
            // Show red flash on the cell to indicate blocked move
            this.showBlockedFeedback(destX, destY);
          } else {
            // Show normal ghost preview
            this.showGhostInCell(destX, destY, this.dragState.pieceId, this.dragState.player);
          }
          this.dragState.lastGhostCell = cellKey;
        }
      } else {
        // Invalid move (no direction), clear ghosts
        this.container.querySelectorAll('.ghost-preview').forEach(el => el.remove());
        this.dragState.lastGhostCell = undefined;
      }
    }
  }

  /**
   * Handle piece drag end
   */
  private handlePieceDragEnd(_e: MouseEvent): void {
    if (!this.dragState) return;

    // Clear drag arrow
    this.clearDragArrow();

    // Use the stored direction/distance from last drag move
    const direction = this.dragState.lastDirection;
    const distance = this.dragState.lastDistance;

    // Calculate destination to check if blocked
    if (direction && distance && distance > 0) {
      let destX = this.dragState.startGridX;
      let destY = this.dragState.startGridY;

      switch (direction) {
        case 'up':
          destY = Math.min(this.BOARD_HEIGHT - 1, this.dragState.startGridY + distance); // up = increase Y
          break;
        case 'down':
          destY = Math.max(0, this.dragState.startGridY - distance); // down = decrease Y
          break;
        case 'left':
          destX = Math.max(0, this.dragState.startGridX - distance);
          break;
        case 'right':
          destX = Math.min(this.BOARD_WIDTH - 1, this.dragState.startGridX + distance);
          break;
      }

      // Check if move is blocked by no-guard zone
      const isBlocked = this.isInNoGuardZone(destX, destY, this.dragState.player);

      // Only queue the move if it's not blocked
      if (!isBlocked && this.onQueueMove) {
        this.onQueueMove({
          pieceId: this.dragState.pieceId,
          direction,
          distance
        });

        // Store queued move so ghost persists
        this.queuedMoves.set(this.dragState.pieceId, {
          direction,
          distance,
          player: this.dragState.player
        });

        // Ghost preview will persist because of queuedMoves
      } else if (isBlocked) {
        // Clear any ghost previews for blocked moves
        this.container.querySelectorAll('.ghost-preview').forEach(el => el.remove());
      }
    }

    this.dragState = null;
  }

  /**
   * Show drag arrow overlay
   */
  private showDragArrow(_startX: number, _startY: number, deltaX: number, deltaY: number): void {
    // Clear previous arrow
    this.clearDragArrow();

    if (deltaX === 0 && deltaY === 0) return;

    // Create arrow overlay - huge background indicator
    const arrow = document.createElement('div');
    arrow.id = 'drag-arrow';
    arrow.className = 'absolute pointer-events-none z-0 inset-0 flex items-center justify-center';

    // Determine primary direction
    let direction = '';
    let length = 0;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      direction = deltaX > 0 ? '→' : '←';
      length = Math.abs(deltaX);
    } else {
      direction = deltaY > 0 ? '↓' : '↑';
      length = Math.abs(deltaY);
    }

    arrow.innerHTML = `
      <div class="text-cyan-300/10 font-black whitespace-nowrap select-none" style="font-size: clamp(4rem, 20vw, 12rem); text-shadow: 0 0 40px rgba(34,211,238,0.15);">
        ${direction} ${length}
      </div>
    `;

    this.container.querySelector('#board')?.appendChild(arrow);
  }

  /**
   * Clear drag arrow overlay
   */
  private clearDragArrow(): void {
    const arrow = this.container.querySelector('#drag-arrow');
    if (arrow) {
      arrow.remove();
    }
  }

  /**
   * Check if position is in active no-guard zone
   */
  private isInNoGuardZone(x: number, y: number, player: 'A' | 'B'): boolean {
    if (!this.gameState?.noGuardZoneActive) return false;

    // Get no-guard zone bounds from game state
    const zone = this.gameState.noGuardZoneBounds[player];
    if (!zone) return false;

    // Check if zone is active and position is within bounds
    if (this.gameState.noGuardZoneActive[player]) {
      return x >= zone.minX && x <= zone.maxX && y >= zone.minY && y <= zone.maxY;
    }

    return false;
  }

  /**
   * Show quick red flash feedback for blocked move
   */
  private showBlockedFeedback(x: number, y: number): void {
    const cell = this.container.querySelector(`#cell-${x}-${y}`) as HTMLElement;
    if (!cell) return;

    // Create a red flash overlay
    const flash = document.createElement('div');
    flash.className = 'absolute inset-0 bg-red-500/40 rounded-md pointer-events-none animate-pulse';
    flash.style.animation = 'pulse 0.3s ease-in-out';
    cell.appendChild(flash);

    // Remove after animation
    setTimeout(() => flash.remove(), 300);
  }
}
