/**
 * RoomManager
 * Manages room lifecycle and state
 */

import type { WebSocket } from 'ws';
import type { GameRoom, CommanderGameState, Player } from './types';
import { STARTING_POSITIONS } from './constants';
import { HumanPlayer } from './Player.js';
import { AIPlayer } from './AIPlayer.js';
import { MinimaxAI } from '../ai/strategies/MinimaxStrategy.js';
import { NashAI } from '../ai/strategies/NashStrategy.js';
import { PositionExplorationAI } from '../ai/strategies/PositionExplorationStrategy.js';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private serverStartTime: number;

  constructor(serverStartTime?: number) {
    this.serverStartTime = serverStartTime || Date.now();
  }

  /**
   * Create a new game room
   */
  createRoom(roomCode: string, creator: WebSocket, playerTypeStr: string = 'local-a'): GameRoom {
    const playerA = this.createPlayer('player-a', 'A', playerTypeStr);

    const room: GameRoom = {
      roomCode,
      playerCount: 1,
      status: 'waiting',
      createdAt: Date.now(),
      gameState: this.createInitialGameState(playerA),
      connections: new Set([creator]),
      gameTimer: null,
      history: [],
    };

    this.rooms.set(roomCode, room);
    console.log(`✅ Room ${roomCode} created (Player A: ${playerA.type})`);
    console.log(`🎯 No-guard zone visualization fix: bounds included in game state`);
    return room;
  }

  /**
   * Join an existing room
   */
  joinRoom(roomCode: string, joiner: WebSocket, playerTypeStr: string = 'local-b'): GameRoom | null {
    const room = this.rooms.get(roomCode);
    if (!room) {
      console.log(`❌ Room ${roomCode} not found`);
      return null;
    }

    if (room.playerCount >= 2) {
      console.log(`❌ Room ${roomCode} is full`);
      return null;
    }

    room.connections.add(joiner);
    room.playerCount++;

    // Initialize Player B
    if (!room.gameState.players.B) {
      const playerB = this.createPlayer('player-b', 'B', playerTypeStr);
      room.gameState.players.B = {
        id: 'player-b',
        player: playerB,
        pieces: STARTING_POSITIONS.B.map(pos => ({ ...pos, alive: true })),
        jailedPieces: [],
      };
    }

    console.log(`✅ Player joined room ${roomCode} (Player B: ${room.gameState.players.B.player.type})`);
    return room;
  }

  /**
   * Get a room by code
   */
  getRoom(roomCode: string): GameRoom | null {
    return this.rooms.get(roomCode) || null;
  }

  /**
   * Get room by WebSocket connection
   */
  getRoomByConnection(ws: WebSocket): GameRoom | null {
    for (const room of this.rooms.values()) {
      if (room.connections.has(ws)) {
        return room;
      }
    }
    return null;
  }

  /**
   * Remove a WebSocket connection from rooms
   */
  removeConnection(ws: WebSocket): void {
    for (const room of this.rooms.values()) {
      if (room.connections.has(ws)) {
        room.connections.delete(ws);
        room.playerCount--;
        console.log(`🚪 Player left room ${room.roomCode} (${room.playerCount} remaining)`);

        // Clean up empty rooms
        if (room.connections.size === 0) {
          if (room.gameTimer) {
            clearInterval(room.gameTimer);
          }
          this.rooms.delete(room.roomCode);
          console.log(`🗑️ Empty room ${room.roomCode} deleted`);
        }
      }
    }
  }

  /**
   * Get all rooms
   */
  getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Broadcast message to all connections in a room
   */
  broadcastToRoom(roomCode: string, message: any): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    room.connections.forEach(ws => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(messageStr);
      }
    });
  }

  /**
   * Create initial game state for a new room
   */
  private createInitialGameState(playerA: Player): CommanderGameState {
    return {
      round: 1,
      players: {
        A: {
          id: 'player-a',
          player: playerA,
          pieces: STARTING_POSITIONS.A.map(pos => ({ ...pos, alive: true })),
          jailedPieces: [],
        },
        B: null, // Player B joins later
      },
      commandQueue: {},
      rescueKeys: { A: null, B: null },
      flags: {
        A: { x: 5, y: 10, carriedBy: null }, // Blue flag at center back
        B: { x: 5, y: 0, carriedBy: null },  // Red flag at center back
      },
      noGuardZoneActive: {
        A: true, // Blue no-guard zone active
        B: true, // Red no-guard zone active
      },
      noGuardZoneBounds: {
        A: this.getNoGuardZoneBounds('A'),
        B: this.getNoGuardZoneBounds('B'),
      },
      gameStatus: 'waiting',
      nextTickIn: 3,
      lastRoundTime: Date.now(),
      serverStartTime: this.serverStartTime, // Track when backend server started
    };
  }

  /**
   * Create a Player instance based on type string
   */
  private createPlayer(id: string, side: 'A' | 'B', typeStr: string): Player {
    console.log(`🔧 RoomManager.createPlayer() - id: ${id}, side: ${side}, typeStr: ${typeStr}`);
    if (typeStr === 'ai') {
      console.log(`🎯 Creating AI player ${id} with ${PositionExplorationAI.name} strategy (Position Exploration)`);
      const aiPlayer = new AIPlayer(id, side, PositionExplorationAI);
      console.log(`✅ AIPlayer created - Strategy info:`, aiPlayer.getStrategyInfo());
      return aiPlayer;
    }
    console.log(`👤 Creating HumanPlayer ${id} for side ${side}`);
    return new HumanPlayer(id, side);
  }

  /**
   * Get no-guard zone boundaries for visualization
   */
  private getNoGuardZoneBounds(team: 'A' | 'B'): { minX: number; maxX: number; minY: number; maxY: number } {
    const flagX = 5;
    const flagY = team === 'A' ? 10 : 0;
    const radius = 1;

    return {
      minX: flagX - radius,
      maxX: flagX + radius,
      minY: team === 'A' ? flagY - radius : flagY,
      maxY: team === 'A' ? flagY : flagY + radius,
    };
  }
}
