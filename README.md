# Commander's Flag War

**The first real-time strategy game controlled entirely through natural language.**

## 🎯 Project Status

**Current Implementation**: Dual lobby debugging system with WebSocket room management
**Ultimate Vision**: ChatGPT-controlled RTS game with capture-the-flag mechanics

## 🚀 Quick Start

### Frontend (Dual Interface)
```bash
cd frontend
npm install
npm run dev
```
Runs dual interface on `localhost:5173` for debugging multiplayer functionality

### Server (WebSocket Game Server)
```bash
cd server
npm install
npm run dev
```
Runs game server on `localhost:8004/ws` with room management

## 📁 Project Structure

```
commander/
├── frontend/           # Vite + TypeScript dual interface
├── server/             # Node.js WebSocket game server
├── docs/               # Game concept and architecture
└── README.md          # This file
```

## ✅ What's Working

- **Dual Interface**: Two identical lobby components for debugging
- **Room Management**: Create/join rooms with WebSocket synchronization
- **Lobby → Arena Flow**: Navigation between lobby and game states
- **WebSocket Infrastructure**: Real-time communication between clients

## 🚧 What's Next

- **7x7 Game Board**: Visual grid battlefield
- **Unit System**: 3 pieces per player with movement
- **Capture the Flag**: Game mechanics and win conditions
- **ChatGPT Integration**: Natural language command parsing
- **5-Second Tick System**: Synchronized game state updates

## 🎮 The Vision

Players command units by talking to ChatGPT, who interprets strategy and translates it into tactical execution. No clicking, no buttons - pure conversational strategy.

> "Unit 2, rush their flag!"
> "Everyone fall back!"
> "Defensive formation around our flag"

See `docs/game-concept.md` for the complete vision.