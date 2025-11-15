import './style.css';
import { BattleArena } from './components/BattleArena';
import type { GameState } from './types/game';

// Dual interface - TWO IDENTICAL instances of the same component for debugging
document.addEventListener('DOMContentLoaded', () => {
  try {
    const container = document.getElementById('dual-app');
    if (!container) {
      throw new Error('Dual container not found');
    }

    // Create side-by-side layout for TWO IDENTICAL components
    container.innerHTML = `
      <div class="min-h-screen bg-gray-900 p-4">
        <div class="text-center mb-6">
          <h1 class="text-4xl font-bold text-blue-400 mb-2">🔬 Dual Interface Testing</h1>
          <p class="text-gray-300">Two identical components for debugging multiplayer</p>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-7xl mx-auto">
          <!-- Left Instance -->
          <div class="bg-gray-800 rounded-lg border border-blue-500 p-4">
            <div class="text-center mb-4">
              <h2 class="text-2xl font-bold text-blue-400 mb-2">📱 Instance A</h2>
              <div class="text-sm text-gray-400">Identical component #1</div>
            </div>
            <div id="componentA" class="bg-gray-900 rounded p-4"></div>
          </div>

          <!-- Right Instance -->
          <div class="bg-gray-800 rounded-lg border border-red-500 p-4">
            <div class="text-center mb-4">
              <h2 class="text-2xl font-bold text-red-400 mb-2">📱 Instance B</h2>
              <div class="text-sm text-gray-400">Identical component #2</div>
            </div>
            <div id="componentB" class="bg-gray-900 rounded p-4"></div>
          </div>
        </div>
      </div>
    `;

    // Initialize TWO IDENTICAL instances of the component
    const componentA = new MovementCommanderComponent('componentA');
    const componentB = new MovementCommanderComponent('componentB');

    console.log('Dual interface initialized with two identical components');

  } catch (error) {
    console.error('Failed to initialize dual interface:', error);
    const container = document.getElementById('dual-app');
    if (container) {
      container.innerHTML = `
        <div class="min-h-screen bg-red-900 flex items-center justify-center p-4">
          <div class="bg-white/10 backdrop-blur-lg rounded-2xl border border-red-500/50 shadow-2xl p-8 text-white text-center max-w-md">
            <h1 class="text-2xl font-bold text-red-300 mb-4">⚠️ Dual Interface Error</h1>
            <p class="mb-4">Failed to initialize dual interface.</p>
            <p class="text-sm text-white/70">Check console for details.</p>
          </div>
        </div>
      `;
    }
  }
});

// THE ONE COMPONENT that handles everything: lobby → game board → everything
class MovementCommanderComponent {
  private container: HTMLElement;
  private socket: WebSocket | null = null;
  private currentState: 'lobby' | 'arena' = 'lobby';
  private availableGames: any[] = [];
  private currentRoom: string | null = null;
  private battleArena: BattleArena | null = null;
  private myPlayer: 'A' | 'B' | null = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;

    // Start in lobby state and auto-connect immediately
    this.showLobby();
    this.autoConnect();
  }

  private showLobby() {
    this.currentState = 'lobby';
    const isConnected = this.socket && this.socket.readyState === WebSocket.OPEN;

    this.container.innerHTML = `
      <div class="space-y-6">
        <!-- Connection Status -->
        <div class="bg-gray-800 rounded-lg border border-gray-600 p-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-bold text-green-400 mb-2">🌐 Server</h3>
              <div class="text-sm text-gray-400">
                <span class="connectionStatus">${isConnected ? 'Connected' : 'Disconnected'}</span> • ws://localhost:9999/ws
              </div>
            </div>
            <button class="connectBtn ${isConnected ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold py-2 px-4 rounded transition-colors" ${isConnected ? 'disabled' : ''}>
              ${isConnected ? 'Connected' : 'Connect'}
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div class="grid grid-cols-1 gap-4">
          <button class="createGameBtn w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded transition-colors" ${isConnected ? '' : 'disabled'}>
            🎮 Create New Game
          </button>
        </div>

        <!-- Games List -->
        <div class="bg-gray-800 rounded-lg border border-gray-600 p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-bold text-purple-400">🎯 Available Games</h3>
            <div class="text-xs text-gray-400">Auto-refreshed live</div>
          </div>
          <div class="gamesList space-y-2">
            <div class="text-center text-gray-400 py-4">
              <p>Connect to server to see games</p>
            </div>
          </div>
        </div>
      </div>
    `;

    this.setupLobbyEvents();
  }

  private setupLobbyEvents() {
    console.log('🔧 Setting up lobby events...');

    const connectBtn = this.container.querySelector('.connectBtn') as HTMLButtonElement;
    const createGameBtn = this.container.querySelector('.createGameBtn') as HTMLButtonElement;

    console.log('🔍 Found elements:', {
      connectBtn: !!connectBtn,
      createGameBtn: !!createGameBtn
    });

    if (connectBtn) {
      connectBtn.addEventListener('click', () => {
        console.log('🔌 Connect button clicked!');
        this.connectToServer();
      });
    } else {
      console.error('❌ Connect button not found!');
    }

    if (createGameBtn) {
      createGameBtn.addEventListener('click', () => {
        console.log('🎮 Create game button clicked!');
        this.createGame();
      });
    } else {
      console.error('❌ Create game button not found!');
    }

    console.log('✅ Lobby events setup complete');
  }

  private connectToServer() {
    console.log('🔌 connectToServer() called');

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('⚠️ Already connected to server');
      return;
    }

    const connectionStatus = this.container.querySelector('.connectionStatus') as HTMLElement;
    const connectBtn = this.container.querySelector('.connectBtn') as HTMLButtonElement;
    const createGameBtn = this.container.querySelector('.createGameBtn') as HTMLButtonElement;

    console.log('🔍 Connection elements found:', {
      connectionStatus: !!connectionStatus,
      connectBtn: !!connectBtn,
      createGameBtn: !!createGameBtn
    });

    if (connectionStatus) connectionStatus.textContent = 'Connecting...';
    connectBtn.disabled = true;

    this.socket = new WebSocket('ws://localhost:9999/ws');

    this.socket.onopen = () => {
      console.log('Connected to game server');
      connectionStatus.textContent = 'Connected';
      connectBtn.textContent = 'Connected';
      connectBtn.disabled = true;
      createGameBtn.disabled = false;
      this.refreshGameList();
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        // Only log non-gameState messages to reduce console spam
        if (message.type !== 'gameState') {
          console.log('Received message:', message);
        }

        if (message.type === 'roomCreated') {
          this.currentRoom = message.payload.roomCode;
          this.myPlayer = 'A'; // Creator is always Player A
          console.log('Game created:', this.currentRoom, '- I am Player A');
          this.showArena();
        } else if (message.type === 'joinedRoom') {
          this.currentRoom = message.payload.roomCode;
          this.myPlayer = 'B'; // Joiner is always Player B
          console.log('Joined game:', this.currentRoom, '- I am Player B');
          this.showArena();
        } else if (message.type === 'roomDestroyed') {
          console.log('⚠️ Room destroyed:', message.payload);
          alert(`⚠️ Game Destroyed\n\nRoom ${message.payload.roomCode} was destroyed.\nReason: ${message.payload.reason}`);
          this.currentRoom = null;
          this.battleArena = null;
          this.myPlayer = null;
          this.currentState = 'lobby';
          this.showLobby();
        } else if (message.type === 'gamesList') {
          this.updateGamesList(message.payload.games || []);
        } else if (message.type === 'gameState') {
          if (this.currentState === 'arena' && this.battleArena) {
            const gameState = message.payload as GameState;
            this.battleArena.updateGameState(gameState);
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    this.socket.onclose = () => {
      console.log('Disconnected from server');
      connectionStatus.textContent = 'Disconnected';
      connectBtn.textContent = 'Connect';
      connectBtn.disabled = false;
      createGameBtn.disabled = true;
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      connectionStatus.textContent = 'Connection Failed';
      connectBtn.disabled = false;
    };
  }

  private createGame() {
    console.log('🎮 createGame() called');

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('❌ Cannot create game - socket not connected!', {
        socket: !!this.socket,
        readyState: this.socket?.readyState,
        expectedState: WebSocket.OPEN
      });
      return;
    }

    console.log('📤 Sending createRoom message to server...');
    this.socket.send(JSON.stringify({
      type: 'createRoom',
      payload: {}
    }));
    console.log('✅ CreateRoom message sent');
  }

  private joinGame(roomCode: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    this.socket.send(JSON.stringify({
      type: 'joinRoom',
      payload: { roomCode }
    }));
  }

  private refreshGameList() {
    console.log('🔄 refreshGameList() called');

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('❌ Cannot refresh games list - socket not connected!', {
        socket: !!this.socket,
        readyState: this.socket?.readyState,
        expectedState: WebSocket.OPEN
      });
      return;
    }

    console.log('📤 Sending getGamesList message to server...');
    this.socket.send(JSON.stringify({
      type: 'getGamesList',
      payload: {}
    }));
    console.log('✅ GetGamesList message sent');
  }

  private updateGamesList(games: any[]) {
    this.availableGames = games;
    const gamesList = this.container.querySelector('.gamesList');
    if (!gamesList) return;

    if (games.length === 0) {
      gamesList.innerHTML = `
        <div class="text-center text-gray-400 py-4">
          <p>No active games</p>
          <p class="text-sm mt-1">Create one!</p>
        </div>
      `;
      return;
    }

    gamesList.innerHTML = games.map(game => `
      <div class="bg-gray-700 rounded p-3 flex items-center justify-between border border-gray-600 hover:border-purple-400 transition-colors">
        <div>
          <div class="text-white font-semibold">Room: ${game.roomCode}</div>
          <div class="text-sm text-gray-300">
            Players: ${game.playerCount}/2 •
            <span class="text-${game.status === 'waiting' ? 'yellow' : 'green'}-400">${game.status}</span>
          </div>
        </div>
        <button
          class="joinGameBtn bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-1 px-3 rounded text-sm transition-colors"
          data-room="${game.roomCode}"
          ${game.playerCount >= 2 ? 'disabled' : ''}
        >
          ${game.playerCount >= 2 ? 'Full' : 'Join'}
        </button>
      </div>
    `).join('');

    // Add event listeners to join buttons
    gamesList.querySelectorAll('.joinGameBtn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const roomCode = (e.target as HTMLElement).getAttribute('data-room');
        if (roomCode) this.joinGame(roomCode);
      });
    });
  }

  private showArena() {
    this.currentState = 'arena';
    this.container.innerHTML = `
      <div class="space-y-4">
        <!-- Header -->
        <div class="text-center">
          <h3 class="text-xl font-bold text-blue-400">⚔️ Battle Arena</h3>
          <p class="text-sm text-gray-300">Room: ${this.currentRoom}</p>
          <button class="backToLobbyBtn mt-2 bg-gray-600 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded text-sm transition-colors">
            ← Lobby
          </button>
        </div>

        <!-- Battle Arena -->
        <div id="battleArenaContainer" class="bg-gray-800 rounded border border-gray-600 p-4"></div>

        <!-- Quick Controls -->
        <div class="bg-gray-800 rounded border border-gray-600 p-3">
          <h4 class="text-sm font-bold text-yellow-400 mb-2">Quick Test</h4>
          <div class="flex gap-2">
            <select class="testCommand flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm">
              <option value="P1→up(2)">P1→up(2)</option>
              <option value="P1→down(2)">P1→down(2)</option>
              <option value="P1→left(2)">P1→left(2)</option>
              <option value="P1→right(2)">P1→right(2)</option>
            </select>
            <button class="sendTestBtn bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
              Send
            </button>
          </div>
        </div>
      </div>
    `;

    this.setupArenaEvents();
    this.initializeBattleArena();
  }

  private setupArenaEvents() {
    const backToLobbyBtn = this.container.querySelector('.backToLobbyBtn') as HTMLButtonElement;
    const sendTestBtn = this.container.querySelector('.sendTestBtn') as HTMLButtonElement;
    const testCommand = this.container.querySelector('.testCommand') as HTMLSelectElement;

    backToLobbyBtn.addEventListener('click', () => {
      // Send a message to leave the room gracefully
      if (this.socket && this.socket.readyState === WebSocket.OPEN && this.currentRoom) {
        this.socket.send(JSON.stringify({
          type: 'leaveRoom',
          payload: { roomCode: this.currentRoom }
        }));
      }
      this.currentState = 'lobby';
      this.currentRoom = null;
      this.battleArena = null;
      this.showLobby();
    });

    sendTestBtn.addEventListener('click', () => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          type: 'testCommand',
          payload: {
            command: testCommand.value
          }
        }));
      }
    });
  }

  private initializeBattleArena() {
    const battleContainer = this.container.querySelector('#battleArenaContainer');
    if (!battleContainer) return;

    // Create a unique ID for this arena instance
    const arenaId = `arena_${Math.random().toString(36).substr(2, 9)}`;
    battleContainer.innerHTML = `<div id="${arenaId}"></div>`;

    this.battleArena = new BattleArena(arenaId, {
      playerPerspective: this.myPlayer || 'A',
      showEnemyCommands: true,
      enableAnimations: true,
      onPieceClick: (piece) => {
        console.log('Piece clicked:', piece);
      },
      onQueueMove: (move) => {
        console.log('🎯 Queueing move:', move);
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.currentRoom) {
          this.socket.send(JSON.stringify({
            type: 'queueMove',
            payload: {
              roomCode: this.currentRoom,
              ...move
            }
          }));
        }
      }
    });
  }

  private autoConnect() {
    console.log('🔄 Auto-connecting to server...');

    // Show loading state
    this.updateConnectionStatus('Connecting...');

    // Auto-connect after a brief delay to let UI render
    setTimeout(() => {
      this.connectToServer();
    }, 500);
  }

  private updateConnectionStatus(status: string) {
    const connectionStatus = this.container.querySelector('.connectionStatus') as HTMLElement;
    if (connectionStatus) {
      connectionStatus.textContent = status;
    }
  }
}