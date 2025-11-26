import './style.css';
import { GameInterface } from './components/GameInterface';

// Smart WebSocket URL detection (local vs production)
const getWebSocketUrl = (): string => {
  // 🧪 TESTING: Force production URL to test Railway backend
  const FORCE_PRODUCTION_TEST = true;

  if (FORCE_PRODUCTION_TEST) {
    return 'wss://commander-production.up.railway.app/ws';
  }

  // Check if running in production (deployed/ChatGPT environment)
  const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  if (isProduction) {
    // Production: Use Railway deployment (set via environment variable during build)
    return import.meta.env.VITE_WS_URL || 'ws://production-url-will-be-set.railway.app/ws';
  } else {
    // Local development
    return 'ws://localhost:9999/ws';
  }
};

// Initialize the game interface
const serverUrl = getWebSocketUrl();
console.log(`🔌 Connecting to WebSocket: ${serverUrl}`);
const gameInterface = new GameInterface('app', serverUrl);

// Make it globally accessible for onclick handlers
window.gameInterface = gameInterface;
