import type { GameState } from '../types/game';

/**
 * BoardRenderer
 * Handles rendering of game objects on the board: jails, flags, rescue keys, ghost previews
 */
export class BoardRenderer {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    console.log('✅ BoardRenderer initialized - refactored code is running!');
  }

  /**
   * Update jail displays for both players
   */
  updateJails(gameState: GameState): void {
    // Update Player A jail
    const jailA = this.container.querySelector('#jailA') as HTMLElement;
    if (jailA && gameState.players.A) {
      jailA.innerHTML = '';
      gameState.players.A.jailedPieces?.forEach((pieceId: number) => {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs';
        pieceEl.textContent = pieceId.toString();
        jailA.appendChild(pieceEl);
      });
    }

    // Update Player B jail
    const jailB = this.container.querySelector('#jailB') as HTMLElement;
    if (jailB && gameState.players.B) {
      jailB.innerHTML = '';
      gameState.players.B.jailedPieces?.forEach((pieceId: number) => {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs';
        pieceEl.textContent = pieceId.toString();
        jailB.appendChild(pieceEl);
      });
    }
  }

  /**
   * Place rescue keys on the board
   */
  placeRescueKeys(gameState: GameState): void {
    if (!gameState.rescueKeys) return;

    // Place Blue team's key (Player A)
    if (gameState.rescueKeys.A) {
      const keyA = gameState.rescueKeys.A;
      const cellA = this.container.querySelector(`#cell-${keyA.x}-${keyA.y}`) as HTMLElement;
      if (cellA) {
        const keyEl = document.createElement('div');
        keyEl.className = 'rescue-key rescue-key-a absolute inset-0 flex items-center justify-center z-5';
        keyEl.style.fontSize = 'clamp(1rem, 4vw, 1.5rem)';
        keyEl.style.filter = 'hue-rotate(200deg) saturate(1.5)'; // Blue tint
        keyEl.textContent = '🔑';
        keyEl.title = 'Blue Team Rescue Key - Land here to free jailed teammates!';
        cellA.appendChild(keyEl);
      }
    }

    // Place Red team's key (Player B)
    if (gameState.rescueKeys.B) {
      const keyB = gameState.rescueKeys.B;
      const cellB = this.container.querySelector(`#cell-${keyB.x}-${keyB.y}`) as HTMLElement;
      if (cellB) {
        const keyEl = document.createElement('div');
        keyEl.className = 'rescue-key rescue-key-b absolute inset-0 flex items-center justify-center z-5';
        keyEl.style.fontSize = 'clamp(1rem, 4vw, 1.5rem)';
        keyEl.style.filter = 'hue-rotate(0deg) saturate(1.5)'; // Red/orange tint
        keyEl.textContent = '🔑';
        keyEl.title = 'Red Team Rescue Key - Land here to free jailed teammates!';
        cellB.appendChild(keyEl);
      }
    }
  }

  /**
   * Place flags on the board
   */
  placeFlags(gameState: GameState): void {
    if (!gameState.flags) return;

    // Place Blue flag (Player A's flag)
    const flagA = gameState.flags.A;
    if (flagA) {
      const cellA = this.container.querySelector(`#cell-${flagA.x}-${flagA.y}`) as HTMLElement;
      if (cellA) {
        const flagEl = document.createElement('div');
        // If flag is carried, show it on top of piece with transparency (z-20 is above pieces which are z-10)
        // If flag is not carried, show it normally (z-5 is below pieces)
        const isCarried = flagA.carriedBy !== null;
        flagEl.className = `flag flag-a absolute inset-0 flex items-center justify-center ${isCarried ? 'z-20' : 'z-5'}`;
        flagEl.style.fontSize = 'clamp(1.2rem, 5vw, 2rem)';
        flagEl.textContent = '🚩';
        flagEl.style.filter = 'hue-rotate(200deg) saturate(1.5)'; // Blue tint
        flagEl.style.opacity = isCarried ? '0.5' : '1'; // 50% opacity when carried
        flagEl.style.pointerEvents = 'none'; // Allow clicks to pass through to piece underneath
        flagEl.title = flagA.carriedBy ? `Blue flag carried by ${flagA.carriedBy.player} Piece ${flagA.carriedBy.pieceId}` : 'Blue Flag - Capture and bring to your territory!';
        cellA.appendChild(flagEl);
      }
    }

    // Place Red flag (Player B's flag)
    const flagB = gameState.flags.B;
    if (flagB) {
      const cellB = this.container.querySelector(`#cell-${flagB.x}-${flagB.y}`) as HTMLElement;
      if (cellB) {
        const flagEl = document.createElement('div');
        // If flag is carried, show it on top of piece with transparency (z-20 is above pieces which are z-10)
        // If flag is not carried, show it normally (z-5 is below pieces)
        const isCarried = flagB.carriedBy !== null;
        flagEl.className = `flag flag-b absolute inset-0 flex items-center justify-center ${isCarried ? 'z-20' : 'z-5'}`;
        flagEl.style.fontSize = 'clamp(1.2rem, 5vw, 2rem)';
        flagEl.textContent = '🚩';
        flagEl.style.filter = 'hue-rotate(0deg) saturate(1.5)'; // Red tint
        flagEl.style.opacity = isCarried ? '0.5' : '1'; // 50% opacity when carried
        flagEl.style.pointerEvents = 'none'; // Allow clicks to pass through to piece underneath
        flagEl.title = flagB.carriedBy ? `Red flag carried by ${flagB.carriedBy.player} Piece ${flagB.carriedBy.pieceId}` : 'Red Flag - Capture and bring to your territory!';
        cellB.appendChild(flagEl);
      }
    }
  }

  /**
   * Show a ghost preview of a piece at a specific cell
   */
  showGhostInCell(x: number, y: number, pieceId: number, _player: 'A' | 'B', _isBlocked?: boolean): void {
    const cell = this.container.querySelector(`#cell-${x}-${y}`) as HTMLElement;
    if (!cell) return;

    // Check if a ghost for this piece already exists in this cell
    const existingGhost = cell.querySelector(`.ghost-preview[data-piece-id="${pieceId}"]`);
    if (existingGhost) {
      // Ghost already exists for this piece - don't redraw to prevent flashing
      return;
    }

    // Remove only ghosts for OTHER pieces in this cell (shouldn't happen, but just in case)
    cell.querySelectorAll(`.ghost-preview:not([data-piece-id="${pieceId}"])`).forEach(el => el.remove());

    const ghost = document.createElement('div');
    ghost.className = 'ghost-preview absolute inset-0 m-auto rounded-full flex items-center justify-center font-black z-30 border-2 border-white/70 text-white/80';
    ghost.setAttribute('data-piece-id', pieceId.toString());
    ghost.style.width = '100%';
    ghost.style.height = '100%';
    ghost.style.fontSize = 'clamp(0.25rem, 1.5vw, 0.6rem)';
    ghost.style.pointerEvents = 'none';
    ghost.style.background = 'transparent';
    ghost.style.boxShadow = '0 0 8px rgba(255, 255, 255, 0.3)';
    ghost.textContent = pieceId.toString();

    cell.appendChild(ghost);
  }
}
