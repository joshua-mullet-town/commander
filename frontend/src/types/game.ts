// Game state interfaces
export interface GamePiece {
  id: number;
  x: number;
  y: number;
  alive: boolean;
}

export interface Player {
  type: string;
  pieces: GamePiece[];
}

export interface GamePlayers {
  A: Player | null;
  B: Player | null;
}

export interface Command {
  pieceId: number;
  direction: 'up' | 'down' | 'left' | 'right';
  distance: number;
}

export interface CommandQueue {
  [round: string]: {
    playerA?: Command[];
    playerB?: Command[];
  };
}

export interface GameState {
  round: number;
  nextTickIn?: number;
  lastRoundTime?: number;
  gameStatus: 'waiting' | 'paused' | 'playing' | 'finished';
  winner?: 'A' | 'B';
  players: GamePlayers;
  commandQueue: CommandQueue;
  rescueKeys: {
    A: { x: number; y: number } | null;
    B: { x: number; y: number } | null;
  };
  flags: {
    A: { x: number; y: number; carriedBy: { player: 'A' | 'B'; pieceId: number } | null };
    B: { x: number; y: number; carriedBy: { player: 'A' | 'B'; pieceId: number } | null };
  };
}

// Lobby interfaces
export interface AvailableGame {
  roomCode: string;
  playerCount: number;
  status: string;
}

// WebSocket message types
export interface WebSocketMessage {
  type: string;
  payload: any;
}