import type { GameState, GamePiece, GameHistory, RoundHistory } from '../types/game';
import { AnimationController } from './AnimationController';
import { DragDropHandler } from './DragDropHandler';
import { BoardRenderer } from './BoardRenderer';

console.log('✅ BattleArena with AI Analysis Scoreboard loaded - v4');

export interface BattleArenaOptions {
  playerPerspective?: 'A' | 'B' | 'spectator';
  showEnemyCommands?: boolean;
  enableAnimations?: boolean;
  onPieceClick?: (piece: { x: number; y: number; pieceId: number; player: 'A' | 'B' }) => void;
  onQueueMove?: (move: { pieceId: number; direction: 'up' | 'down' | 'left' | 'right'; distance: number }) => void;
}

export class BattleArena {
  private container: HTMLElement;
  private gameState: GameState | null = null;
  private playerPerspective: 'A' | 'B' | 'spectator';
  private showEnemyCommands: boolean;
  private enableAnimations: boolean;
  private onPieceClick?: BattleArenaOptions['onPieceClick'];
  private onQueueMove?: BattleArenaOptions['onQueueMove'];
  private countdownInterval: number | null = null;
  private gameStartTime: number | null = null;
  private totalGameTime: number | null = null;

  // Module instances
  private animationController: AnimationController;
  private dragDropHandler: DragDropHandler;
  private boardRenderer: BoardRenderer;

  constructor(containerId: string, options: BattleArenaOptions = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with id "${containerId}" not found`);
    }

    this.container = container;
    this.playerPerspective = options.playerPerspective || 'A';
    this.showEnemyCommands = options.showEnemyCommands !== false;
    this.enableAnimations = options.enableAnimations !== false;
    this.onPieceClick = options.onPieceClick;
    this.onQueueMove = options.onQueueMove;

    // Initialize modules
    this.animationController = new AnimationController(this.container);
    this.boardRenderer = new BoardRenderer(this.container);
    this.dragDropHandler = new DragDropHandler(
      this.container,
      this.boardRenderer.showGhostInCell.bind(this.boardRenderer),
      this.onQueueMove
    );

    this.init();
  }

  private init(): void {
    this.createHTML();
  }

  private createHTML(): void {
    this.container.innerHTML = `
      <div class="bg-gradient-to-br from-purple-900 via-slate-900 to-cyan-900 rounded-3xl border-4 border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.5)] p-8 text-white font-mono w-full mx-auto select-none relative overflow-hidden">
        <!-- Retro grid background effect -->
        <div class="absolute inset-0 opacity-10" style="background-image: linear-gradient(cyan 1px, transparent 1px), linear-gradient(90deg, cyan 1px, transparent 1px); background-size: 20px 20px;"></div>

        <div class="relative z-10">
          <!-- Header -->
          <div class="text-center mb-8">
            <h2 class="text-5xl font-black mb-3 tracking-wider" style="text-shadow: 0 0 20px rgba(236,72,153,0.8), 0 0 40px rgba(34,211,238,0.6); background: linear-gradient(90deg, #ec4899, #22d3ee, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">⚔️ COMMANDER ⚔️</h2>
            <div class="bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-cyan-500/20 border-2 border-pink-400 px-6 py-3 rounded-xl text-lg font-bold tracking-wide shadow-[0_0_15px_rgba(236,72,153,0.4)]" id="gameStatus" style="text-shadow: 0 0 10px rgba(255,255,255,0.5);">⚡ BATTLE IN PROGRESS ⚡</div>
          </div>

          <!-- Round & Timer Info -->
          <div class="flex justify-between mb-6 px-6 py-4 bg-black/60 rounded-xl text-base font-bold border-2 border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.3)]" style="backdrop-filter: blur(10px);">
            <span id="currentRound" class="text-cyan-300" style="text-shadow: 0 0 10px rgba(34,211,238,0.8);">Round: 1</span>
            <span id="serverUptime" class="text-sm text-gray-400">Server: unknown</span>
            <span id="nextTick" class="text-pink-300" style="text-shadow: 0 0 10px rgba(236,72,153,0.8);">Next tick: 3s</span>
          </div>

          <!-- Battle Zone -->
          <div class="flex justify-center mb-8">
            <div class="flex flex-col gap-4">
              <!-- Player A Jail (Top-right aligned) -->
              <div class="self-end bg-gradient-to-br from-blue-900/60 to-blue-600/40 border-4 border-blue-400 rounded-2xl p-3 min-h-20 shadow-[0_0_25px_rgba(96,165,250,0.6)]" style="backdrop-filter: blur(5px); width: fit-content;">
                <div class="text-xs font-black mb-2 text-blue-200 text-center tracking-wider" style="text-shadow: 0 0 8px rgba(96,165,250,0.9);">🔒 BLUE JAIL</div>
                <div id="jailA" class="flex flex-row gap-2 items-center text-xs"></div>
              </div>

              <!-- Battle Board -->
              <div class="relative">
                <div class="grid grid-cols-11 gap-1 bg-gradient-to-br from-slate-800 to-slate-950 p-6 rounded-2xl border-4 border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.5)]" id="board" style="backdrop-filter: blur(10px);">
                  <!-- 11x11 grid generated by JavaScript -->
                </div>
                <!-- Animation overlay layer -->
                <div class="absolute inset-0 pointer-events-none" id="animationLayer"></div>
              </div>

              <!-- Player B Jail (Bottom-left) -->
              <div class="bg-gradient-to-br from-red-900/60 to-red-600/40 border-4 border-red-400 rounded-2xl p-3 min-h-20 shadow-[0_0_25px_rgba(248,113,113,0.6)]" style="backdrop-filter: blur(5px); width: fit-content;">
                <div class="text-xs font-black mb-2 text-red-200 text-center tracking-wider" style="text-shadow: 0 0 8px rgba(248,113,113,0.9);">🔒 RED JAIL</div>
                <div id="jailB" class="flex flex-row gap-2 items-center text-xs"></div>
              </div>
            </div>
          </div>

          <!-- Command Queue -->
          <div class="grid grid-cols-2 gap-6">
            <div class="bg-gradient-to-br from-cyan-900/50 to-blue-900/50 rounded-xl p-4 min-h-24 border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]">
              <div class="font-black mb-3 text-sm text-cyan-300 tracking-wider" style="text-shadow: 0 0 10px rgba(34,211,238,0.6);">📋 YOUR COMMANDS</div>
              <div class="text-sm leading-relaxed text-cyan-100" id="yourQueue">No commands queued</div>
            </div>

            <div class="bg-gradient-to-br from-pink-900/50 to-purple-900/50 rounded-xl p-4 min-h-24 border-2 border-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.3)]" id="enemyQueueSection">
              <div class="font-black mb-3 text-sm text-pink-300 tracking-wider" style="text-shadow: 0 0 10px rgba(236,72,153,0.6);">👁️ ENEMY ACTIVITY</div>
              <div class="text-sm leading-relaxed text-pink-100" id="enemyQueue">Enemy is planning...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.initializeBoard();
  }

  private initializeBoard(): void {
    const board = this.container.querySelector('#board') as HTMLElement;
    if (!board) return;

    board.innerHTML = '';

    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        const cell = document.createElement('div');

        // Territory-based coloring
        // Rows 6-10 = Player A (Blue) territory
        // Row 5 = Neutral zone
        // Rows 0-4 = Player B (Red) territory
        let territoryColor = 'bg-slate-900/50'; // default
        if (y >= 6 && y <= 10) {
          // Player A territory (blue)
          territoryColor = 'bg-blue-950/30';
        } else if (y >= 0 && y <= 4) {
          // Player B territory (red)
          territoryColor = 'bg-red-950/30';
        } else {
          // Neutral zone (row 5)
          territoryColor = 'bg-purple-950/30';
        }

        cell.className = `w-8 h-8 ${territoryColor} border border-cyan-400/30 flex items-center justify-center relative cursor-pointer transition-all duration-200 hover:bg-cyan-500/20 hover:border-cyan-300 hover:shadow-[0_0_10px_rgba(34,211,238,0.4)]`;
        cell.id = `cell-${x}-${y}`;
        cell.dataset.x = x.toString();
        cell.dataset.y = y.toString();

        // Add click handler for piece interaction
        cell.addEventListener('click', () => {
          if (this.onPieceClick) {
            const piece = cell.querySelector('.piece') as HTMLElement;
            if (piece) {
              this.onPieceClick({
                x: parseInt(x.toString()),
                y: parseInt(y.toString()),
                pieceId: parseInt(piece.textContent || '0'),
                player: piece.classList.contains('piece-a') ? 'A' : 'B'
              });
            }
          }
        });

        board.appendChild(cell);
      }
    }
  }

  // Update no-guard zone visualization
  private updateNoGuardZones(gameState: GameState): void {
    if (!gameState.noGuardZoneBounds) return;

    // Clear all existing zone overlays
    const existingOverlays = this.container.querySelectorAll('.zone-overlay');
    existingOverlays.forEach(el => el.remove());

    // Update Blue (A) no-guard zone
    const blueZone = gameState.noGuardZoneBounds.A;
    const blueActive = gameState.noGuardZoneActive?.A ?? false;

    if (blueActive) {
      for (let y = blueZone.minY; y <= blueZone.maxY; y++) {
        for (let x = blueZone.minX; x <= blueZone.maxX; x++) {
          const cell = this.container.querySelector(`#cell-${x}-${y}`) as HTMLElement;
          if (cell) {
            const overlay = document.createElement('div');
            overlay.className = 'zone-overlay';
            overlay.style.cssText = `
              position: absolute;
              inset: 0;
              background-color: rgba(59, 130, 246, 0.25);
              border: 2px solid rgba(59, 130, 246, 0.7);
              box-shadow: inset 0 0 15px rgba(59, 130, 246, 0.5);
              pointer-events: none;
              z-index: 1;
            `;
            cell.appendChild(overlay);
          }
        }
      }
    }

    // Update Red (B) no-guard zone
    const redZone = gameState.noGuardZoneBounds.B;
    const redActive = gameState.noGuardZoneActive?.B ?? false;

    if (redActive) {
      for (let y = redZone.minY; y <= redZone.maxY; y++) {
        for (let x = redZone.minX; x <= redZone.maxX; x++) {
          const cell = this.container.querySelector(`#cell-${x}-${y}`) as HTMLElement;
          if (cell) {
            const overlay = document.createElement('div');
            overlay.className = 'zone-overlay';
            overlay.style.cssText = `
              position: absolute;
              inset: 0;
              background-color: rgba(239, 68, 68, 0.25);
              border: 2px solid rgba(239, 68, 68, 0.7);
              box-shadow: inset 0 0 15px rgba(239, 68, 68, 0.5);
              pointer-events: none;
              z-index: 1;
            `;
            cell.appendChild(overlay);
          }
        }
      }
    }
  }

  // Main update method - call this when game state changes
  updateGameState(gameState: GameState): void {
    const prevState = this.gameState;

    // Track game start time
    if (prevState?.gameStatus !== 'playing' && gameState.gameStatus === 'playing' && this.gameStartTime === null) {
      this.gameStartTime = Date.now();
    }

    // Calculate total game time when game finishes
    if (prevState?.gameStatus === 'playing' && gameState.gameStatus === 'finished' && this.totalGameTime === null) {
      if (this.gameStartTime !== null) {
        this.totalGameTime = (Date.now() - this.gameStartTime) / 1000; // Convert to seconds
      }
    }

    // Update no-guard zone visualization
    this.updateNoGuardZones(gameState);

    this.gameState = gameState;

    // Update drag handler with latest game state for no-guard zone validation
    this.dragDropHandler.updateGameState(gameState);

    this.updateRoundInfo();
    this.updatePlayerStatus();
    this.updateBoard(prevState);
    this.updateCommandQueues();
    this.startCountdownUpdates();
  }

  private updateRoundInfo(): void {
    if (!this.gameState) return;

    const roundEl = this.container.querySelector('#currentRound') as HTMLElement;
    const statusEl = this.container.querySelector('#gameStatus') as HTMLElement;
    const serverUptimeEl = this.container.querySelector('#serverUptime') as HTMLElement;

    if (roundEl) roundEl.textContent = `Round: ${this.gameState.round}`;

    // Update server uptime if available
    if (serverUptimeEl && this.gameState.serverStartTime) {
      const uptimeSeconds = Math.floor((Date.now() - this.gameState.serverStartTime) / 1000);
      const minutes = Math.floor(uptimeSeconds / 60);
      const seconds = uptimeSeconds % 60;
      serverUptimeEl.textContent = `Server: ${minutes}m ${seconds}s`;
      serverUptimeEl.className = 'text-sm text-green-400'; // Indicate server is running
    } else if (serverUptimeEl) {
      serverUptimeEl.textContent = 'Server: unknown';
      serverUptimeEl.className = 'text-sm text-gray-400';
    }

    // Countdown is now calculated locally in updateCountdown()
    this.updateCountdown();

    if (statusEl) {
      // Update game status with better messaging
      switch (this.gameState.gameStatus) {
        case 'waiting':
          statusEl.textContent = 'Waiting for players...';
          break;
        case 'paused':
          statusEl.textContent = this.gameState.players.A && this.gameState.players.B ?
            'Both players ready! Game starting soon...' : 'Game paused - waiting for players';
          break;
        case 'playing':
          statusEl.textContent = '🎮 Battle in progress!';
          break;
        case 'finished':
          if (this.gameState.winner) {
            // Personalize message based on player perspective
            if (this.playerPerspective === 'spectator') {
              const winnerTeam = this.gameState.winner === 'A' ? 'Blue Team' : 'Red Team';
              const winnerEmoji = this.gameState.winner === 'A' ? '🔵' : '🔴';
              statusEl.textContent = `🎉 ${winnerEmoji} ${winnerTeam} WINS! 🎉`;
            } else if (this.gameState.winner === this.playerPerspective) {
              statusEl.textContent = '🎉 🏆 YOU WIN! 🏆 🎉';
            } else {
              statusEl.textContent = '💔 YOU LOSE! 💔';
            }
          } else {
            statusEl.textContent = 'Game finished!';
          }
          break;
        default:
          statusEl.textContent = 'Ready to battle';
      }
    }
  }

  private updateCountdown(): void {
    if (!this.gameState) return;

    const tickEl = this.container.querySelector('#nextTick') as HTMLElement;
    if (!tickEl) return;

    // Calculate countdown locally using lastRoundTime
    if (this.gameState.gameStatus === 'playing' && this.gameState.lastRoundTime) {
      const elapsed = Date.now() - this.gameState.lastRoundTime;
      const remaining = Math.max(0, 3000 - elapsed);
      const timeText = (remaining / 1000).toFixed(1);
      tickEl.textContent = `Next tick: ${timeText}s`;
    } else if (this.gameState.gameStatus === 'finished' && this.totalGameTime !== null) {
      // Show the total game time when finished
      tickEl.textContent = `Total time: ${this.totalGameTime.toFixed(1)}s`;
    } else {
      tickEl.textContent = 'Next tick: -';
    }
  }

  private startCountdownUpdates(): void {
    // Clear any existing interval
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
    }

    // Only start countdown updates if game is playing
    if (this.gameState?.gameStatus === 'playing') {
      this.countdownInterval = window.setInterval(() => {
        this.updateCountdown();
      }, 100);
    }
  }

  private updatePlayerStatus(): void {
    if (!this.gameState) return;

    const playerAEl = this.container.querySelector('#playerAStatus') as HTMLElement;
    const playerBEl = this.container.querySelector('#playerBStatus') as HTMLElement;

    if (playerAEl) {
      playerAEl.textContent = this.gameState.players.A ?
        `Connected (${this.gameState.players.A.type})` : 'Waiting';
    }

    if (playerBEl) {
      playerBEl.textContent = this.gameState.players.B ?
        `Connected (${this.gameState.players.B.type})` : 'Waiting';
    }

  }

  private updateBoard(prevState: GameState | null): void {
    if (!this.gameState) return;

    // Animate pieces that moved (before clearing board)
    if (this.enableAnimations && prevState) {
      // Extract movement commands from previous round for animation
      const prevRound = prevState.round;
      const moves = {
        playerA: prevState.commandQueue[prevRound]?.playerA || [],
        playerB: prevState.commandQueue[prevRound]?.playerB || []
      };

      // Set moves for step-by-step animation
      this.animationController.setCurrentMoves(moves);
      this.animationController.animateMovingPieces(prevState, this.gameState);
    }

    // Clear board first
    this.clearBoard();

    // Place pieces (instant redraw)
    if (this.gameState.players.A) {
      this.gameState.players.A.pieces.forEach(piece => {
        if (piece.alive) {
          this.placePiece(piece, 'A', prevState);
        }
      });
    }

    if (this.gameState.players.B) {
      this.gameState.players.B.pieces.forEach(piece => {
        if (piece.alive) {
          this.placePiece(piece, 'B', prevState);
        }
      });
    }

    // Update jails
    this.boardRenderer.updateJails(this.gameState);

    // Place rescue keys if they exist
    this.boardRenderer.placeRescueKeys(this.gameState);

    // Place flags
    this.boardRenderer.placeFlags(this.gameState);

    // Re-draw ghost previews for queued moves (that haven't executed yet)
    this.redrawQueuedGhosts(prevState);
  }

  private clearBoard(): void {
    const cells = this.container.querySelectorAll('.cell, [id^="cell-"]');
    cells.forEach(cell => {
      const cellElement = cell as HTMLElement;
      // Remove pieces, keys, and flags
      // Preserve ghost previews if there are queued moves
      if (this.dragDropHandler.getQueuedMoves().size > 0) {
        // Preserve ghost previews when moves are queued
        cellElement.querySelectorAll('.piece, .rescue-key, .flag').forEach(el => el.remove());
      } else {
        // Clear everything including ghosts when no queued moves
        cellElement.querySelectorAll('.piece, .rescue-key, .flag, .ghost-preview').forEach(el => el.remove());
      }
    });
  }

  private placePiece(piece: GamePiece, player: 'A' | 'B', prevState: GameState | null): void {
    const cell = this.container.querySelector(`#cell-${piece.x}-${piece.y}`) as HTMLElement;
    if (!cell) return;

    const pieceEl = document.createElement('div');
    const isDraggable = player === this.playerPerspective;

    // Add glowing ring for YOUR pieces
    const yourPieceBorder = isDraggable ? 'ring-2 ring-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.8)]' : '';

    pieceEl.className = `piece piece-${player.toLowerCase()} rounded-full w-full h-full flex items-center justify-center font-black transition-all duration-300 relative z-10 ${
      player === 'A'
        ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white border-2 border-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.8)]'
        : 'bg-gradient-to-br from-red-400 to-red-600 text-white border-2 border-red-300 shadow-[0_0_15px_rgba(239,68,68,0.8)]'
    } ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''} ${yourPieceBorder}`;
    pieceEl.style.fontSize = 'clamp(0.25rem, 1.5vw, 0.6rem)'; // Responsive text size - matches ghost pieces
    pieceEl.textContent = piece.id.toString();
    pieceEl.dataset.pieceId = piece.id.toString();
    pieceEl.dataset.player = player;
    pieceEl.dataset.gridX = piece.x.toString();
    pieceEl.dataset.gridY = piece.y.toString();

    // Check if piece moved (for animations)
    if (this.enableAnimations && prevState) {
      const prevPlayer = prevState.players[player];
      if (prevPlayer) {
        const prevPiece = prevPlayer.pieces.find(p => p.id === piece.id);
        if (prevPiece && (prevPiece.x !== piece.x || prevPiece.y !== piece.y)) {
          // Piece moved - animate it
          pieceEl.classList.add('animate-piece-move');
          setTimeout(() => pieceEl.classList.remove('animate-piece-move'), 400);
        }
      }
    }

    // Add drag handlers only for player's own pieces
    if (isDraggable) {
      pieceEl.addEventListener('mousedown', (e) => this.dragDropHandler.handlePieceDragStart(e, piece, player));
    }

    cell.appendChild(pieceEl);
  }

  private updateCommandQueues(): void {
    if (!this.gameState) return;

    const yourQueueEl = this.container.querySelector('#yourQueue') as HTMLElement;
    const enemyQueueEl = this.container.querySelector('#enemyQueue') as HTMLElement;
    const enemySection = this.container.querySelector('#enemyQueueSection') as HTMLElement;

    // Show/hide enemy queue based on options
    if (enemySection) {
      if (this.showEnemyCommands) {
        enemySection.style.display = 'block';
      } else {
        enemySection.style.display = 'none';
        return;
      }
    }

    // Determine which player is "you" and which is "enemy"
    const yourPlayer = this.playerPerspective === 'spectator' ? 'A' : this.playerPerspective;
    const enemyPlayer = yourPlayer === 'A' ? 'B' : 'A';

    // Update your commands
    const yourCommands = this.getPlayerCommands(yourPlayer);
    if (yourQueueEl) {
      yourQueueEl.innerHTML = yourCommands.length > 0 ?
        yourCommands.map(cmd => `<div class="bg-white/10 px-2 py-1 rounded mb-1">${cmd}</div>`).join('') :
        'No commands queued';
    }

    // Update enemy commands (obfuscated)
    const enemyCommands = this.getObfuscatedEnemyCommands(enemyPlayer);
    if (enemyQueueEl) {
      enemyQueueEl.innerHTML = enemyCommands.length > 0 ?
        enemyCommands.map(cmd => `<div class="bg-orange-200/20 text-white/70 px-2 py-1 rounded mb-1">${cmd}</div>`).join('') :
        'Enemy is planning...';
    }
  }

  private getPlayerCommands(player: 'A' | 'B'): string[] {
    if (!this.gameState) return [];

    const commands: string[] = [];
    const commandQueue = this.gameState.commandQueue;

    Object.keys(commandQueue).forEach(round => {
      const roundCommands = commandQueue[round];
      const playerKey = `player${player}` as keyof typeof roundCommands;

      if (roundCommands[playerKey] && roundCommands[playerKey]!.length > 0) {
        const cmdList = roundCommands[playerKey]!.map(cmd =>
          `P${cmd.pieceId}→${cmd.direction}(${cmd.distance})`
        ).join(', ');
        commands.push(`Round ${round}: ${cmdList}`);
      }
    });

    return commands;
  }

  private getObfuscatedEnemyCommands(enemyPlayer: 'A' | 'B'): string[] {
    if (!this.gameState) return [];

    const commands: string[] = [];
    const commandQueue = this.gameState.commandQueue;

    Object.keys(commandQueue).forEach(round => {
      const roundCommands = commandQueue[round];
      const playerKey = `player${enemyPlayer}` as keyof typeof roundCommands;

      if (roundCommands[playerKey] && roundCommands[playerKey]!.length > 0) {
        const cmdCount = roundCommands[playerKey]!.length;
        // Show that enemy has commands but obfuscate details
        commands.push(`Round ${round}: ${cmdCount} command${cmdCount > 1 ? 's' : ''} planned`);
      }
    });

    return commands;
  }

  // Public API methods
  setPlayerPerspective(player: 'A' | 'B'): void {
    this.playerPerspective = player;
    this.updateCommandQueues();
  }

  toggleEnemyCommands(show: boolean): void {
    this.showEnemyCommands = show;
    this.updateCommandQueues();
  }

  highlightCell(x: number, y: number, className = 'highlight'): void {
    const cell = this.container.querySelector(`#cell-${x}-${y}`) as HTMLElement;
    if (cell) {
      cell.classList.add(className);
      setTimeout(() => cell.classList.remove(className), 1000);
    }
  }

  private redrawQueuedGhosts(prevState: GameState | null): void {
    if (!this.gameState) return;

    const queuedMoves = this.dragDropHandler.getQueuedMoves();

    // For each queued move, check if the piece has moved yet
    queuedMoves.forEach((move, pieceId) => {
      const playerData = this.gameState!.players[move.player];
      if (!playerData) {
        queuedMoves.delete(pieceId);
        return;
      }

      const piece = playerData.pieces.find(p => p.id === pieceId);
      if (!piece || !piece.alive) {
        queuedMoves.delete(pieceId);
        return;
      }

      // Calculate expected destination
      let destX = piece.x;
      let destY = piece.y;

      switch (move.direction) {
        case 'up':
          destY = Math.max(0, piece.y - move.distance);
          break;
        case 'down':
          destY = Math.min(10, piece.y + move.distance);
          break;
        case 'left':
          destX = Math.max(0, piece.x - move.distance);
          break;
        case 'right':
          destX = Math.min(10, piece.x + move.distance);
          break;
      }

      // Check if piece has already moved (by comparing with prev state)
      if (prevState) {
        const prevPlayerData = prevState.players[move.player];
        const prevPiece = prevPlayerData?.pieces.find(p => p.id === pieceId);

        if (prevPiece && (prevPiece.x !== piece.x || prevPiece.y !== piece.y)) {
          // Piece has moved - remove queued move and its ghost
          queuedMoves.delete(pieceId);
          // Remove the ghost from DOM
          const ghost = this.container.querySelector(`.ghost-preview[data-piece-id="${pieceId}"]`);
          if (ghost) ghost.remove();
          return;
        }
      }

      // Re-draw ghost at destination
      this.boardRenderer.showGhostInCell(destX, destY, pieceId, move.player);
    });
  }

  private renderMiniBoard(round: RoundHistory): string {
    if (!round.piecesBeforeMove) return '';

    const GRID_SIZE = 11;
    const CELL_SIZE = 20; // pixels

    // Calculate piece movements
    const movements = new Map<number, { from: {x: number, y: number}, to: {x: number, y: number}, player: 'A' | 'B' }>();

    // Process Player A moves
    round.playerAMoves.forEach(move => {
      const piece = round.piecesBeforeMove!.A.find(p => p.id === move.pieceId);
      if (piece && piece.alive) {
        let toX = piece.x;
        let toY = piece.y;

        switch (move.direction) {
          case 'up': toY -= move.distance; break;
          case 'down': toY += move.distance; break;
          case 'left': toX -= move.distance; break;
          case 'right': toX += move.distance; break;
        }

        // Clamp to board
        toX = Math.max(0, Math.min(GRID_SIZE - 1, toX));
        toY = Math.max(0, Math.min(GRID_SIZE - 1, toY));

        movements.set(piece.id, { from: {x: piece.x, y: piece.y}, to: {x: toX, y: toY}, player: 'A' });
      }
    });

    // Process Player B moves
    round.playerBMoves.forEach(move => {
      const piece = round.piecesBeforeMove!.B.find(p => p.id === move.pieceId);
      if (piece && piece.alive) {
        let toX = piece.x;
        let toY = piece.y;

        switch (move.direction) {
          case 'up': toY -= move.distance; break;
          case 'down': toY += move.distance; break;
          case 'left': toX -= move.distance; break;
          case 'right': toX += move.distance; break;
        }

        // Clamp to board
        toX = Math.max(0, Math.min(GRID_SIZE - 1, toX));
        toY = Math.max(0, Math.min(GRID_SIZE - 1, toY));

        movements.set(100 + piece.id, { from: {x: piece.x, y: piece.y}, to: {x: toX, y: toY}, player: 'B' });
      }
    });

    const boardSize = GRID_SIZE * CELL_SIZE;

    // Build SVG
    let svg = `<svg width="${boardSize}" height="${boardSize}" class="border border-white/20 rounded">`;

    // Draw territory backgrounds
    svg += `<rect x="0" y="${6 * CELL_SIZE}" width="${boardSize}" height="${5 * CELL_SIZE}" fill="rgba(59, 130, 246, 0.15)"/>`; // Blue territory
    svg += `<rect x="0" y="0" width="${boardSize}" height="${5 * CELL_SIZE}" fill="rgba(239, 68, 68, 0.15)"/>`; // Red territory
    svg += `<rect x="0" y="${5 * CELL_SIZE}" width="${boardSize}" height="${CELL_SIZE}" fill="rgba(128, 128, 128, 0.1)"/>`; // Neutral

    // Draw grid
    for (let i = 0; i <= GRID_SIZE; i++) {
      svg += `<line x1="${i * CELL_SIZE}" y1="0" x2="${i * CELL_SIZE}" y2="${boardSize}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
      svg += `<line x1="0" y1="${i * CELL_SIZE}" x2="${boardSize}" y2="${i * CELL_SIZE}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
    }

    // Draw arrows for movements
    movements.forEach((movement, id) => {
      const fromX = movement.from.x * CELL_SIZE + CELL_SIZE / 2;
      const fromY = movement.from.y * CELL_SIZE + CELL_SIZE / 2;
      const toX = movement.to.x * CELL_SIZE + CELL_SIZE / 2;
      const toY = movement.to.y * CELL_SIZE + CELL_SIZE / 2;

      const color = movement.player === 'A' ? '#3b82f6' : '#ef4444';
      const strokeWidth = 2;

      // Draw arrow line
      svg += `<line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="${color}" stroke-width="${strokeWidth}" marker-end="url(#arrowhead-${movement.player})"/>`;
    });

    // Define arrowhead markers
    svg += `<defs>
      <marker id="arrowhead-A" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
        <polygon points="0 0, 6 3, 0 6" fill="#3b82f6" />
      </marker>
      <marker id="arrowhead-B" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
        <polygon points="0 0, 6 3, 0 6" fill="#ef4444" />
      </marker>
    </defs>`;

    // Draw pieces at starting positions
    round.piecesBeforeMove.A.forEach(piece => {
      if (piece.alive) {
        const x = piece.x * CELL_SIZE + CELL_SIZE / 2;
        const y = piece.y * CELL_SIZE + CELL_SIZE / 2;
        svg += `<circle cx="${x}" cy="${y}" r="${CELL_SIZE / 3}" fill="#3b82f6" stroke="white" stroke-width="1"/>`;
        svg += `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" fill="white" font-weight="bold">${piece.id}</text>`;
      }
    });

    round.piecesBeforeMove.B.forEach(piece => {
      if (piece.alive) {
        const x = piece.x * CELL_SIZE + CELL_SIZE / 2;
        const y = piece.y * CELL_SIZE + CELL_SIZE / 2;
        svg += `<circle cx="${x}" cy="${y}" r="${CELL_SIZE / 3}" fill="#ef4444" stroke="white" stroke-width="1"/>`;
        svg += `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" fill="white" font-weight="bold">${piece.id}</text>`;
      }
    });

    svg += `</svg>`;

    return svg;
  }

  private renderMinimaxBoard(round: RoundHistory): string {
    if (!round.aiAnalysis || !round.piecesBeforeMove) return '';

    // Create a temporary round object with the minimax moves
    const minimaxRound: RoundHistory = {
      round: round.round,
      playerAMoves: round.aiAnalysis.predictedEnemyMoves, // Enemy's predicted moves (Blue is player A)
      playerBMoves: round.aiAnalysis.chosenMoves,         // AI's chosen moves (Red is player B)
      piecesBeforeMove: round.piecesBeforeMove
    };

    // Reuse the existing mini board renderer
    return this.renderMiniBoard(minimaxRound);
  }

  showAIAnalysis(history: GameHistory): void {

    // Minimax AI scoring rules (displayed at beginning of timeline)
    const systemPrompt = `📊 Minimax AI Scoring Rules:

🏆 Win/Loss: ±10,000 points

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

🛡️ Flag Defense:
  • Each defender in our flag column: +300
  • Each enemy defender blocking their flag: -300`;

    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-gradient-to-br from-purple-900 to-slate-900 rounded-2xl border-4 border-cyan-400 max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="p-6 border-b-2 border-cyan-400 flex justify-between items-center">
          <h2 class="text-3xl font-black text-cyan-300">🤖 AI Analysis Timeline</h2>
          <button id="closeModal" class="text-white hover:text-red-400 text-2xl font-bold">✕</button>
        </div>

        <!-- Timeline -->
        <div id="timeline" class="flex-1 overflow-x-auto overflow-y-auto p-6">
          <div class="flex gap-6" style="min-width: min-content;">
            <!-- System Prompt Panel (Round 0) -->
            <div class="flex-shrink-0 w-[600px] bg-gradient-to-br from-indigo-900/50 to-slate-800/50 rounded-xl border-2 border-indigo-400 p-6">
              <div class="text-2xl font-bold text-indigo-300 mb-4">📜 System Prompt</div>
              <div class="text-sm text-white/90 font-mono whitespace-pre-wrap leading-relaxed">${systemPrompt}</div>
            </div>

            ${history.map((round) => `
              <div class="flex-shrink-0 w-[600px] bg-slate-800/50 rounded-xl border-2 border-purple-400 p-6">
                <div class="text-xl font-bold text-cyan-300 mb-3">Round ${round.round}</div>

                <!-- Mini Board Visualization -->
                <div class="mb-3 flex justify-center">
                  ${this.renderMiniBoard(round)}
                </div>

                <!-- Actual Position Score - Full Breakdown (MOVED TO TOP) -->
                ${round.actualScoreAfterMove ? `
                  <div class="mb-4 p-4 bg-amber-900/20 rounded-lg border border-amber-500/30">
                    <div class="font-bold text-amber-300 mb-3">📊 Actual Position Score (After Round ${round.round})</div>

                    <div class="grid grid-cols-2 gap-4">
                      <!-- Blue Team (A) Breakdown -->
                      <div class="bg-blue-900/30 p-3 rounded border border-blue-500/30">
                        <div class="font-bold text-blue-300 mb-2">Blue Team (A)</div>
                        <div class="text-xs space-y-1 text-white/80">
                          ${round.actualScoreAfterMove.A.weHaveFlag ? `<div>✓ We have their flag: <span class="text-green-400">+${round.actualScoreAfterMove.A.weHaveFlag}</span></div>` : ''}
                          ${round.actualScoreAfterMove.A.theyHaveFlag ? `<div>✗ They have our flag: <span class="text-red-400">${round.actualScoreAfterMove.A.theyHaveFlag}</span></div>` : ''}
                          ${round.actualScoreAfterMove.A.weOnTheirFlag ? `<div>↗ On their flag: <span class="text-green-400">+${round.actualScoreAfterMove.A.weOnTheirFlag}</span></div>` : ''}
                          ${round.actualScoreAfterMove.A.theyOnOurFlag ? `<div>↘ On our flag: <span class="text-red-400">${round.actualScoreAfterMove.A.theyOnOurFlag}</span></div>` : ''}
                          ${round.actualScoreAfterMove.A.weInTheirSafeZone ? `<div>⚡ In their safe zone: <span class="text-green-400">+${round.actualScoreAfterMove.A.weInTheirSafeZone}</span></div>` : ''}
                          ${round.actualScoreAfterMove.A.theyInOurSafeZone ? `<div>⚠ In our safe zone: <span class="text-red-400">${round.actualScoreAfterMove.A.theyInOurSafeZone}</span></div>` : ''}
                          ${round.actualScoreAfterMove.A.weOnBackWall ? `<div>🎯 On back wall: <span class="text-green-400">+${round.actualScoreAfterMove.A.weOnBackWall}</span></div>` : ''}
                          ${round.actualScoreAfterMove.A.theyOnBackWall ? `<div>🛡 They on back wall: <span class="text-red-400">${round.actualScoreAfterMove.A.theyOnBackWall}</span></div>` : ''}
                          ${round.actualScoreAfterMove.A.pieceAdvantage !== 0 ? `<div>👥 Piece advantage: <span class="${round.actualScoreAfterMove.A.pieceAdvantage > 0 ? 'text-green-400' : 'text-red-400'}">${round.actualScoreAfterMove.A.pieceAdvantage > 0 ? '+' : ''}${round.actualScoreAfterMove.A.pieceAdvantage}</span></div>` : ''}
                          ${round.actualScoreAfterMove.A.capturesThisRound !== 0 ? `<div>⚔️ Captures this round: <span class="${round.actualScoreAfterMove.A.capturesThisRound > 0 ? 'text-green-400' : 'text-red-400'}">${round.actualScoreAfterMove.A.capturesThisRound > 0 ? '+' : ''}${round.actualScoreAfterMove.A.capturesThisRound}</span></div>` : ''}
                        </div>
                        <div class="mt-2 pt-2 border-t border-blue-500/30">
                          <span class="text-xs text-white/70">Total: </span>
                          <span class="font-bold text-lg ${round.actualScoreAfterMove.A.total > 0 ? 'text-green-400' : round.actualScoreAfterMove.A.total < 0 ? 'text-red-400' : 'text-white'}">
                            ${round.actualScoreAfterMove.A.total > 0 ? '+' : ''}${round.actualScoreAfterMove.A.total}
                          </span>
                        </div>
                      </div>

                      <!-- Red Team (B) Breakdown -->
                      <div class="bg-red-900/30 p-3 rounded border border-red-500/30">
                        <div class="font-bold text-red-300 mb-2">Red Team (B)</div>
                        <div class="text-xs space-y-1 text-white/80">
                          ${round.actualScoreAfterMove.B.weHaveFlag ? `<div>✓ We have their flag: <span class="text-green-400">+${round.actualScoreAfterMove.B.weHaveFlag}</span></div>` : ''}
                          ${round.actualScoreAfterMove.B.theyHaveFlag ? `<div>✗ They have our flag: <span class="text-red-400">${round.actualScoreAfterMove.B.theyHaveFlag}</span></div>` : ''}
                          ${round.actualScoreAfterMove.B.weOnTheirFlag ? `<div>↗ On their flag: <span class="text-green-400">+${round.actualScoreAfterMove.B.weOnTheirFlag}</span></div>` : ''}
                          ${round.actualScoreAfterMove.B.theyOnOurFlag ? `<div>↘ On our flag: <span class="text-red-400">${round.actualScoreAfterMove.B.theyOnOurFlag}</span></div>` : ''}
                          ${round.actualScoreAfterMove.B.weInTheirSafeZone ? `<div>⚡ In their safe zone: <span class="text-green-400">+${round.actualScoreAfterMove.B.weInTheirSafeZone}</span></div>` : ''}
                          ${round.actualScoreAfterMove.B.theyInOurSafeZone ? `<div>⚠ In our safe zone: <span class="text-red-400">${round.actualScoreAfterMove.B.theyInOurSafeZone}</span></div>` : ''}
                          ${round.actualScoreAfterMove.B.weOnBackWall ? `<div>🎯 On back wall: <span class="text-green-400">+${round.actualScoreAfterMove.B.weOnBackWall}</span></div>` : ''}
                          ${round.actualScoreAfterMove.B.theyOnBackWall ? `<div>🛡 They on back wall: <span class="text-red-400">${round.actualScoreAfterMove.B.theyOnBackWall}</span></div>` : ''}
                          ${round.actualScoreAfterMove.B.pieceAdvantage !== 0 ? `<div>👥 Piece advantage: <span class="${round.actualScoreAfterMove.B.pieceAdvantage > 0 ? 'text-green-400' : 'text-red-400'}">${round.actualScoreAfterMove.B.pieceAdvantage > 0 ? '+' : ''}${round.actualScoreAfterMove.B.pieceAdvantage}</span></div>` : ''}
                          ${round.actualScoreAfterMove.B.capturesThisRound !== 0 ? `<div>⚔️ Captures this round: <span class="${round.actualScoreAfterMove.B.capturesThisRound > 0 ? 'text-green-400' : 'text-red-400'}">${round.actualScoreAfterMove.B.capturesThisRound > 0 ? '+' : ''}${round.actualScoreAfterMove.B.capturesThisRound}</span></div>` : ''}
                        </div>
                        <div class="mt-2 pt-2 border-t border-red-500/30">
                          <span class="text-xs text-white/70">Total: </span>
                          <span class="font-bold text-lg ${round.actualScoreAfterMove.B.total > 0 ? 'text-green-400' : round.actualScoreAfterMove.B.total < 0 ? 'text-red-400' : 'text-white'}">
                            ${round.actualScoreAfterMove.B.total > 0 ? '+' : ''}${round.actualScoreAfterMove.B.total}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ` : ''}

                ${round.playerBMoves && round.playerBMoves.length > 0 ? `
                  <div class="mb-4">
                    <div class="text-base font-bold text-red-300 mb-2">🔴 AI Moves:</div>
                    ${round.playerBMoves.map(m => `
                      <div class="text-sm text-white/90">P${m.pieceId}: ${m.direction} ${m.distance}</div>
                    `).join('')}
                  </div>
                ` : ''}

                ${(() => {
                  return round.aiAnalysis ? `
                  <div class="mb-4 pb-4 border-b border-purple-400">
                    <div class="text-base font-bold text-yellow-300 mb-3">📊 AI Analysis Scoreboard</div>

                    <!-- Metadata -->
                    <div class="grid grid-cols-3 gap-2 mb-4 text-xs text-white/70">
                      <div>⏱️ ${round.aiAnalysis.executionTime}ms</div>
                      <div>🎲 ${round.aiAnalysis.scenariosEvaluated.toLocaleString()} scenarios</div>
                      <div>🎯 Worst-case: ${round.aiAnalysis.worstCaseScore}</div>
                    </div>

                    <!-- Nash Strategic Matchup -->
                    <div class="mb-4 p-3 bg-purple-900/20 rounded-lg border border-purple-500/30">
                      <div class="font-bold text-purple-300 mb-2">🎯 Nash Strategic Matchup</div>
                      <div class="text-xs text-white/60 mb-2">AI's chosen move vs predicted enemy best response (${round.aiAnalysis.similarMoves} similar options)</div>
                      ${this.renderMinimaxBoard(round)}
                    </div>

                    <!-- Predicted Position Score Breakdown -->
                    <div class="mb-4 p-4 bg-slate-900/50 rounded-lg border border-cyan-500/30">
                      <div class="font-bold text-cyan-300 mb-3">📊 Predicted Position Score</div>
                      <div class="text-xs text-white/60 mb-3">What AI thought the board would be worth after these moves</div>

                      <div class="grid grid-cols-2 gap-4">
                        <!-- Blue Team (A) Predicted Breakdown -->
                        <div class="bg-blue-900/30 p-3 rounded border border-blue-500/30">
                          <div class="font-bold text-blue-300 mb-2">Blue Team (A)</div>
                          <div class="text-xs space-y-1 text-white/80">
                            ${round.aiAnalysis.predictedScoreBreakdown.A.weHaveFlag ? `<div>✓ We have their flag: <span class="text-green-400">+${round.aiAnalysis.predictedScoreBreakdown.A.weHaveFlag}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.A.theyHaveFlag ? `<div>✗ They have our flag: <span class="text-red-400">${round.aiAnalysis.predictedScoreBreakdown.A.theyHaveFlag}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.A.weOnTheirFlag ? `<div>↗ On their flag: <span class="text-green-400">+${round.aiAnalysis.predictedScoreBreakdown.A.weOnTheirFlag}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.A.theyOnOurFlag ? `<div>↘ On our flag: <span class="text-red-400">${round.aiAnalysis.predictedScoreBreakdown.A.theyOnOurFlag}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.A.weInTheirSafeZone ? `<div>⚡ In their safe zone: <span class="text-green-400">+${round.aiAnalysis.predictedScoreBreakdown.A.weInTheirSafeZone}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.A.theyInOurSafeZone ? `<div>⚠ In our safe zone: <span class="text-red-400">${round.aiAnalysis.predictedScoreBreakdown.A.theyInOurSafeZone}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.A.weOnBackWall ? `<div>🎯 On back wall: <span class="text-green-400">+${round.aiAnalysis.predictedScoreBreakdown.A.weOnBackWall}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.A.theyOnBackWall ? `<div>🛡 They on back wall: <span class="text-red-400">${round.aiAnalysis.predictedScoreBreakdown.A.theyOnBackWall}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.A.pieceAdvantage !== 0 ? `<div>👥 Piece advantage: <span class="${round.aiAnalysis.predictedScoreBreakdown.A.pieceAdvantage > 0 ? 'text-green-400' : 'text-red-400'}">${round.aiAnalysis.predictedScoreBreakdown.A.pieceAdvantage > 0 ? '+' : ''}${round.aiAnalysis.predictedScoreBreakdown.A.pieceAdvantage}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.A.capturesThisRound !== 0 ? `<div>⚔️ Captures this round: <span class="${round.aiAnalysis.predictedScoreBreakdown.A.capturesThisRound > 0 ? 'text-green-400' : 'text-red-400'}">${round.aiAnalysis.predictedScoreBreakdown.A.capturesThisRound > 0 ? '+' : ''}${round.aiAnalysis.predictedScoreBreakdown.A.capturesThisRound}</span></div>` : ''}
                          </div>
                          <div class="mt-2 pt-2 border-t border-blue-500/30">
                            <span class="text-xs text-white/70">Total: </span>
                            <span class="font-bold text-lg ${round.aiAnalysis.predictedScoreBreakdown.A.total > 0 ? 'text-green-400' : round.aiAnalysis.predictedScoreBreakdown.A.total < 0 ? 'text-red-400' : 'text-white'}">
                              ${round.aiAnalysis.predictedScoreBreakdown.A.total > 0 ? '+' : ''}${round.aiAnalysis.predictedScoreBreakdown.A.total}
                            </span>
                          </div>
                        </div>

                        <!-- Red Team (B) Predicted Breakdown -->
                        <div class="bg-red-900/30 p-3 rounded border border-red-500/30">
                          <div class="font-bold text-red-300 mb-2">Red Team (B)</div>
                          <div class="text-xs space-y-1 text-white/80">
                            ${round.aiAnalysis.predictedScoreBreakdown.B.weHaveFlag ? `<div>✓ We have their flag: <span class="text-green-400">+${round.aiAnalysis.predictedScoreBreakdown.B.weHaveFlag}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.B.theyHaveFlag ? `<div>✗ They have our flag: <span class="text-red-400">${round.aiAnalysis.predictedScoreBreakdown.B.theyHaveFlag}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.B.weOnTheirFlag ? `<div>↗ On their flag: <span class="text-green-400">+${round.aiAnalysis.predictedScoreBreakdown.B.weOnTheirFlag}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.B.theyOnOurFlag ? `<div>↘ On our flag: <span class="text-red-400">${round.aiAnalysis.predictedScoreBreakdown.B.theyOnOurFlag}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.B.weInTheirSafeZone ? `<div>⚡ In their safe zone: <span class="text-green-400">+${round.aiAnalysis.predictedScoreBreakdown.B.weInTheirSafeZone}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.B.theyInOurSafeZone ? `<div>⚠ In our safe zone: <span class="text-red-400">${round.aiAnalysis.predictedScoreBreakdown.B.theyInOurSafeZone}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.B.weOnBackWall ? `<div>🎯 On back wall: <span class="text-green-400">+${round.aiAnalysis.predictedScoreBreakdown.B.weOnBackWall}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.B.theyOnBackWall ? `<div>🛡 They on back wall: <span class="text-red-400">${round.aiAnalysis.predictedScoreBreakdown.B.theyOnBackWall}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.B.pieceAdvantage !== 0 ? `<div>👥 Piece advantage: <span class="${round.aiAnalysis.predictedScoreBreakdown.B.pieceAdvantage > 0 ? 'text-green-400' : 'text-red-400'}">${round.aiAnalysis.predictedScoreBreakdown.B.pieceAdvantage > 0 ? '+' : ''}${round.aiAnalysis.predictedScoreBreakdown.B.pieceAdvantage}</span></div>` : ''}
                            ${round.aiAnalysis.predictedScoreBreakdown.B.capturesThisRound !== 0 ? `<div>⚔️ Captures this round: <span class="${round.aiAnalysis.predictedScoreBreakdown.B.capturesThisRound > 0 ? 'text-green-400' : 'text-red-400'}">${round.aiAnalysis.predictedScoreBreakdown.B.capturesThisRound > 0 ? '+' : ''}${round.aiAnalysis.predictedScoreBreakdown.B.capturesThisRound}</span></div>` : ''}
                          </div>
                          <div class="mt-2 pt-2 border-t border-red-500/30">
                            <span class="text-xs text-white/70">Total: </span>
                            <span class="font-bold text-lg ${round.aiAnalysis.predictedScoreBreakdown.B.total > 0 ? 'text-green-400' : round.aiAnalysis.predictedScoreBreakdown.B.total < 0 ? 'text-red-400' : 'text-white'}">
                              ${round.aiAnalysis.predictedScoreBreakdown.B.total > 0 ? '+' : ''}${round.aiAnalysis.predictedScoreBreakdown.B.total}
                            </span>
                          </div>
                        </div>
                      </div>

                      <!-- Final Predicted Score -->
                      <div class="mt-3 text-center">
                        <span class="text-sm text-white/70">Final Score (worst case for AI): </span>
                        <span class="font-bold text-lg ${round.aiAnalysis.finalScore > 0 ? 'text-green-400' : round.aiAnalysis.finalScore < 0 ? 'text-red-400' : 'text-white'}">
                          ${round.aiAnalysis.finalScore > 0 ? '+' : ''}${round.aiAnalysis.finalScore}
                        </span>
                      </div>
                    </div>
                  </div>
                ` : round.aiReasoning ? `
                  <div class="mb-4 pb-4 border-b border-purple-400">
                    <div class="text-base font-bold text-yellow-300 mb-2">💭 AI Reasoning:</div>
                    <div class="text-sm text-white/90 italic leading-relaxed">${round.aiReasoning}</div>
                  </div>
                ` : '';
                })()}

                ${round.aiPrompt ? `
                  <div class="mt-4">
                    <div class="text-base font-bold text-cyan-300 mb-2">📋 User Prompt:</div>
                    <div class="text-sm text-white/80 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto bg-black/30 p-3 rounded">${round.aiPrompt}</div>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close button handler
    modal.querySelector('#closeModal')?.addEventListener('click', () => {
      modal.remove();
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

}