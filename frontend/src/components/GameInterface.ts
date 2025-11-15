import { BattleArena } from './BattleArena';
import type { GameState, AvailableGame, WebSocketMessage } from '../types/game';

class GameInterface {
  private containerId: string;
  private serverUrl: string;
  private socket: WebSocket | null = null;
  private battleArena: BattleArena | null = null;
  private currentRoom: string | null = null;
  private availableGames: AvailableGame[] = [];
  private playerPerspective: 'A' | 'B' = 'A';

  // DOM elements
  private lobbyContainer!: HTMLElement;
  private gameContainer!: HTMLElement;
  private createGameBtn!: HTMLButtonElement;
  private gamesList!: HTMLElement;
  private lobbyStatus!: HTMLElement;

  constructor(containerId: string, serverUrl: string) {
    this.containerId = containerId;
    this.serverUrl = serverUrl;
    this.init();
  }

  private init(): void {
    this.createHTML();
    this.attachEventListeners();
    this.connectWebSocket();
  }

  private createHTML(): void {
    const container = document.getElementById(this.containerId);
    if (!container) {
      throw new Error(`Container with id "${this.containerId}" not found`);
    }

    container.innerHTML = `
      <div class="min-h-screen bg-gradient-to-br from-game-background via-purple-900 to-game-background p-4">
        <!-- Lobby Interface -->
        <div id="lobbyContainer" class="max-w-4xl mx-auto">
          <div class="text-center mb-8">
            <h1 class="text-5xl font-bold text-game-primary mb-4">🎮 Movement Commander</h1>
            <p class="text-game-accent text-lg">Real-time strategy battles await!</p>
          </div>

          <div class="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 shadow-2xl p-8 text-white">
            <div class="text-center mb-6">
              <div id="lobbyStatus" class="text-game-accent font-medium">Ready to battle!</div>
            </div>

            <div class="create-game-section mb-8 text-center">
              <button id="createGameBtn" class="bg-game-primary hover:bg-game-secondary text-black font-bold py-3 px-8 rounded-xl transition-all duration-200 hover:scale-105 shadow-lg">
                + Create New Game
              </button>
            </div>

            <div class="games-list-container">
              <h3 class="text-xl font-bold mb-4 text-center">🎯 Available Games</h3>
              <div id="gamesList" class="space-y-3">
                <div class="loading-games flex items-center justify-center py-8">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-game-primary mr-3"></div>
                  <span class="text-white/70">Loading available games...</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Game Interface -->
        <div id="gameContainer" class="hidden">
          <div id="battleArena"></div>
          <div class="text-center mt-6">
            <button id="leaveGameBtn" class="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg transition-all duration-200">
              Leave Game
            </button>
          </div>
        </div>
      </div>
    `;

    this.assignDOMElements();
  }

  private assignDOMElements(): void {
    this.lobbyContainer = document.getElementById('lobbyContainer')!;
    this.gameContainer = document.getElementById('gameContainer')!;
    this.createGameBtn = document.getElementById('createGameBtn')! as HTMLButtonElement;
    this.gamesList = document.getElementById('gamesList')!;
    this.lobbyStatus = document.getElementById('lobbyStatus')!;
  }

  private attachEventListeners(): void {
    this.createGameBtn.addEventListener('click', () => this.createNewGame());

    document.getElementById('leaveGameBtn')?.addEventListener('click', () => this.leaveGame());
  }

  private connectWebSocket(): void {
    try {
      this.socket = new WebSocket(this.serverUrl);

      this.socket.onopen = () => {
        console.log('Connected to Movement Commander server');
        this.lobbyStatus.textContent = 'Connected! Loading games...';
        this.refreshGamesList();
      };

      this.socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.socket.onclose = () => {
        console.log('Disconnected from server');
        this.lobbyStatus.textContent = 'Disconnected - attempting to reconnect...';
        this.showLobby();
        // Attempt to reconnect after 3 seconds
        setTimeout(() => this.connectWebSocket(), 3000);
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.lobbyStatus.textContent = 'Connection error - retrying...';
      };

    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      this.lobbyStatus.textContent = 'Failed to connect to server';
    }
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'roomCreated':
        this.currentRoom = message.payload.roomCode;
        this.lobbyStatus.textContent = `Created room ${this.currentRoom} - waiting for opponent...`;
        this.refreshGamesList();
        break;

      case 'roomJoined':
        this.currentRoom = message.payload.roomCode;
        this.playerPerspective = message.payload.playerSide || 'A';
        this.lobbyStatus.textContent = `Joined room ${this.currentRoom}`;
        this.showGame();
        break;

      case 'gamesList':
        this.availableGames = message.payload.games || [];
        this.renderGamesList();
        break;

      case 'gameState':
        if (this.battleArena) {
          this.battleArena.updateGameState(message.payload as GameState);
        }
        break;

      case 'error':
        console.error('Server error:', message.payload.message);
        this.lobbyStatus.textContent = `Error: ${message.payload.message}`;
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private createNewGame(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.lobbyStatus.textContent = 'Not connected to server';
      return;
    }

    this.lobbyStatus.textContent = 'Creating new game...';
    this.createGameBtn.disabled = true;

    this.socket.send(JSON.stringify({
      type: 'createRoom',
      payload: {}
    }));

    // Re-enable button after a delay
    setTimeout(() => {
      this.createGameBtn.disabled = false;
    }, 2000);
  }

  public joinGame(roomCode: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.lobbyStatus.textContent = 'Not connected to server';
      return;
    }

    this.lobbyStatus.textContent = `Joining game ${roomCode}...`;

    this.socket.send(JSON.stringify({
      type: 'joinRoom',
      payload: { roomCode }
    }));
  }

  private leaveGame(): void {
    if (this.currentRoom && this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'leaveRoom',
        payload: { roomCode: this.currentRoom }
      }));
    }

    this.currentRoom = null;
    this.showLobby();
    this.refreshGamesList();
  }

  private refreshGamesList(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    this.socket.send(JSON.stringify({
      type: 'listGames',
      payload: {}
    }));
  }

  private renderGamesList(): void {
    if (this.availableGames.length === 0) {
      this.gamesList.innerHTML = `
        <div class="text-center py-8 text-white/70">
          <div class="mb-2">No games available</div>
          <div class="text-sm">Create a new game to get started!</div>
        </div>
      `;
      return;
    }

    const gamesHTML = this.availableGames.map(game => {
      const isOwnGame = game.roomCode === this.currentRoom;
      const clickHandler = !isOwnGame ? `onclick="window.gameInterface.joinGame('${game.roomCode}')"` : '';

      return `
        <div class="game-item ${isOwnGame ? 'own-game animate-pulse-waiting' : 'cursor-pointer hover:bg-white/10'}
                bg-white/5 border border-white/20 rounded-lg p-4 transition-all duration-200
                ${!isOwnGame ? 'hover:scale-105 hover:border-game-primary/50' : ''}"
             ${clickHandler}>
          <div class="game-info">
            <div class="game-title font-semibold text-lg mb-1">
              ${isOwnGame ? '🎮 Your Game' : '⚔️ Battle Arena'} - Room ${game.roomCode}
            </div>
            <div class="game-meta text-sm text-white/70">
              Players: ${game.playerCount}/2 • Status: ${game.status}
              ${isOwnGame ? ' • Waiting for opponent...' : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.gamesList.innerHTML = gamesHTML;
  }

  private showLobby(): void {
    this.lobbyContainer.classList.remove('hidden');
    this.gameContainer.classList.add('hidden');
  }

  private showGame(): void {
    this.lobbyContainer.classList.add('hidden');
    this.gameContainer.classList.remove('hidden');

    // Initialize battle arena if not already done
    if (!this.battleArena) {
      this.battleArena = new BattleArena('battleArena', {
        playerPerspective: this.playerPerspective,
        showEnemyCommands: true,
        enableAnimations: true,
        onPieceClick: (piece) => {
          console.log('Piece clicked:', piece);
          // TODO: Implement piece selection and command input
        }
      });
    } else {
      this.battleArena.setPlayerPerspective(this.playerPerspective);
    }
  }

  // Auto-refresh games list every 2 seconds
}

// Make GameInterface globally accessible for HTML onclick handlers
declare global {
  interface Window {
    gameInterface: GameInterface;
  }
}

// Export for use in main.ts
export { GameInterface };