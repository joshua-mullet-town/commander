/**
 * Diagnostic tool to compare backend state vs frontend DOM rendering
 * Run this in browser console to see what's actually happening
 */

export function diagnosePiecePositions() {
  console.log('\n🔍 DIAGNOSTIC: Comparing Backend State vs Frontend DOM\n');

  // Get game state from window (should be set by main.ts)
  const gameState = (window as any).__GAME_STATE__;
  if (!gameState) {
    console.error('❌ No game state found on window.__GAME_STATE__');
    return;
  }

  console.log(`📊 Round ${gameState.round}\n`);

  // Check Blue (A) pieces
  console.log('🔵 BLUE TEAM (A):');
  if (gameState.players.A) {
    gameState.players.A.pieces.forEach((piece: any) => {
      const backendPos = `(${piece.x}, ${piece.y})`;
      const cellId = `cell-${piece.x}-${piece.y}`;
      const cell = document.getElementById(cellId);

      if (!cell) {
        console.log(`  P${piece.id}: Backend says ${backendPos} - ❌ CELL NOT FOUND: #${cellId}`);
        return;
      }

      const pieceElement = cell.querySelector(`.piece[data-piece-id="${piece.id}"][data-player="A"]`);

      if (pieceElement) {
        console.log(`  P${piece.id}: Backend ${backendPos} ✅ Found in DOM at #${cellId}`);
      } else {
        // Check if piece exists ELSEWHERE in DOM
        const pieceAnywhere = document.querySelector(`.piece[data-piece-id="${piece.id}"][data-player="A"]`);
        if (pieceAnywhere) {
          const parentCell = pieceAnywhere.closest('.cell');
          const actualCellId = parentCell?.id || 'unknown';
          console.log(`  P${piece.id}: Backend ${backendPos} ❌ MISMATCH - Found in #${actualCellId} instead!`);
        } else {
          console.log(`  P${piece.id}: Backend ${backendPos} ❌ NOT IN DOM AT ALL`);
        }
      }
    });
  }

  console.log('\n🔴 RED TEAM (B):');
  if (gameState.players.B) {
    gameState.players.B.pieces.forEach((piece: any) => {
      const backendPos = `(${piece.x}, ${piece.y})`;
      const cellId = `cell-${piece.x}-${piece.y}`;
      const cell = document.getElementById(cellId);

      if (!cell) {
        console.log(`  P${piece.id}: Backend says ${backendPos} - ❌ CELL NOT FOUND: #${cellId}`);
        return;
      }

      const pieceElement = cell.querySelector(`.piece[data-piece-id="${piece.id}"][data-player="B"]`);

      if (pieceElement) {
        console.log(`  P${piece.id}: Backend ${backendPos} ✅ Found in DOM at #${cellId}`);
      } else {
        // Check if piece exists ELSEWHERE in DOM
        const pieceAnywhere = document.querySelector(`.piece[data-piece-id="${piece.id}"][data-player="B"]`);
        if (pieceAnywhere) {
          const parentCell = pieceAnywhere.closest('.cell');
          const actualCellId = parentCell?.id || 'unknown';
          console.log(`  P${piece.id}: Backend ${backendPos} ❌ MISMATCH - Found in #${actualCellId} instead!`);
        } else {
          console.log(`  P${piece.id}: Backend ${backendPos} ❌ NOT IN DOM AT ALL`);
        }
      }
    });
  }

  console.log('\n✅ Diagnostic complete\n');
}

// Auto-run diagnostic every round update
export function enableAutoDiagnostics() {
  console.log('🔧 Auto-diagnostics enabled - will run after each round update');

  // Hook into the game state updates
  let lastRound = 0;
  setInterval(() => {
    const gameState = (window as any).__GAME_STATE__;
    if (gameState && gameState.round !== lastRound) {
      lastRound = gameState.round;
      diagnosePiecePositions();
    }
  }, 1000);
}

// Make available globally
(window as any).diagnosePiecePositions = diagnosePiecePositions;
(window as any).enableAutoDiagnostics = enableAutoDiagnostics;

console.log('🔧 Diagnostics loaded. Run in console:');
console.log('   diagnosePiecePositions()  - Run diagnostic now');
console.log('   enableAutoDiagnostics()   - Auto-run every round');
