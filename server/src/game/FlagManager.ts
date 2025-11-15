/**
 * FlagManager
 * Handles flag capture mechanics:
 * - Blue flag at (5,10) - center back of blue territory
 * - Red flag at (5,0) - center back of red territory
 * - Piece lands on enemy flag → picks it up
 * - Flag carrier gets tagged → flag returns, carrier jailed
 * - Flag carrier reaches own territory → WINS
 */

type Piece = {
  id: number;
  x: number;
  y: number;
  alive: boolean;
};

type PlayerData = {
  id: string;
  type: 'chatgpt' | 'local' | 'local-a' | 'local-b';
  pieces: Piece[];
  jailedPieces: number[];
};

type GameState = {
  players: {
    A: PlayerData | null;
    B: PlayerData | null;
  };
  flags: {
    A: { x: number; y: number; carriedBy: { player: 'A' | 'B'; pieceId: number } | null };
    B: { x: number; y: number; carriedBy: { player: 'A' | 'B'; pieceId: number } | null };
  };
  gameStatus: 'waiting' | 'paused' | 'playing' | 'finished';
  winner?: 'A' | 'B';
  [key: string]: any;
};

// Flag spawn positions
const FLAG_POSITIONS = {
  A: { x: 5, y: 10 }, // Blue flag - center back of blue territory
  B: { x: 5, y: 0 }   // Red flag - center back of red territory
};

// Territory boundaries (y-coordinates)
const TERRITORY = {
  A: { min: 6, max: 10 },  // Blue territory: rows 6-10
  B: { min: 0, max: 4 }     // Red territory: rows 0-4
};

export class FlagManager {
  /**
   * Initialize flags at their spawn positions
   */
  initializeFlags(gameState: GameState): void {
    gameState.flags = {
      A: { ...FLAG_POSITIONS.A, carriedBy: null },
      B: { ...FLAG_POSITIONS.B, carriedBy: null }
    };
    console.log(`🚩 Flags initialized - Blue: (${FLAG_POSITIONS.A.x}, ${FLAG_POSITIONS.A.y}), Red: (${FLAG_POSITIONS.B.x}, ${FLAG_POSITIONS.B.y})`);
  }

  /**
   * Check if any pieces picked up flags or scored
   */
  checkFlagInteractions(gameState: GameState): void {
    if (!gameState.flags) {
      this.initializeFlags(gameState);
      return;
    }

    // Check if Player A pieces interact with flags
    if (gameState.players.A) {
      gameState.players.A.pieces.forEach(piece => {
        if (!piece.alive) return;

        // Check if Blue piece picked up Red flag
        const redFlag = gameState.flags.B;
        if (!redFlag.carriedBy && piece.x === redFlag.x && piece.y === redFlag.y) {
          this.pickupFlag(gameState, 'A', piece.id, 'B');
        }

        // Check if Blue piece with Red flag scored
        if (redFlag.carriedBy?.player === 'A' && redFlag.carriedBy.pieceId === piece.id) {
          if (this.isInTerritory(piece, 'A')) {
            this.scoreFlag(gameState, 'A');
          }
        }
      });
    }

    // Check if Player B pieces interact with flags
    if (gameState.players.B) {
      gameState.players.B.pieces.forEach(piece => {
        if (!piece.alive) return;

        // Check if Red piece picked up Blue flag
        const blueFlag = gameState.flags.A;
        if (!blueFlag.carriedBy && piece.x === blueFlag.x && piece.y === blueFlag.y) {
          this.pickupFlag(gameState, 'B', piece.id, 'A');
        }

        // Check if Red piece with Blue flag scored
        if (blueFlag.carriedBy?.player === 'B' && blueFlag.carriedBy.pieceId === piece.id) {
          if (this.isInTerritory(piece, 'B')) {
            this.scoreFlag(gameState, 'B');
          }
        }
      });
    }

    // Update flag positions for carriers
    this.updateFlagPositions(gameState);
  }

  /**
   * Handle flag pickup
   */
  private pickupFlag(gameState: GameState, player: 'A' | 'B', pieceId: number, flagTeam: 'A' | 'B'): void {
    const teamName = player === 'A' ? 'Blue' : 'Red';
    const flagName = flagTeam === 'A' ? 'Blue' : 'Red';
    const emoji = player === 'A' ? '🔵' : '🔴';

    gameState.flags[flagTeam].carriedBy = { player, pieceId };
    console.log(`${emoji} ${teamName} Piece ${pieceId} picked up the ${flagName} flag!`);
  }

  /**
   * Handle flag scoring (win condition)
   */
  private scoreFlag(gameState: GameState, player: 'A' | 'B'): void {
    const teamName = player === 'A' ? 'Blue' : 'Red';
    const emoji = player === 'A' ? '🔵' : '🔴';

    console.log(`🎉 ${emoji} ${teamName} TEAM WINS! Flag captured!`);
    gameState.gameStatus = 'finished';
    gameState.winner = player;
  }

  /**
   * Check if piece is in their own territory
   */
  private isInTerritory(piece: Piece, player: 'A' | 'B'): boolean {
    const territory = TERRITORY[player];
    return piece.y >= territory.min && piece.y <= territory.max;
  }

  /**
   * Update flag positions to follow carriers
   */
  private updateFlagPositions(gameState: GameState): void {
    // Update Blue flag position
    const blueFlag = gameState.flags.A;
    if (blueFlag.carriedBy) {
      const carrier = gameState.players[blueFlag.carriedBy.player]?.pieces.find(
        p => p.id === blueFlag.carriedBy!.pieceId
      );
      if (carrier && carrier.alive) {
        blueFlag.x = carrier.x;
        blueFlag.y = carrier.y;
      } else {
        // Carrier died or disappeared - return flag
        this.returnFlag(gameState, 'A');
      }
    }

    // Update Red flag position
    const redFlag = gameState.flags.B;
    if (redFlag.carriedBy) {
      const carrier = gameState.players[redFlag.carriedBy.player]?.pieces.find(
        p => p.id === redFlag.carriedBy!.pieceId
      );
      if (carrier && carrier.alive) {
        redFlag.x = carrier.x;
        redFlag.y = carrier.y;
      } else {
        // Carrier died or disappeared - return flag
        this.returnFlag(gameState, 'B');
      }
    }
  }

  /**
   * Return flag to spawn when carrier is captured
   */
  returnFlag(gameState: GameState, flagTeam: 'A' | 'B'): void {
    const flagName = flagTeam === 'A' ? 'Blue' : 'Red';
    const spawnPos = FLAG_POSITIONS[flagTeam];

    gameState.flags[flagTeam].x = spawnPos.x;
    gameState.flags[flagTeam].y = spawnPos.y;
    gameState.flags[flagTeam].carriedBy = null;

    console.log(`🚩 ${flagName} flag returned to spawn (${spawnPos.x}, ${spawnPos.y})`);
  }

  /**
   * Handle piece capture - return flag if carrier was captured
   */
  onPieceCaptured(gameState: GameState, player: 'A' | 'B', pieceId: number): void {
    // Check if captured piece was carrying Blue flag
    if (gameState.flags.A.carriedBy?.player === player && gameState.flags.A.carriedBy.pieceId === pieceId) {
      this.returnFlag(gameState, 'A');
    }

    // Check if captured piece was carrying Red flag
    if (gameState.flags.B.carriedBy?.player === player && gameState.flags.B.carriedBy.pieceId === pieceId) {
      this.returnFlag(gameState, 'B');
    }
  }
}
