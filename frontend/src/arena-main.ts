import { BattleArena } from './components/BattleArena';
import type { GameState } from './types/game';

// Arena-only interface - just the battle arena component
document.addEventListener('DOMContentLoaded', () => {
  try {
    const container = document.getElementById('arena-app');
    if (!container) {
      throw new Error('Arena container not found');
    }

    // Create arena-only interface
    container.innerHTML = `
      <div class="min-h-screen bg-gradient-to-br from-game-background via-purple-900 to-game-background p-8 flex items-center justify-center">
        <div class="w-full max-w-7xl">
          <div class="text-center mb-8">
            <h1 class="text-6xl font-bold text-game-primary mb-3">⚔️ Battle Arena</h1>
            <p class="text-xl text-game-accent">Direct combat interface - Practice Mode</p>
          </div>

          <div id="battleArena"></div>

          <div class="mt-8 text-center">
            <div class="bg-white/10 backdrop-blur-lg rounded-lg border border-white/20 p-4 text-base text-white/70">
              <strong>Arena Mode:</strong> Direct battle interface • WebSocket: ws://localhost:9999/ws
            </div>
          </div>
        </div>
      </div>
    `;

    // Initialize the battle arena
    const battleArena = new BattleArena('battleArena', {
      playerPerspective: 'A',
      showEnemyCommands: true,
      enableAnimations: true,
      onPieceClick: (piece) => {
        console.log('Arena Mode - Piece clicked:', piece);
        // TODO: Add direct command input interface
      }
    });

    // Connect to WebSocket for direct arena control
    const socket = new WebSocket('ws://localhost:9999/ws');

    socket.onopen = () => {
      console.log('Arena connected to game server');
      // Auto-join as player for testing
      socket.send(JSON.stringify({
        type: 'createRoom',
        payload: {}
      }));
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'roomCreated') {
          console.log('Arena room created:', message.payload.roomCode);
          // Immediately start the game for arena testing
          socket.send(JSON.stringify({
            type: 'joinRoom',
            payload: { roomCode: message.payload.roomCode }
          }));
        } else if (message.type === 'gameState') {
          // Update arena with game state
          battleArena.updateGameState(message.payload as GameState);
        }
      } catch (error) {
        console.error('Arena WebSocket message error:', error);
      }
    };

    socket.onclose = () => {
      console.log('Arena disconnected from server');
    };

    socket.onerror = (error) => {
      console.error('Arena WebSocket error:', error);
    };

    console.log('Movement Commander Arena initialized');

  } catch (error) {
    console.error('Failed to initialize Arena:', error);

    const container = document.getElementById('arena-app');
    if (container) {
      container.innerHTML = `
        <div class="min-h-screen bg-gradient-to-br from-red-900 to-red-800 flex items-center justify-center p-4">
          <div class="bg-white/10 backdrop-blur-lg rounded-2xl border border-red-500/50 shadow-2xl p-8 text-white text-center max-w-md">
            <h1 class="text-2xl font-bold text-red-300 mb-4">⚠️ Arena Error</h1>
            <p class="mb-4">Failed to initialize Battle Arena.</p>
            <p class="text-sm text-white/70">Check that the game server is running on port 8004.</p>
          </div>
        </div>
      `;
    }
  }
});