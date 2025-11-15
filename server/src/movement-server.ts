import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ListResourceTemplatesRequest,
  type ListResourcesRequest,
  type ListToolsRequest,
  type ReadResourceRequest,
  type Resource,
  type ResourceTemplate,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { RescueKeyManager } from "./game/RescueKeyManager.js";
import { FlagManager } from "./game/FlagManager.js";

type PizzazWidget = {
  id: string;
  title: string;
  templateUri: string;
  invoking: string;
  invoked: string;
  html: string;
  responseText: string;
};

// Movement Commander Game State
type Piece = {
  id: number;
  x: number;
  y: number;
  alive: boolean;
};

type Movement = {
  pieceId: number;
  direction: 'up' | 'down' | 'left' | 'right';
  distance: number;
};

type CommanderGameState = {
  round: number;
  players: {
    A: { id: string; type: 'chatgpt' | 'local' | 'local-a' | 'local-b'; pieces: Piece[]; jailedPieces: number[] } | null;
    B: { id: string; type: 'chatgpt' | 'local' | 'local-a' | 'local-b'; pieces: Piece[]; jailedPieces: number[] } | null;
  };
  commandQueue: {
    [round: number]: {
      playerA: Movement[];
      playerB: Movement[];
    };
  };
  rescueKeys: {
    A: { x: number; y: number } | null; // Blue team's key - appears when Blue has jail
    B: { x: number; y: number } | null; // Red team's key - appears when Red has jail
  };
  flags: {
    A: { x: number; y: number; carriedBy: { player: 'A' | 'B'; pieceId: number } | null };
    B: { x: number; y: number; carriedBy: { player: 'A' | 'B'; pieceId: number } | null };
  };
  gameStatus: 'waiting' | 'playing' | 'finished' | 'paused';
  winner?: 'A' | 'B';
  nextTickIn: number; // seconds until next round execution
  lastRoundTime: number; // timestamp of last round execution
};

type GameMessage = {
  type: 'gameState' | 'move' | 'join' | 'reset' | 'start' | 'pause' | 'createRoom' | 'joinRoom' | 'getGamesList';
  payload: any;
};

type GameRoom = {
  roomCode: string;
  playerCount: number;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
  gameState: CommanderGameState;
  connections: Set<WebSocket>;
  gameTimer: NodeJS.Timeout | null;
};

class MovementCommanderGameManager {
  private game: CommanderGameState;
  private connections: Set<WebSocket> = new Set();
  private gameTimer: NodeJS.Timeout | null = null;
  private rooms: Map<string, GameRoom> = new Map();
  private rescueKeyManager: RescueKeyManager = new RescueKeyManager();
  private flagManager: FlagManager = new FlagManager();

  constructor() {
    this.resetGame();
    // Don't start game loop automatically - wait for manual start
  }

  resetGame() {
    // Preserve existing players during reset (if game exists)
    const currentPlayers = this.game?.players || { A: null, B: null };
    this.game = {
      round: 1,
      players: currentPlayers,
      commandQueue: {},
      rescueKeys: { A: null, B: null },
      flags: {
        A: { x: 5, y: 10, carriedBy: null },  // Blue flag at center back
        B: { x: 5, y: 0, carriedBy: null }    // Red flag at center back
      },
      gameStatus: 'paused',
      nextTickIn: 0,
      lastRoundTime: Date.now()
    };

    // Initialize pieces if players exist
    // 11x11 grid: coordinates 0-10
    // Player A at bottom (y=10), Player B at top (y=0)
    if (this.game.players.A) {
      this.game.players.A.pieces = [
        { id: 1, x: 4, y: 9, alive: true },  // Left guard
        { id: 2, x: 5, y: 9, alive: true },  // Center guard
        { id: 3, x: 6, y: 9, alive: true }   // Right guard
      ];
      this.game.players.A.jailedPieces = [];
    }
    if (this.game.players.B) {
      this.game.players.B.pieces = [
        { id: 1, x: 4, y: 1, alive: true },  // Left guard
        { id: 2, x: 5, y: 1, alive: true },  // Center guard
        { id: 3, x: 6, y: 1, alive: true }   // Right guard
      ];
      this.game.players.B.jailedPieces = [];
    }
  }

  startGameLoop() {
    this.game.lastRoundTime = Date.now();
    this.gameTimer = setInterval(() => {
      this.executeRound();
    }, 3000); // Every 3 seconds
  }

  stopGameLoop() {
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }
  }

  executeRound() {
    // Only execute rounds when game is actually playing
    if (this.game.gameStatus !== 'playing') return;

    console.log(`⚡ Executing Round ${this.game.round}`);

    const roundCommands = this.game.commandQueue[this.game.round];
    if (roundCommands) {
      // Execute Player A moves
      roundCommands.playerA.forEach(move => this.executeMovement('A', move));
      // Execute Player B moves
      roundCommands.playerB.forEach(move => this.executeMovement('B', move));

      // Clear executed commands
      delete this.game.commandQueue[this.game.round];
    }

    this.game.round++;
    this.game.lastRoundTime = Date.now();
    this.broadcastGameState();
  }

  executeMovement(player: 'A' | 'B', movement: Movement) {
    const playerData = this.game.players[player];
    if (!playerData) return;

    const piece = playerData.pieces.find(p => p.id === movement.pieceId && p.alive);
    if (!piece) {
      console.log(`❌ Piece ${movement.pieceId} not found for player ${player}`);
      return;
    }

    // Calculate new position
    let newX = piece.x;
    let newY = piece.y;

    switch (movement.direction) {
      case 'up':
        newY -= movement.distance;
        break;
      case 'down':
        newY += movement.distance;
        break;
      case 'left':
        newX -= movement.distance;
        break;
      case 'right':
        newX += movement.distance;
        break;
    }

    // Check bounds (11x11 grid: 0-10)
    if (newX < 0 || newX > 10 || newY < 0 || newY > 10) {
      console.log(`💀 Player ${player} Piece ${movement.pieceId} moved off the board and died!`);
      piece.alive = false;
      return;
    }

    // Update position
    piece.x = newX;
    piece.y = newY;
    console.log(`✅ Player ${player} Piece ${movement.pieceId} moved to (${newX}, ${newY})`);
  }

  addConnection(ws: WebSocket) {
    this.connections.add(ws);

    // Assign unique ID to this WebSocket connection
    (ws as any)._playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🆔 Assigned player ID: ${(ws as any)._playerId}`);

    this.sendGameState(ws);

    ws.on('close', (code, reason) => {
      this.connections.delete(ws);
      const playerId = (ws as any)._playerId;
      console.log(`🔌 WebSocket connection closed for player ${playerId}. Code: ${code}, Reason: ${reason || 'none'}`);

      // Find which room this player was in
      let roomToDestroy: string | null = null;
      for (const [roomCode, room] of this.rooms.entries()) {
        if (room.connections.has(ws)) {
          roomToDestroy = roomCode;
          console.log(`💥 Player ${playerId} disconnected from room ${roomCode}. Destroying room...`);

          // Notify all other players in the room that it's being destroyed
          const destroyMessage = JSON.stringify({
            type: 'roomDestroyed',
            payload: {
              roomCode,
              reason: 'A player disconnected'
            }
          });

          room.connections.forEach(client => {
            if (client !== ws && client.readyState === 1) {
              client.send(destroyMessage);
            }
          });

          break;
        }
      }

      // Delete the room if player was in one
      if (roomToDestroy) {
        this.rooms.delete(roomToDestroy);
        console.log(`✅ Room ${roomToDestroy} destroyed`);

        // Broadcast updated games list to all clients
        this.broadcastGamesList();
      }

      // Remove player if they disconnect (legacy game state)
      if (this.game.players.A?.id === playerId) {
        console.log(`❌ Player A (${this.game.players.A.type}) disconnected`);
        this.game.players.A = null;
      }
      if (this.game.players.B?.id === playerId) {
        console.log(`❌ Player B (${this.game.players.B.type}) disconnected`);
        this.game.players.B = null;
      }
      this.broadcastGameState();
    });

    ws.on('error', (error) => {
      console.log(`💥 WebSocket error:`, error);
    });
  }

  handleMessage(ws: WebSocket, message: GameMessage) {
    switch (message.type) {
      case 'createRoom':
        this.handleCreateRoom(ws, message.payload);
        break;
      case 'joinRoom':
        this.handleJoinRoom(ws, message.payload);
        break;
      case 'leaveRoom':
        this.handleLeaveRoom(ws, message.payload);
        break;
      case 'getGamesList':
        this.handleGetGamesList(ws);
        break;
      case 'queueMove':
        this.handleQueueMove(ws, message.payload);
        break;
      case 'join':
        this.handleJoin(ws, message.payload);
        break;
      case 'move':
        this.handleMovementCommand(ws, message.payload);
        break;
      case 'reset':
        console.log(`🔄 Reset requested by player ${(ws as any)._playerId}`);
        this.stopGameLoop();
        this.resetGame();
        this.broadcastGameState();
        break;
      case 'start':
        console.log(`▶️ Game start requested by player ${(ws as any)._playerId}`);
        this.game.gameStatus = 'playing';
        this.startGameLoop();
        this.broadcastGameState();
        break;
      case 'pause':
        console.log(`⏸️ Game pause requested by player ${(ws as any)._playerId}`);
        this.game.gameStatus = 'paused';
        this.stopGameLoop();
        this.broadcastGameState();
        break;
    }
  }

  private generateRoomCode(): string {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  private createDefaultGameState(): CommanderGameState {
    return {
      round: 1,
      players: { A: null, B: null },
      commandQueue: {},
      rescueKeys: { A: null, B: null },
      flags: {
        A: { x: 5, y: 10, carriedBy: null },  // Blue flag
        B: { x: 5, y: 0, carriedBy: null }    // Red flag
      },
      gameStatus: 'waiting',
      nextTickIn: 0,
      lastRoundTime: Date.now()
    };
  }

  private handleCreateRoom(ws: WebSocket, payload: any) {
    const playerId = (ws as any)._playerId;
    const roomCode = this.generateRoomCode();

    console.log(`🎯 Creating new room: ${roomCode} for player ${playerId}`);

    const room: GameRoom = {
      roomCode,
      playerCount: 1, // Creator is automatically added
      status: 'waiting',
      createdAt: Date.now(),
      gameState: this.createDefaultGameState(),
      connections: new Set([ws]), // Add creator to connections
      gameTimer: null
    };

    // Assign creator as Player A
    room.gameState.players.A = {
      id: playerId,
      type: 'local-a',
      pieces: [
        { id: 1, x: 4, y: 9, alive: true },
        { id: 2, x: 5, y: 9, alive: true },
        { id: 3, x: 6, y: 9, alive: true }
      ],
      jailedPieces: []
    };

    this.rooms.set(roomCode, room);

    // Send roomCreated response to trigger arena transition
    ws.send(JSON.stringify({
      type: 'roomCreated',
      payload: { roomCode }
    }));

    // Send initial game state to creator
    ws.send(JSON.stringify({
      type: 'gameState',
      payload: room.gameState
    }));

    console.log(`✅ Room ${roomCode} created successfully with creator ${playerId} as Player A (1/2 players)`);

    // Broadcast updated games list to all connected clients
    this.broadcastGamesList();
  }

  private handleJoinRoom(ws: WebSocket, payload: { roomCode: string }) {
    const playerId = (ws as any)._playerId;
    const { roomCode } = payload;

    console.log(`🚪 Player ${playerId} trying to join room: ${roomCode}`);

    const room = this.rooms.get(roomCode);
    if (!room) {
      console.log(`❌ Room ${roomCode} not found`);
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: 'Room not found' }
      }));
      return;
    }

    if (room.playerCount >= 2) {
      console.log(`❌ Room ${roomCode} is full`);
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: 'Room is full' }
      }));
      return;
    }

    // Add player to room
    room.connections.add(ws);
    room.playerCount++;

    // Assign joiner as Player B
    room.gameState.players.B = {
      id: playerId,
      type: 'local-b',
      pieces: [
        { id: 1, x: 4, y: 1, alive: true },
        { id: 2, x: 5, y: 1, alive: true },
        { id: 3, x: 6, y: 1, alive: true }
      ],
      jailedPieces: []
    };

    // Send joinedRoom response to trigger arena transition
    ws.send(JSON.stringify({
      type: 'joinedRoom',
      payload: { roomCode }
    }));

    // Broadcast updated game state to all players in room
    this.broadcastToRoom(roomCode, {
      type: 'gameState',
      payload: room.gameState
    });

    console.log(`✅ Player ${playerId} joined room ${roomCode} as Player B (${room.playerCount}/2 players)`);

    // Start game loop when both players have joined
    if (room.playerCount === 2) {
      console.log(`🎮 Both players in room ${roomCode} - starting game loop!`);
      this.startRoomGameLoop(roomCode);
    }

    // Broadcast updated games list to all connected clients
    this.broadcastGamesList();
  }

  private handleLeaveRoom(ws: WebSocket, payload: { roomCode: string }) {
    const playerId = (ws as any)._playerId;
    const { roomCode } = payload;

    console.log(`🚪 Player ${playerId} leaving room: ${roomCode}`);

    const room = this.rooms.get(roomCode);
    if (!room) {
      console.log(`❌ Room ${roomCode} not found`);
      return;
    }

    // Notify all other players in the room that it's being destroyed
    const destroyMessage = JSON.stringify({
      type: 'roomDestroyed',
      payload: {
        roomCode,
        reason: 'A player left the room'
      }
    });

    room.connections.forEach(client => {
      if (client !== ws && client.readyState === 1) {
        client.send(destroyMessage);
      }
    });

    // Stop game loop before destroying room
    this.stopRoomGameLoop(roomCode);

    // Delete the room
    this.rooms.delete(roomCode);
    console.log(`✅ Room ${roomCode} destroyed`);

    // Broadcast updated games list to all clients
    this.broadcastGamesList();
  }

  private handleGetGamesList(ws: WebSocket) {
    const playerId = (ws as any)._playerId;
    console.log(`📋 Player ${playerId} requesting games list`);

    const gamesList = Array.from(this.rooms.values()).map(room => ({
      roomCode: room.roomCode,
      playerCount: room.playerCount,
      status: room.status
    }));

    ws.send(JSON.stringify({
      type: 'gamesList',
      payload: { games: gamesList }
    }));

    console.log(`📤 Sent games list: ${gamesList.length} rooms available`);
  }

  private handleQueueMove(ws: WebSocket, payload: { roomCode: string; pieceId: number; direction: 'up' | 'down' | 'left' | 'right'; distance: number; targetRound?: number }) {
    const playerId = (ws as any)._playerId;
    const { roomCode, pieceId, direction, distance, targetRound } = payload;

    const room = this.rooms.get(roomCode);
    if (!room) {
      console.log(`❌ Room ${roomCode} not found`);
      return;
    }

    // Determine which player this is
    let player: 'A' | 'B' | null = null;
    if (room.gameState.players.A?.id === playerId) {
      player = 'A';
    } else if (room.gameState.players.B?.id === playerId) {
      player = 'B';
    }

    if (!player) {
      console.log(`❌ Player ${playerId} not found in room ${roomCode}`);
      return;
    }

    // Default to current round if not specified (executes at end of this round)
    const round = targetRound || room.gameState.round;

    // Initialize command queue for this round if it doesn't exist
    if (!room.gameState.commandQueue[round]) {
      room.gameState.commandQueue[round] = {
        playerA: [],
        playerB: []
      };
    }

    // Add/replace move in queue (only one move per piece per round)
    const movement: Movement = { pieceId, direction, distance };
    const playerKey = `player${player}` as 'playerA' | 'playerB';

    // Remove any existing move for this piece in this round
    const existingIndex = room.gameState.commandQueue[round][playerKey].findIndex(m => m.pieceId === pieceId);
    if (existingIndex !== -1) {
      room.gameState.commandQueue[round][playerKey].splice(existingIndex, 1);
      console.log(`📝 Player ${player} replaced move for Piece ${pieceId} in Round ${round}`);
    }

    room.gameState.commandQueue[round][playerKey].push(movement);
    console.log(`📝 Player ${player} queued move for Round ${round}: P${pieceId}→${direction}(${distance})`);

    // Broadcast updated game state
    this.broadcastToRoom(roomCode, {
      type: 'gameState',
      payload: room.gameState
    });
  }

  private broadcastGamesList() {
    const gamesList = Array.from(this.rooms.values()).map(room => ({
      roomCode: room.roomCode,
      playerCount: room.playerCount,
      status: room.status
    }));

    const message = JSON.stringify({
      type: 'gamesList',
      payload: { games: gamesList }
    });

    console.log(`📢 Broadcasting games list to all clients: ${gamesList.length} rooms available`);

    this.connections.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }

  private broadcastToRoom(roomCode: string, message: any) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    room.connections.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(messageStr);
      }
    });
  }

  private startRoomGameLoop(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    console.log(`🎮 Starting game loop for room ${roomCode}`);

    // Update game status
    room.gameState.gameStatus = 'playing';
    room.gameState.lastRoundTime = Date.now();

    // Start round execution timer (every 3 seconds)
    room.gameTimer = setInterval(() => {
      this.executeRoomRound(roomCode);
    }, 3000);

    // Broadcast initial state
    this.broadcastToRoom(roomCode, {
      type: 'gameState',
      payload: room.gameState
    });
  }

  private stopRoomGameLoop(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    console.log(`🛑 Stopping game loop for room ${roomCode}`);

    if (room.gameTimer) {
      clearInterval(room.gameTimer);
      room.gameTimer = null;
    }

    room.gameState.gameStatus = 'paused';
  }


  private executeRoomRound(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    if (room.gameState.gameStatus !== 'playing') return;

    // Reduced logging - only log when there are commands to execute
    const roundCommands = room.gameState.commandQueue[room.gameState.round];
    if (roundCommands && (roundCommands.playerA.length > 0 || roundCommands.playerB.length > 0)) {
      console.log(`⚡ Executing Round ${room.gameState.round} for room ${roomCode}`);
    }

    // Reset any pieces that picked up keys in the previous round
    this.rescueKeyManager.resetRescuingPieces(room.gameState);

    if (roundCommands) {
      // Snapshot occupied cells at start of round (before any moves)
      const occupiedCells = this.getOccupiedCells(roomCode);

      // Execute Player A moves (with blocking)
      roundCommands.playerA.forEach(move => this.executeRoomMovement(roomCode, 'A', move, occupiedCells));
      // Execute Player B moves (with blocking)
      roundCommands.playerB.forEach(move => this.executeRoomMovement(roomCode, 'B', move, occupiedCells));

      // Check for rescue key pickups first (before collisions)
      this.rescueKeyManager.checkForRescue(room.gameState);

      // Check for flag pickups and scoring
      this.flagManager.checkFlagInteractions(room.gameState);

      // Check for collisions after all moves executed
      this.checkCollisions(roomCode);

      // Clear executed commands
      delete room.gameState.commandQueue[room.gameState.round];
    }

    room.gameState.round++;
    room.gameState.lastRoundTime = Date.now();

    // Broadcast updated state
    this.broadcastToRoom(roomCode, {
      type: 'gameState',
      payload: room.gameState
    });
  }

  private getOccupiedCells(roomCode: string): Set<string> {
    const room = this.rooms.get(roomCode);
    if (!room) return new Set();

    const occupied = new Set<string>();

    // Add all alive piece positions
    if (room.gameState.players.A) {
      room.gameState.players.A.pieces.forEach(piece => {
        if (piece.alive) {
          occupied.add(`${piece.x},${piece.y}`);
        }
      });
    }

    if (room.gameState.players.B) {
      room.gameState.players.B.pieces.forEach(piece => {
        if (piece.alive) {
          occupied.add(`${piece.x},${piece.y}`);
        }
      });
    }

    return occupied;
  }

  private executeRoomMovement(roomCode: string, player: 'A' | 'B', movement: Movement, occupiedCells: Set<string>) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const playerData = room.gameState.players[player];
    if (!playerData) return;

    const piece = playerData.pieces.find(p => p.id === movement.pieceId);
    if (!piece || !piece.alive) return;

    console.log(`🏃 Player ${player} Piece ${movement.pieceId}: ${movement.direction}(${movement.distance})`);

    const startX = piece.x;
    const startY = piece.y;

    // Remove current position from occupied (we're moving from here)
    occupiedCells.delete(`${startX},${startY}`);

    let newX = startX;
    let newY = startY;

    // Calculate step direction
    let stepX = 0;
    let stepY = 0;
    switch (movement.direction) {
      case 'up':
        stepY = -1;
        break;
      case 'down':
        stepY = 1;
        break;
      case 'left':
        stepX = -1;
        break;
      case 'right':
        stepX = 1;
        break;
    }

    // Move step by step, checking for occupied cells
    for (let i = 0; i < movement.distance; i++) {
      const nextX = newX + stepX;
      const nextY = newY + stepY;

      // Check board boundaries
      if (nextX < 0 || nextX > 10 || nextY < 0 || nextY > 10) {
        console.log(`🧱 Player ${player} Piece ${movement.pieceId} hit a wall at (${newX},${newY})`);
        break;
      }

      // Check if next cell is occupied (by a piece that was there at round start)
      if (occupiedCells.has(`${nextX},${nextY}`)) {
        // Move INTO the occupied cell (will trigger collision/jail logic)
        newX = nextX;
        newY = nextY;
        console.log(`💥 Player ${player} Piece ${movement.pieceId} moved into occupied cell at (${nextX},${nextY}) - collision will be resolved`);
        break; // Can't continue past the occupied cell
      }

      // Move to next cell
      newX = nextX;
      newY = nextY;
    }

    if (newX !== startX || newY !== startY) {
      console.log(`🏃 Player ${player} Piece ${movement.pieceId} moved from (${startX},${startY}) to (${newX},${newY})`);
    } else {
      console.log(`⛔ Player ${player} Piece ${movement.pieceId} couldn't move from (${startX},${startY})`);
    }

    piece.x = newX;
    piece.y = newY;
  }

  private checkCollisions(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const playerA = room.gameState.players.A;
    const playerB = room.gameState.players.B;
    if (!playerA || !playerB) return;

    // Build position map for all alive pieces
    const positionMap = new Map<string, { player: 'A' | 'B'; pieceId: number }[]>();

    // Add Player A pieces
    playerA.pieces.forEach(piece => {
      if (piece.alive) {
        const key = `${piece.x},${piece.y}`;
        if (!positionMap.has(key)) positionMap.set(key, []);
        positionMap.get(key)!.push({ player: 'A', pieceId: piece.id });
      }
    });

    // Add Player B pieces
    playerB.pieces.forEach(piece => {
      if (piece.alive) {
        const key = `${piece.x},${piece.y}`;
        if (!positionMap.has(key)) positionMap.set(key, []);
        positionMap.get(key)!.push({ player: 'B', pieceId: piece.id });
      }
    });

    // Check for collisions (multiple pieces on same square)
    positionMap.forEach((pieces, position) => {
      if (pieces.length > 1) {
        console.log(`💥 Collision at ${position}:`, pieces);
        this.handleCollision(roomCode, pieces, position);
      }
    });
  }

  private handleCollision(roomCode: string, pieces: { player: 'A' | 'B'; pieceId: number }[], position: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const [x, y] = position.split(',').map(Number);

    // Determine territory (A: rows 6-10, B: rows 0-4, Neutral: row 5)
    let territory: 'A' | 'B' | 'neutral';
    if (y >= 6) territory = 'A';
    else if (y <= 4) territory = 'B';
    else territory = 'neutral';

    // Check if same team collision
    const uniquePlayers = new Set(pieces.map(p => p.player));
    if (uniquePlayers.size === 1) {
      // Same team - both bounce back (TODO: implement bounce back logic)
      console.log(`🔵🔵 Same team collision at ${position} - pieces stay put for now`);
      return;
    }

    // Enemy collision - apply tagging rules
    pieces.forEach(piece => {
      const playerState = room.gameState.players[piece.player];
      const pieceData = playerState?.pieces.find(p => p.id === piece.pieceId);
      if (!pieceData || !playerState) return;

      if (territory === 'neutral') {
        // Neutral zone - both go to jail
        console.log(`⚖️ Neutral zone collision - ${piece.player} Piece ${piece.pieceId} goes to jail`);
        pieceData.alive = false;
        playerState.jailedPieces.push(piece.pieceId);
        // Return flag if carrier was jailed
        this.flagManager.onPieceCaptured(room.gameState, piece.player, piece.pieceId);
      } else if (territory === piece.player) {
        // Defending in own territory - opponent goes to jail (handled in their iteration)
        console.log(`🛡️ ${piece.player} Piece ${piece.pieceId} defending in own territory`);
      } else {
        // Attacking in enemy territory - goes to jail
        console.log(`⚔️ ${piece.player} Piece ${piece.pieceId} tagged in enemy territory - goes to jail`);
        pieceData.alive = false;
        playerState.jailedPieces.push(piece.pieceId);
        // Return flag if carrier was jailed
        this.flagManager.onPieceCaptured(room.gameState, piece.player, piece.pieceId);
      }
    });

    // After handling collisions, spawn rescue key if needed
    this.rescueKeyManager.updateKeys(room.gameState);
  }

  private handleJoin(ws: WebSocket, payload: { playerType: 'chatgpt' | 'local' | 'local-a' | 'local-b' }) {
    const playerId = (ws as any)._playerId;

    // Assign new player
    if (!this.game.players.A) {
      this.game.players.A = {
        id: playerId,
        type: payload.playerType,
        pieces: [
          { id: 1, x: 1, y: 0, alive: true },
          { id: 2, x: 5, y: 0, alive: true },
          { id: 3, x: 8, y: 0, alive: true }
        ]
      };
      console.log(`👤 Player A assigned: ${payload.playerType}`);
    } else if (!this.game.players.B) {
      this.game.players.B = {
        id: playerId,
        type: payload.playerType,
        pieces: [
          { id: 1, x: 1, y: 9, alive: true },
          { id: 2, x: 5, y: 9, alive: true },
          { id: 3, x: 8, y: 9, alive: true }
        ]
      };
      console.log(`👤 Player B assigned: ${payload.playerType}`);
    }

    // Start game if both players joined
    if (this.game.players.A && this.game.players.B) {
      this.game.gameStatus = 'playing';
      this.startGameLoop();
      console.log(`🎯 Game started! A: ${this.game.players.A.type}, B: ${this.game.players.B.type}`);
    }

    this.broadcastGameState();
  }

  private handleMovementCommand(ws: WebSocket, payload: { pieceId: number; direction: string; distance: number; targetRound?: number; playerType?: string }) {
    const playerId = (ws as any)._playerId;
    const { pieceId, direction, distance, targetRound, playerType } = payload;

    // Determine player - if playerType is provided, use that to find the correct player
    let player: 'A' | 'B' | null = null;

    if (playerType) {
      // Route by player type (for MCP client commands)
      if (this.game.players.A?.type === playerType) player = 'A';
      else if (this.game.players.B?.type === playerType) player = 'B';
    } else {
      // Route by connection ID (for direct widget commands)
      if (this.game.players.A?.id === playerId) player = 'A';
      else if (this.game.players.B?.id === playerId) player = 'B';
    }

    if (!player) {
      console.log(`❌ Movement rejected: player ${playerId} (type: ${playerType}) not found`);
      return;
    }

    const round = targetRound || this.game.round + 1;

    // Reject commands for past rounds
    if (round < this.game.round) {
      console.log(`❌ Movement rejected: round ${round} has already passed (current: ${this.game.round})`);
      return;
    }

    // Validate direction
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      console.log(`❌ Movement rejected: invalid direction ${direction}`);
      return;
    }

    // Initialize round if it doesn't exist
    if (!this.game.commandQueue[round]) {
      this.game.commandQueue[round] = { playerA: [], playerB: [] };
    }

    const movement: Movement = {
      pieceId,
      direction: direction as 'up' | 'down' | 'left' | 'right',
      distance
    };

    // Add to command queue
    if (player === 'A') {
      this.game.commandQueue[round].playerA.push(movement);
    } else {
      this.game.commandQueue[round].playerB.push(movement);
    }

    console.log(`✅ Movement queued: Player ${player} Piece ${pieceId} ${direction} ${distance} for Round ${round}`);
    this.broadcastGameState();
  }

  private sendGameState(ws: WebSocket) {
    ws.send(JSON.stringify({
      type: 'gameState',
      payload: this.game
    }));
  }

  private broadcastGameState() {
    const message = JSON.stringify({
      type: 'gameState',
      payload: this.game
    });

    this.connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  // Strategic command methods for ChatGPT tool integration
  handleSpecificRoundCommand(pieceId: number, direction: string, distance: number, round: number) {
    console.log(`🎯 Strategic command: Piece ${pieceId} ${direction} ${distance} for round ${round}`);

    // Reject commands for past rounds
    if (round < this.game.round) {
      console.log(`❌ Strategic command rejected: round ${round} has already passed (current: ${this.game.round})`);
      return false;
    }

    // Validate direction
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      console.log(`❌ Strategic command rejected: invalid direction ${direction}`);
      return false;
    }

    // Initialize round if it doesn't exist
    if (!this.game.commandQueue[round]) {
      this.game.commandQueue[round] = { playerA: [], playerB: [] };
    }

    const movement: Movement = {
      pieceId,
      direction: direction as 'up' | 'down' | 'left' | 'right',
      distance
    };

    // Find ChatGPT player and override their command for this piece in this round
    if (this.game.players.A?.type === 'chatgpt') {
      // Remove any existing command for this piece in this round
      this.game.commandQueue[round].playerA = this.game.commandQueue[round].playerA.filter(
        cmd => cmd.pieceId !== pieceId
      );
      // Add new command
      this.game.commandQueue[round].playerA.push(movement);
      console.log(`✅ Strategic command set for Player A: Piece ${pieceId} ${direction} ${distance} in round ${round}`);
    } else if (this.game.players.B?.type === 'chatgpt') {
      // Remove any existing command for this piece in this round
      this.game.commandQueue[round].playerB = this.game.commandQueue[round].playerB.filter(
        cmd => cmd.pieceId !== pieceId
      );
      // Add new command
      this.game.commandQueue[round].playerB.push(movement);
      console.log(`✅ Strategic command set for Player B: Piece ${pieceId} ${direction} ${distance} in round ${round}`);
    } else {
      console.log(`❌ Strategic command rejected: no ChatGPT player found`);
      return false;
    }

    this.broadcastGameState();
    return true;
  }

  cancelPieceCommands(pieceId: number) {
    console.log(`🚫 Cancelling all future commands for piece ${pieceId}`);

    let commandsCancelled = 0;

    // Find ChatGPT player and cancel their commands for this piece
    if (this.game.players.A?.type === 'chatgpt') {
      Object.keys(this.game.commandQueue).forEach(roundStr => {
        const round = parseInt(roundStr);
        if (round >= this.game.round) {
          const originalLength = this.game.commandQueue[round].playerA.length;
          this.game.commandQueue[round].playerA = this.game.commandQueue[round].playerA.filter(
            cmd => cmd.pieceId !== pieceId
          );
          commandsCancelled += originalLength - this.game.commandQueue[round].playerA.length;
        }
      });
      console.log(`✅ Cancelled ${commandsCancelled} commands for Player A Piece ${pieceId}`);
    } else if (this.game.players.B?.type === 'chatgpt') {
      Object.keys(this.game.commandQueue).forEach(roundStr => {
        const round = parseInt(roundStr);
        if (round >= this.game.round) {
          const originalLength = this.game.commandQueue[round].playerB.length;
          this.game.commandQueue[round].playerB = this.game.commandQueue[round].playerB.filter(
            cmd => cmd.pieceId !== pieceId
          );
          commandsCancelled += originalLength - this.game.commandQueue[round].playerB.length;
        }
      });
      console.log(`✅ Cancelled ${commandsCancelled} commands for Player B Piece ${pieceId}`);
    } else {
      console.log(`❌ Cancel command rejected: no ChatGPT player found`);
      return false;
    }

    this.broadcastGameState();
    return commandsCancelled;
  }
}

// Global game manager
const gameManager = new MovementCommanderGameManager();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.resolve(ROOT_DIR, "assets");

function readWidgetHtml(componentName: string): string {
  const componentPath = path.join(ASSETS_DIR, `${componentName}.html`);
  if (fs.existsSync(componentPath)) {
    return fs.readFileSync(componentPath, "utf-8");
  }
  return `<p>Widget ${componentName} not found</p>`;
}

// Define the widgets
const pizzazWidgets: PizzazWidget[] = [
  {
    id: "movement-commander",
    title: "Movement Commander",
    templateUri: "movement-commander-game",
    invoking: "Opening movement commander game...",
    invoked: "Movement commander game ready!",
    html: readWidgetHtml("movement-commander"),
    responseText: "Welcome to Movement Commander! Control your pieces through natural language commands.",
  },
];

const server = new Server(
  {
    name: "movement-commander",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Movement tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "move_piece",
        description: "Move a piece in a specific direction",
        inputSchema: {
          type: "object",
          properties: {
            pieceId: { type: "number", description: "Piece ID (1, 2, or 3)" },
            direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Direction to move" },
            distance: { type: "number", description: "Number of spaces to move" },
            targetRound: { type: "number", description: "Optional: specific round to execute the move" }
          },
          required: ["pieceId", "direction", "distance"]
        }
      },
      {
        name: "view_battle_plan",
        description: "View your queued movements for upcoming rounds",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "command_piece",
        description: "Command a piece to move in a specific direction for a specific round (overrides any existing command for that round)",
        inputSchema: {
          type: "object",
          properties: {
            pieceId: { type: "number", description: "Piece ID (1, 2, or 3)" },
            direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Direction to move" },
            distance: { type: "number", description: "Number of spaces to move" },
            round: { type: "number", description: "Specific round to execute the move" }
          },
          required: ["pieceId", "direction", "distance", "round"]
        }
      },
      {
        name: "cancel_piece_commands",
        description: "Cancel all future commands for a specific piece",
        inputSchema: {
          type: "object",
          properties: {
            pieceId: { type: "number", description: "Piece ID (1, 2, or 3)" }
          },
          required: ["pieceId"]
        }
      }
    ] satisfies Tool[]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "move_piece": {
        const { pieceId, direction, distance, targetRound } = args as {
          pieceId: number;
          direction: string;
          distance: number;
          targetRound?: number;
        };

        return {
          content: [
            {
              type: "text",
              text: `Movement command queued: Piece ${pieceId} move ${direction} ${distance} spaces${targetRound ? ` in round ${targetRound}` : ' next round'}`,
            },
            {
              type: "resource",
              resource: {
                uri: "movement-commander-game",
                mimeType: "text/html",
                text: readWidgetHtml("movement-commander"),
              },
            },
          ],
        };
      }

      case "view_battle_plan": {
        // TODO: Return current battle plan
        return {
          content: [
            {
              type: "text",
              text: "Battle plan view - showing your queued movements",
            },
            {
              type: "resource",
              resource: {
                uri: "movement-commander-game",
                mimeType: "text/html",
                text: readWidgetHtml("movement-commander"),
              },
            },
          ],
        };
      }

      case "command_piece": {
        const { pieceId, direction, distance, round } = args as {
          pieceId: number;
          direction: string;
          distance: number;
          round: number;
        };

        // Use the global game manager instance
        gameManager.handleSpecificRoundCommand(pieceId, direction, distance, round);

        return {
          content: [
            {
              type: "text",
              text: `Strategic command: Piece ${pieceId} will move ${direction} ${distance} spaces in round ${round} (overriding any existing command)`,
            },
            {
              type: "resource",
              resource: {
                uri: "movement-commander-game",
                mimeType: "text/html",
                text: readWidgetHtml("movement-commander"),
              },
            },
          ],
        };
      }

      case "cancel_piece_commands": {
        const { pieceId } = args as { pieceId: number };

        // Use the global game manager instance
        const cancelledCount = gameManager.cancelPieceCommands(pieceId);

        return {
          content: [
            {
              type: "text",
              text: `Cancelled ${cancelledCount} future commands for piece ${pieceId}`,
            },
            {
              type: "resource",
              resource: {
                uri: "movement-commander-game",
                mimeType: "text/html",
                text: readWidgetHtml("movement-commander"),
              },
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    throw new Error(`Error executing tool ${name}: ${error}`);
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: pizzazWidgets.map(widget => ({
      uri: widget.templateUri,
      name: widget.title,
      mimeType: "text/html",
      description: `${widget.title} widget`
    })) satisfies Resource[]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
  const { uri } = request.params;
  const widget = pizzazWidgets.find(w => w.templateUri === uri);

  if (!widget) {
    throw new Error(`Resource not found: ${uri}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: "text/html",
        text: widget.html
      }
    ]
  };
});

// HTTP Server setup
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (url.pathname === "/mcp") {
    const transport = new SSEServerTransport("/mcp", res);
    await server.connect(transport);
  } else if (url.pathname.startsWith("/mcp/messages")) {
    if (req.method === "POST") {
      let body = "";
      req.on("data", chunk => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const message = JSON.parse(body);
          const response = await server.handleRequest(message);
          res.setHeader("Content-Type", "application/json");
          res.writeHead(200);
          res.end(JSON.stringify(response));
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
    }
  } else if (url.pathname.startsWith("/")) {
    // Static file serving
    const fileName = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const filePath = path.join(ASSETS_DIR, fileName);

    console.log(`📁 Static file request: ${url.pathname}`);
    console.log(`📂 Looking for file at: ${filePath}`);
    console.log(`📋 File exists: ${fs.existsSync(filePath)}`);

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      const mimeTypes: { [key: string]: string } = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
      };

      res.setHeader('Content-Type', mimeTypes[ext] || 'text/plain');
      res.writeHead(200);
      res.end(content);
    } else {
      res.writeHead(404);
      res.end('File not found');
    }
  }
});

// WebSocket Server for multiplayer
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('🎮 New WebSocket connection for movement commander game');
  gameManager.addConnection(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 WebSocket message:', message.type);
      gameManager.handleMessage(ws, message);
    } catch (error) {
      console.error('💥 Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');
  });
});

const PORT = process.env.PORT || 9999;

httpServer.listen(PORT, () => {
  console.log(`Movement Commander MCP server listening on http://localhost:${PORT}`);
  console.log(`  SSE stream: GET http://localhost:${PORT}/mcp`);
  console.log(`  Message post endpoint: POST http://localhost:${PORT}/mcp/messages?sessionId=...`);
  console.log(`  🎮 WebSocket server: ws://localhost:${PORT}/ws`);
});