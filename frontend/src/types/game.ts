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
  noGuardZoneActive?: {
    A: boolean;
    B: boolean;
  };
  noGuardZoneBounds?: {
    A: { minX: number; maxX: number; minY: number; maxY: number };
    B: { minX: number; maxX: number; minY: number; maxY: number };
  };
  serverStartTime?: number;
  history?: GameHistory;
}

// Lobby interfaces
export interface AvailableGame {
  roomCode: string;
  playerCount: number;
  status: string;
}

export type Movement = {
  pieceId: number;
  direction: 'up' | 'down' | 'left' | 'right';
  distance: number;
};

export type PieceScoring = {
  pieceId: number;
  action: string;
  points: number;
};

export type TeamAnalysis = {
  teamName: 'Blue' | 'Red';
  alivePieces: number;
  scoringPieces: PieceScoring[];
  totalPoints: number;
};

export type AIAnalysis = {
  executionTime: number;
  scenariosEvaluated: number;
  worstCaseScore: number;
  similarMoves: number;
  chosenMoves: Movement[];
  predictedEnemyMoves: Movement[];
  predictedScoreBreakdown: {
    A: ScoreBreakdown;
    B: ScoreBreakdown;
  };
  finalScore: number;
};

export type ScoreBreakdown = {
  total: number;
  weHaveFlag: number;
  theyHaveFlag: number;
  weOnTheirFlag: number;
  theyOnOurFlag: number;
  weInTheirSafeZone: number;
  theyInOurSafeZone: number;
  weOnBackWall: number;
  theyOnBackWall: number;
  pieceAdvantage: number;
  capturesThisRound: number;
};

export type RoundHistory = {
  round: number;
  playerAMoves: Movement[];
  playerBMoves: Movement[];
  aiReasoning?: string;
  aiAnalysis?: AIAnalysis;
  aiPrompt?: string;
  piecesBeforeMove?: {
    A: GamePiece[];
    B: GamePiece[];
  };
  piecesAfterMove?: {
    A: GamePiece[];
    B: GamePiece[];
  };
  actualScoreAfterMove?: {
    A: ScoreBreakdown; // Blue team's full score breakdown (from Blue's perspective)
    B: ScoreBreakdown; // Red team's full score breakdown (from Red's perspective)
  };
};

export type GameHistory = RoundHistory[];

// WebSocket message types
export interface WebSocketMessage {
  type: string;
  payload: any;
}