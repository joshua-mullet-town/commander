/**
 * RescueKeyManager
 * Handles TWO INDEPENDENT rescue keys - one for each team
 * - Blue key appears at (9,1) when Blue has jail
 * - Red key appears at (1,9) when Red has jail
 * - Both can exist simultaneously
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
  rescueKeys: {
    A: { x: number; y: number } | null;
    B: { x: number; y: number } | null;
  };
  [key: string]: any;
};

// Starting positions for piece reset after rescue
const STARTING_POSITIONS = {
  A: [
    { id: 1, x: 4, y: 9 },
    { id: 2, x: 5, y: 9 },
    { id: 3, x: 6, y: 9 }
  ],
  B: [
    { id: 1, x: 4, y: 1 },
    { id: 2, x: 5, y: 1 },
    { id: 3, x: 6, y: 1 }
  ]
};

// Fixed key positions
const KEY_POSITIONS = {
  A: { x: 9, y: 1 }, // Blue team's key in RED territory (top-right)
  B: { x: 1, y: 9 }  // Red team's key in BLUE territory (bottom-left)
};

export class RescueKeyManager {
  // Track rescues that happened: playerLetter -> list of piece IDs that need reset
  private pendingRescues: Map<'A' | 'B', number[]> = new Map();

  /**
   * Reset pieces from rescues that happened in the previous round
   * This allows the frontend to show the piece reaching the key before resetting
   */
  resetRescuingPieces(gameState: GameState): void {
    this.pendingRescues.forEach((pieceIds, playerLetter) => {
      const player = gameState.players[playerLetter];
      if (!player) return;

      const teamName = playerLetter === 'A' ? 'Blue' : 'Red';
      const emoji = playerLetter === 'A' ? '🔵' : '🔴';

      // Reset all pieces involved in this rescue
      pieceIds.forEach(pieceId => {
        const piece = player.pieces.find(p => p.id === pieceId);
        const startPos = STARTING_POSITIONS[playerLetter].find(p => p.id === pieceId);

        if (piece && startPos) {
          piece.x = startPos.x;
          piece.y = startPos.y;
          piece.alive = true;
          console.log(`${emoji} ${teamName} Piece ${pieceId} reset to start position (${startPos.x}, ${startPos.y}) after rescue`);
        }
      });
    });

    this.pendingRescues.clear();
  }

  /**
   * Update both rescue keys based on current jail state
   * Each team's key is completely independent
   */
  updateKeys(gameState: GameState): void {
    const playerA = gameState.players.A;
    const playerB = gameState.players.B;

    // Handle Blue team's key
    const playerAHasJail = playerA && playerA.jailedPieces.length > 0;
    if (playerAHasJail && !gameState.rescueKeys.A) {
      gameState.rescueKeys.A = KEY_POSITIONS.A;
      console.log(`🔵 Blue rescue key spawned at (${KEY_POSITIONS.A.x}, ${KEY_POSITIONS.A.y})`);
    } else if (!playerAHasJail && gameState.rescueKeys.A) {
      gameState.rescueKeys.A = null;
      console.log(`🔵 Blue rescue key removed - no jailed pieces`);
    }

    // Handle Red team's key
    const playerBHasJail = playerB && playerB.jailedPieces.length > 0;
    if (playerBHasJail && !gameState.rescueKeys.B) {
      gameState.rescueKeys.B = KEY_POSITIONS.B;
      console.log(`🔴 Red rescue key spawned at (${KEY_POSITIONS.B.x}, ${KEY_POSITIONS.B.y})`);
    } else if (!playerBHasJail && gameState.rescueKeys.B) {
      gameState.rescueKeys.B = null;
      console.log(`🔴 Red rescue key removed - no jailed pieces`);
    }
  }

  /**
   * Check if any pieces picked up their team's rescue key
   */
  checkForRescue(gameState: GameState): void {
    const playerA = gameState.players.A;
    const playerB = gameState.players.B;

    // Check if Blue team picked up their key
    if (playerA && gameState.rescueKeys.A) {
      const key = gameState.rescueKeys.A;
      playerA.pieces.forEach(piece => {
        if (piece.alive && piece.x === key.x && piece.y === key.y) {
          this.performRescue(playerA, piece, 'A', gameState);
        }
      });
    }

    // Check if Red team picked up their key
    if (playerB && gameState.rescueKeys.B) {
      const key = gameState.rescueKeys.B;
      playerB.pieces.forEach(piece => {
        if (piece.alive && piece.x === key.x && piece.y === key.y) {
          this.performRescue(playerB, piece, 'B', gameState);
        }
      });
    }

    // Update keys after checking for rescues
    this.updateKeys(gameState);
  }

  /**
   * Perform the actual rescue operation for a team
   * - Immediately resets jailed pieces to start
   * - Delays rescuer reset to next round (so frontend can show animation)
   */
  private performRescue(
    player: PlayerData,
    rescuingPiece: Piece,
    playerLetter: 'A' | 'B',
    gameState: GameState
  ): void {
    const teamName = playerLetter === 'A' ? 'Blue' : 'Red';
    const emoji = playerLetter === 'A' ? '🔵' : '🔴';

    console.log(`${emoji} ${teamName} Piece ${rescuingPiece.id} picked up rescue key at (${rescuingPiece.x}, ${rescuingPiece.y})!`);

    const rescuedCount = player.jailedPieces.length;

    // Reset all jailed pieces to starting positions IMMEDIATELY
    player.jailedPieces.forEach(jailedId => {
      const jailedPiece = player.pieces.find(p => p.id === jailedId);
      const startPos = STARTING_POSITIONS[playerLetter].find(p => p.id === jailedId);

      if (jailedPiece && startPos) {
        jailedPiece.x = startPos.x;
        jailedPiece.y = startPos.y;
        jailedPiece.alive = true;
        console.log(`${emoji} ${teamName} Piece ${jailedId} rescued! Reset to (${startPos.x}, ${startPos.y})`);
      }
    });

    // Only track the RESCUING piece for reset on next round
    // This allows frontend to show it reaching the key before teleporting back
    this.pendingRescues.set(playerLetter, [rescuingPiece.id]);
    console.log(`${emoji} ${teamName} Piece ${rescuingPiece.id} (rescuer) stays at key position (${rescuingPiece.x}, ${rescuingPiece.y}) - will reset next round`);

    // Clear jail
    player.jailedPieces = [];

    console.log(`🎉 ${teamName} team rescued ${rescuedCount} piece(s)!`);

    // Remove this team's key
    gameState.rescueKeys[playerLetter] = null;
  }
}
