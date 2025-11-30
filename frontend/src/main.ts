import './style.css';
import { GameInterface } from './components/GameInterface';
import './diagnostic';

// Smart WebSocket URL detection (local vs production)
const getWebSocketUrl = (): string => {
  // 🧪 TESTING: Force Railway backend
  const FORCE_RAILWAY_TEST = false; // Set to true to test Railway deployment
  const RAILWAY_WS_URL = 'wss://commander-production.up.railway.app/ws';

  if (FORCE_RAILWAY_TEST) {
    console.log('✅ Railway backend test ENABLED - connecting to production server');
    console.log('🚀 Production WebSocket URL:', RAILWAY_WS_URL);
    return RAILWAY_WS_URL;
  }
  console.log('🏠 Using LOCAL backend for development - ws://localhost:9999/ws');

  // Check if running in production (deployed/ChatGPT environment)
  const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  if (isProduction) {
    // Production: Use Railway deployment
    return import.meta.env.VITE_WS_URL || RAILWAY_WS_URL;
  } else {
    // Local development
    return 'ws://localhost:9999/ws';
  }
};

// Initialize the game interface
const serverUrl = getWebSocketUrl();
console.log(`🔌 Connecting to WebSocket: ${serverUrl}`);
console.log('🎯 TEST LOG: If you can see this in your terminal, console monitoring works!');
const gameInterface = new GameInterface('app', serverUrl);

// Make it globally accessible for onclick handlers
window.gameInterface = gameInterface;
