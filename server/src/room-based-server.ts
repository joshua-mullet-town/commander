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

// Types
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

type Player = {
  id: string;
  type: 'chatgpt' | 'local-a' | 'local-b';
  pieces: Piece[];
  connection: WebSocket;
};

type GameRoom = {
  roomCode: string;
  players: {
    A: Player | null;
    B: Player | null;
  };
  round: number;
  commandQueue: {
    [round: number]: {
      playerA: Movement[];
      playerB: Movement[];
    };
  };
  gameStatus: 'waiting' | 'playing' | 'finished' | 'paused';
  nextTickIn: number;
  lastRoundTime: number;
  gameTimer: NodeJS.Timeout | null;
  createdAt: number;
};

type GameMessage = {
  type: 'gameState' | 'move' | 'createRoom' | 'joinRoom' | 'reset' | 'start' | 'pause';
  payload: any;
};

class RoomBasedGameManager {
  private rooms: Map<string, GameRoom> = new Map();
  private connectionToRoom: Map<WebSocket, string> = new Map();

  constructor() {
    // Clean up empty rooms every minute
    setInterval(() => this.cleanupEmptyRooms(), 60000);
  }

  // Generate a 6-character room code
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    do {
      result = '';
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(result)); // Ensure uniqueness
    return result;
  }

  // Create a new game room
  createRoom(): string {
    const roomCode = this.generateRoomCode();
    const room: GameRoom = {
      roomCode,
      players: { A: null, B: null },
      round: 1,
      commandQueue: {},
      gameStatus: 'waiting',
      nextTickIn: 3,
      lastRoundTime: Date.now(),
      gameTimer: null,
      createdAt: Date.now()
    };

    this.rooms.set(roomCode, room);
    console.log(`🏠 Created room ${roomCode}`);
    return roomCode;
  }

  // Join a player to a room
  joinRoom(roomCode: string, ws: WebSocket, playerType: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) {
      console.log(`❌ Room ${roomCode} not found`);
      return false;
    }

    const playerId = this.generatePlayerId();

    // Assign player to first available slot
    if (!room.players.A) {
      room.players.A = {
        id: playerId,
        type: playerType as any,
        pieces: [
          { id: 1, x: 1, y: 0, alive: true },
          { id: 2, x: 5, y: 0, alive: true },
          { id: 3, x: 8, y: 0, alive: true }
        ],
        connection: ws
      };
      console.log(`👤 Player A joined room ${roomCode} as ${playerType}`);
    } else if (!room.players.B) {
      room.players.B = {
        id: playerId,
        type: playerType as any,
        pieces: [
          { id: 1, x: 1, y: 9, alive: true },
          { id: 2, x: 5, y: 9, alive: true },
          { id: 3, x: 8, y: 9, alive: true }
        ],
        connection: ws
      };
      console.log(`👤 Player B joined room ${roomCode} as ${playerType}`);
    } else {
      console.log(`❌ Room ${roomCode} is full`);
      return false;
    }

    this.connectionToRoom.set(ws, roomCode);

    // Auto-start game when both players join
    if (room.players.A && room.players.B) {
      room.gameStatus = 'playing';
      this.startGameLoop(roomCode);
      console.log(`🎯 Game started in room ${roomCode}! A: ${room.players.A.type}, B: ${room.players.B.type}`);
    }

    this.broadcastRoomState(roomCode);
    return true;
  }

  // Handle player disconnection
  handleDisconnection(ws: WebSocket) {
    const roomCode = this.connectionToRoom.get(ws);
    if (!roomCode) return;

    const room = this.rooms.get(roomCode);
    if (!room) return;

    // Remove player from room
    if (room.players.A?.connection === ws) {
      console.log(`❌ Player A disconnected from room ${roomCode}`);
      room.players.A = null;
    }
    if (room.players.B?.connection === ws) {
      console.log(`❌ Player B disconnected from room ${roomCode}`);
      room.players.B = null;
    }

    this.connectionToRoom.delete(ws);

    // Stop game if no players left
    if (!room.players.A && !room.players.B) {
      this.stopGameLoop(roomCode);
      console.log(`🛑 Room ${roomCode} emptied, stopping game`);
    } else {
      // Pause game if only one player
      room.gameStatus = 'paused';
      this.stopGameLoop(roomCode);
      this.broadcastRoomState(roomCode);
    }
  }

  // Handle movement command for specific room
  handleMovementCommand(ws: WebSocket, payload: { pieceId: number; direction: string; distance: number; targetRound?: number; playerType?: string }) {
    const roomCode = this.connectionToRoom.get(ws);
    if (!roomCode) {
      console.log(`❌ Movement rejected: connection not in any room`);
      return;
    }

    const room = this.rooms.get(roomCode);
    if (!room) return;

    const { pieceId, direction, distance, targetRound, playerType } = payload;

    // Determine player
    let player: 'A' | 'B' | null = null;
    if (playerType) {
      if (room.players.A?.type === playerType) player = 'A';
      else if (room.players.B?.type === playerType) player = 'B';
    } else {
      if (room.players.A?.connection === ws) player = 'A';
      else if (room.players.B?.connection === ws) player = 'B';
    }

    if (!player) {
      console.log(`❌ Movement rejected: player not found in room ${roomCode}`);
      return;
    }

    const round = targetRound || room.round + 1;

    // Reject commands for past rounds
    if (round < room.round) {
      console.log(`❌ Movement rejected: round ${round} has already passed (current: ${room.round})`);
      return;
    }

    // Validate direction
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      console.log(`❌ Movement rejected: invalid direction ${direction}`);
      return;
    }

    // Initialize round if it doesn't exist
    if (!room.commandQueue[round]) {
      room.commandQueue[round] = { playerA: [], playerB: [] };
    }

    const movement: Movement = {
      pieceId,
      direction: direction as 'up' | 'down' | 'left' | 'right',
      distance
    };

    // Add to command queue
    if (player === 'A') {
      room.commandQueue[round].playerA.push(movement);
    } else {
      room.commandQueue[round].playerB.push(movement);
    }

    console.log(`✅ [${roomCode}] Movement queued: Player ${player} Piece ${pieceId} ${direction} ${distance} for Round ${round}`);
    this.broadcastRoomState(roomCode);
  }

  // Start game loop for specific room
  private startGameLoop(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room || room.gameTimer) return;

    room.gameTimer = setInterval(() => {
      room.nextTickIn--;

      if (room.nextTickIn <= 0) {
        this.executeRound(roomCode);
        room.nextTickIn = 3; // Reset to 3 seconds
      }

      this.broadcastRoomState(roomCode);
    }, 1000);
  }

  // Stop game loop for specific room
  private stopGameLoop(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.gameTimer) return;

    clearInterval(room.gameTimer);
    room.gameTimer = null;
  }

  // Execute round for specific room
  private executeRound(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    console.log(`⚡ [${roomCode}] Executing Round ${room.round}`);

    const roundCommands = room.commandQueue[room.round];
    if (roundCommands) {
      // Execute Player A commands
      roundCommands.playerA.forEach(movement => {
        if (room.players.A) {
          this.executePieceMovement(room.players.A, movement, 'A', roomCode);
        }
      });

      // Execute Player B commands
      roundCommands.playerB.forEach(movement => {
        if (room.players.B) {
          this.executePieceMovement(room.players.B, movement, 'B', roomCode);
        }
      });

      // Clear executed commands
      delete room.commandQueue[room.round];
    }

    room.round++;
    room.lastRoundTime = Date.now();
  }

  // Execute piece movement for specific room
  private executePieceMovement(player: Player, movement: Movement, playerLetter: 'A' | 'B', roomCode: string) {
    const piece = player.pieces.find(p => p.id === movement.pieceId && p.alive);
    if (!piece) return;

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

    // Check bounds (10x10 grid: 0-9)
    if (newX < 0 || newX > 9 || newY < 0 || newY > 9) {
      console.log(`💀 [${roomCode}] Player ${playerLetter} Piece ${movement.pieceId} moved off the board and died!`);
      piece.alive = false;
      return;
    }

    // Update position
    piece.x = newX;
    piece.y = newY;
    console.log(`✅ [${roomCode}] Player ${playerLetter} Piece ${movement.pieceId} moved to (${newX}, ${newY})`);
  }

  // Broadcast game state to all players in room
  private broadcastRoomState(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const gameState = {
      roomCode,
      round: room.round,
      players: {
        A: room.players.A ? {
          id: room.players.A.id,
          type: room.players.A.type,
          pieces: room.players.A.pieces
        } : null,
        B: room.players.B ? {
          id: room.players.B.id,
          type: room.players.B.type,
          pieces: room.players.B.pieces
        } : null
      },
      commandQueue: room.commandQueue,
      gameStatus: room.gameStatus,
      nextTickIn: room.nextTickIn,
      lastRoundTime: room.lastRoundTime
    };

    const message = JSON.stringify({
      type: 'gameState',
      payload: gameState
    });

    // Send to all players in this room
    [room.players.A, room.players.B].forEach(player => {
      if (player && player.connection.readyState === WebSocket.OPEN) {
        player.connection.send(message);
      }
    });
  }

  // Clean up empty rooms
  private cleanupEmptyRooms() {
    const now = Date.now();
    const roomsToDelete = [];

    for (const [roomCode, room] of this.rooms.entries()) {
      // Delete rooms that are empty and older than 5 minutes
      if (!room.players.A && !room.players.B && (now - room.createdAt) > 5 * 60 * 1000) {
        roomsToDelete.push(roomCode);
      }
    }

    roomsToDelete.forEach(roomCode => {
      this.stopGameLoop(roomCode);
      this.rooms.delete(roomCode);
      console.log(`🗑️ Cleaned up empty room ${roomCode}`);
    });
  }

  // Generate unique player ID
  private generatePlayerId(): string {
    return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Handle WebSocket messages
  handleMessage(ws: WebSocket, message: GameMessage) {
    switch (message.type) {
      case 'createRoom':
        const roomCode = this.createRoom();
        ws.send(JSON.stringify({
          type: 'roomCreated',
          payload: { roomCode }
        }));
        break;

      case 'joinRoom':
        const { roomCode: joinRoomCode, playerType } = message.payload;
        const joined = this.joinRoom(joinRoomCode, ws, playerType);
        if (!joined) {
          ws.send(JSON.stringify({
            type: 'error',
            payload: { message: 'Failed to join room' }
          }));
        }
        break;

      case 'listRooms':
        const availableRooms = Array.from(this.rooms.entries()).map(([code, room]) => ({
          roomCode: code,
          gameStatus: room.gameStatus,
          players: {
            A: room.players.A ? { type: room.players.A.type } : null,
            B: room.players.B ? { type: room.players.B.type } : null
          },
          round: room.round
        }));
        ws.send(JSON.stringify({
          type: 'roomsList',
          payload: { rooms: availableRooms }
        }));
        console.log(`📋 Listed ${availableRooms.length} available rooms`);
        break;

      case 'move':
        this.handleMovementCommand(ws, message.payload);
        break;

      case 'reset':
        // Reset specific room
        const resetRoomCode = this.connectionToRoom.get(ws);
        if (resetRoomCode) {
          const room = this.rooms.get(resetRoomCode);
          if (room) {
            room.round = 1;
            room.commandQueue = {};
            room.gameStatus = room.players.A && room.players.B ? 'playing' : 'waiting';
            room.nextTickIn = 3;
            this.broadcastRoomState(resetRoomCode);
            console.log(`🔄 [${resetRoomCode}] Game reset`);
          }
        }
        break;
    }
  }

  // Add connection handler
  addConnection(ws: WebSocket) {
    console.log(`🔌 New WebSocket connection`);

    ws.on('close', () => {
      this.handleDisconnection(ws);
    });

    ws.on('error', (error) => {
      console.log(`💥 WebSocket error:`, error);
      this.handleDisconnection(ws);
    });
  }

  // Get room info (for debugging)
  getRoomInfo(): any {
    const rooms = {};
    for (const [code, room] of this.rooms.entries()) {
      rooms[code] = {
        players: Object.keys(room.players).filter(key => room.players[key] !== null),
        status: room.gameStatus,
        round: room.round
      };
    }
    return rooms;
  }
}

// Server setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = parseInt(process.env.PORT || "8001");

const gameManager = new RoomBasedGameManager();

// Create HTTP server
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);

  // Handle static file requests
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    const assetPath = path.join(__dirname, '..', '..', 'assets', url.pathname);
    console.log(`📁 Static file request: ${url.pathname}`);
    console.log(`📂 Looking for file at: ${assetPath}`);

    const exists = fs.existsSync(assetPath);
    console.log(`📋 File exists: ${exists}`);

    if (exists) {
      const content = fs.readFileSync(assetPath, 'utf-8');
      const ext = path.extname(url.pathname);
      const contentType = ext === '.html' ? 'text/html' :
                         ext === '.js' ? 'application/javascript' :
                         ext === '.css' ? 'text/css' : 'text/plain';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return;
    }
  }

  // Handle MCP server for SSE connections
  if (url.pathname === "/mcp") {
    const mcpServer = new Server(
      {
        name: "pizzaz-movement-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    const transport = new SSEServerTransport("/mcp", res);
    server.connect(transport);
    return;
  }

  // Default 404
  res.writeHead(404);
  res.end("Not found");
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  gameManager.addConnection(ws);

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString()) as GameMessage;
      console.log(`📨 WebSocket message: ${message.type}`, message.payload ? JSON.stringify(message.payload) : '');
      gameManager.handleMessage(ws, message);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
});

server.listen(port, () => {
  console.log(`Movement Commander Room-Based Server listening on http://localhost:${port}`);
  console.log(`  🎮 WebSocket server: ws://localhost:${port}/ws`);
  console.log(`  📊 Room info endpoint: GET http://localhost:${port}/rooms`);
});