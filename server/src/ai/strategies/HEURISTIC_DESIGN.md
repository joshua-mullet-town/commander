# Heuristic AI Strategy - Design Document

**Created:** 2025-11-27
**Status:** Planning Phase

---

## Core Concept

Instead of random move generation, systematically explore every possible position each piece can reach, evaluate the board state, and keep only the single best move per piece.

**Computational Efficiency:** ~120 board evaluations per turn (vs 45,000 in NashStrategy)

---

## Algorithm Overview

### Step 1: Find Enemy's Best Move Per Piece

For each enemy piece (1, 2, 3), holding AI pieces still:

1. Move piece in every direction (up/down/left/right/still) × every distance (0-10)
2. Use `CommandProcessor.calculatePath()` to get actual final position (respects boundaries + no-guard zones)
3. Evaluate board state using `evaluateGameStateQuick(state, enemySide)`
4. Calculate score delta: `newScore - currentScore`
5. Keep **ONLY** the single move with highest positive score
6. If no move scores positive points, piece stays still (distance=0)

**Output:** Each enemy piece has 0 or 1 "best move"

**Evaluation Count:** ~60 (3 pieces × ~20 positions each)

### Step 2: Combine Enemy Best Moves

Combine the three individual best moves into one "enemy best response" scenario:
- Enemy Piece 1: best move (or still)
- Enemy Piece 2: best move (or still)
- Enemy Piece 3: best move (or still)

**Output:** ONE combined enemy move representing their optimal play

### Step 3: Find AI's Best Move Per Piece

For each AI piece (1, 2, 3), against the enemy's best move scenario:

1. Move piece in every direction × every distance
2. Use `CommandProcessor.calculatePath()` to get actual final position
3. Simulate **simultaneous execution** of AI piece move + enemy's best moves
   - Execute both moves using `CommandProcessor.executeMovements()`
   - Detect collisions using `CollisionDetector.detectCollisions()`
   - Resolve captures, check flags, etc.
4. Evaluate resulting board state using `evaluateGameStateQuick(state, aiSide)`
5. Calculate score delta: `newScore - currentScore`
6. Keep **ONLY** the single move with highest positive score
7. If no move scores positive points, piece stays still

**Output:** Each AI piece has 0 or 1 "best move"

**Evaluation Count:** ~60 (3 pieces × ~20 positions each)

### Step 4: Return AI's Best Moves

Combine the three individual best moves:
- AI Piece 1: best move
- AI Piece 2: best move
- AI Piece 3: best move

**Output:** Final AI move command

---

## Key Implementation Details

### Movement Exploration

For each piece, explore all reachable positions:

1. **Baseline:** Calculate score if piece stays still (distance=0)
   - This is the "default best move" with score delta = 0
2. **Explore directions:** Move in each direction (up/down/left/right) × distances (1-10)
3. **Compare:** Only beat the baseline if `newScoreDelta > 0`

**Total positions per piece:** ~40 (1 baseline + ~10 per direction)

### Single Source of Truth

**CRITICAL:** Use `CommandProcessor.calculatePath()` for ALL movement calculations
- Located: `server/src/game/CommandProcessor.ts:134-192`
- Handles board boundaries (0-10 grid)
- Handles no-guard zones (when `gameState.noGuardZoneActive[player]` is true)
- Returns actual path taken with final position

**DO NOT duplicate logic** - always call this method

### Score Evaluation

Use existing centralized evaluators:
- `evaluateGameStateQuick(state, side)` - fast evaluation
- `evaluateGameState(state, side, beforeState)` - detailed with breakdown

**Sign convention:**
- Positive score = good for that side
- Negative score = bad for that side
- **BE CAREFUL:** When evaluating enemy moves, use `enemySide` parameter

### Simultaneous Move Simulation

When evaluating AI moves against enemy response (Step 3):

```typescript
// Build command structure
const commands = {
  playerA: aiSide === 'A' ? [aiMove] : [enemyBestMove],
  playerB: aiSide === 'B' ? [aiMove] : [enemyBestMove]
};

// Execute movements (calculates paths)
const paths = commandProcessor.executeMovements(state, commands);

// Detect collisions
const collisions = collisionDetector.detectCollisions(paths);

// Apply final positions
commandProcessor.applyFinalPositions(state, paths);

// Resolve captures
collisionDetector.resolveCollisions(state, collisions, onPieceCaptured);

// Check flag interactions
flagManager.checkFlagInteractions(state);

// Now evaluate this state
const score = evaluateGameStateQuick(state, aiSide);
```

---

## Optimizations

### Baseline: Staying Still

- **First calculation:** Score with piece staying still (distance=0)
- This becomes the baseline score to beat
- If no move beats baseline, piece stays still (which is fine!)

### One Best Move Per Piece

- Don't keep multiple "interesting" moves per piece
- Keep only the **single highest-scoring move**
- Baseline (staying still) is the default winner until beaten
- Reduces combinatorial explosion

---

## Edge Cases

### All Pieces Stay Still

If no move beats the baseline (staying still):
- Return distance=0 for all pieces
- This is valid and expected in some situations
- The baseline (staying still) IS an "interesting move" - it's the default best

**Note:** There will ALWAYS be a best move (at minimum, the baseline)

### Ties

If multiple moves score identically:
- Keep the first one encountered (deterministic)
- Could add tie-breaking heuristics later (prefer shorter distance, etc.)

### Dead Pieces

- Only evaluate moves for `piece.alive === true`
- Dead pieces are ignored in move generation

---

## Testing Strategy

### Phase 1: Unit Tests (YES - do this first!)
- Test individual piece move exploration
  - Given a piece at position (5,5), verify it explores all reachable positions
  - Verify boundary checking works (piece at (0,5) can't move left)
  - Verify no-guard zone blocking works
  - Verify score delta calculation is correct
  - Verify baseline (staying still) is always included
- Test best move selection
  - Given multiple moves with different scores, verify highest is chosen
  - Verify baseline wins if no move beats it
- Test enemy best move calculation
- Test AI best move calculation against enemy response

**Why unit tests first:** Catch bugs before human testing, faster iteration

### Phase 2: Human Testing
- Play against AI using frontend
- Use AI analysis timeline to debug weird moves
- Verify moves make strategic sense
- Tune if AI is too weak or too strong

### Phase 3: Optimization (if needed)
- Profile execution time
- Optimize if > 2 seconds per turn

---

## Known Issues to Address

### AI Analysis Timeline Display Bug

**Problem:** Timeline shows intended move (e.g., "move 5 left") but not actual end position after boundaries/no-guard zones

**Solution:** Use `CommandProcessor.calculatePath()` to get actual final position, display that in timeline

**File:** Frontend needs update (TBD after backend strategy is working)

---

## Success Criteria

- [ ] AI makes strategically sound moves (moves toward objectives)
- [ ] AI defends its flag when threatened
- [ ] AI captures enemy flag when opportunity arises
- [ ] AI beats human player more often than not
- [ ] Execution time < 2 seconds per turn
- [ ] Code is maintainable and well-documented

---

## Next Steps

1. Implement `HeuristicStrategy` class skeleton
2. Implement Step 1 (enemy best moves)
3. Implement Step 3 (AI best moves)
4. Test against human
5. Iterate and tune
