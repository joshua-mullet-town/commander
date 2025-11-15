# Milestone 1: Get Pieces Moving on the Board

## Current State (As of Testing)
✅ **What Works:**
- Lobby WebSocket connection
- Room creation & joining
- Dual interface for multiplayer debugging
- Lobby → Arena transition

❌ **What's Broken:**
- No pieces on board (grid renders empty)
- No game loop/tick system running
- No player assignment (A vs B)
- Movement commands don't execute
- Game state not synchronized

## Goal
Get 3 pieces per player visible on an 11x11 board, moving in response to commands, with both players seeing synchronized state updates every 3 seconds.

---

## Technical Specifications

### Board Setup
- **Grid Size:** 11x11 (0-10 coordinates)
- **Player A (Bottom):**
  - Flag: Position (5, 10) - center of bottom row
  - Pieces: (4, 9), (5, 9), (6, 9) - row in front of flag
- **Player B (Top):**
  - Flag: Position (5, 0) - center of top row
  - Pieces: (4, 1), (5, 1), (6, 1) - row in front of flag
- **Perspective:** Fixed board (both players see A at bottom, B at top)

### Movement Rules (Phase 1)
- **Directions:** Up, down, left, right only (no diagonals)
- **Distance:** Any number of squares per move
- **Collisions:** Pieces can share squares (no collision detection yet)
- **Boundaries:** Pieces die if they move off grid (0-10 range)

### Tick System
- **Interval:** 3 seconds
- **Execution:** All queued commands execute simultaneously each tick
- **Countdown:** Display "Next tick in: X.Xs" with tenths of a second precision (updates every 100ms)

### State Management
- **Server:** Single source of truth for game state
- **Rooms:** Each room has its own isolated game state
- **Sync:** WebSocket broadcasts game state to all room participants after each tick
- **Player Assignment:** First joiner = Player A, second joiner = Player B

---

## Implementation Steps

### Step 1: Fix Grid Size & Initialize Pieces
**Goal:** Show 11x11 grid with pieces in starting positions

**Frontend Changes:**
- `BattleArena.ts`: Change loop from 10 to 11 (rows 0-10, cols 0-10)
- Update piece rendering to show Player A pieces (blue circles with piece ID)
- Update piece rendering to show Player B pieces (red circles with piece ID)
- Render flags as special icons (🚩 or similar)

**Server Changes:**
- `movement-server.ts`: Update `resetGame()` to initialize 11x11 game state
- Set Player A pieces: `[{id: 1, x: 4, y: 9}, {id: 2, x: 5, y: 9}, {id: 3, x: 6, y: 9}]`
- Set Player B pieces: `[{id: 1, x: 4, y: 1}, {id: 2, x: 5, y: 1}, {id: 3, x: 6, y: 1}]`
- Add flag positions to game state

**Testing Criteria:**
- [ ] Grid shows 11x11 squares
- [ ] 3 blue pieces visible at bottom
- [ ] 3 red pieces visible at top
- [ ] Both flags visible in back rows
- [ ] Both dual-interface instances show identical board

---

### Step 2: Implement Player Assignment
**Goal:** Assign Player A to first joiner, Player B to second joiner

**Server Changes:**
- Track player assignment in room state: `room.playerA: WebSocket | null`, `room.playerB: WebSocket | null`
- When creating room, assign creator to Player A
- When joining room, assign joiner to Player B
- Broadcast player assignments in game state updates
- Include player role in WebSocket metadata

**Frontend Changes:**
- Display "You are Player A" or "You are Player B" in arena header
- Color-code instance borders (blue for A, red for B)

**Testing Criteria:**
- [ ] Instance A shows "You are Player A"
- [ ] Instance B shows "You are Player B"
- [ ] Player roles persist across page refreshes (within same session)

---

### Step 3: Start Game Loop & Tick System
**Goal:** Game loop runs every 3 seconds, broadcasts countdown

**Server Changes:**
- Start game loop when both players have joined room
- Implement countdown timer (updates every 100ms)
- Broadcast `nextTickIn` value with each update
- Execute round and increment round number every 3 seconds
- Stop game loop when player disconnects or leaves room

**Frontend Changes:**
- Update "Next tick: Xs" display in real-time
- Show visual feedback when tick executes (flash/animation)
- Update round number display

**Testing Criteria:**
- [ ] Countdown shows "3s, 2s, 1s, 3s..." in loop
- [ ] Round number increments every 3 seconds
- [ ] Both instances show identical countdown/round numbers
- [ ] Game loop stops when player leaves

---

### Step 4: Implement Movement Command Queue
**Goal:** Players can queue movement commands that execute on next tick

**Server Changes:**
- Implement command queue: `commandQueue[round][playerA/playerB][]`
- Handle `queueMove` message from clients
- Validate moves (piece exists, direction valid, player owns piece)
- Execute all queued moves on tick
- Clear executed commands after tick
- Broadcast updated board state after execution

**Frontend Changes:**
- Wire up "Quick Test" dropdown to send `queueMove` WebSocket message
- Display queued commands in "Your Commands" panel
- Show executed moves in console/UI feedback
- Update board rendering when pieces move

**Testing Criteria:**
- [ ] Click "Send" → piece moves after next tick
- [ ] Movement visible on both instances simultaneously
- [ ] "Your Commands" panel shows queued move before tick
- [ ] Piece position updates correctly (coordinates change)
- [ ] Pieces die when moving off board

---

### Step 5: Add Drag-and-Drop Movement UI
**Goal:** Click-and-drag pieces to plan moves intuitively

**Frontend Changes:**
- Add round selector dropdown above board:
  - Default: "Next Round" (always selected by default)
  - Options: Next 15-30 future rounds (Round 2, Round 3, ... Round N)
  - Auto-resets to "Next Round" after that round executes
- Implement drag-and-drop on board:
  - Click piece → drag in direction (up/down/left/right)
  - Distance = how far you drag (grid squares)
  - Visual feedback: arrow showing planned move
  - Drop to confirm → queues command for selected round
- Show queued commands in timeline view:
  - "Your Commands" panel shows moves by round
  - Example: "Round 5: P1→up(3), P2→right(2)"
  - Clear visual of what's planned for upcoming rounds
- Update "Your Commands" panel to show multi-round queue

**Testing Criteria:**
- [ ] Can select target round from dropdown
- [ ] Drag piece → arrow shows direction/distance
- [ ] Drop piece → command queued for selected round
- [ ] Round selector resets to "Next Round" after execution
- [ ] Can plan moves 5+ rounds ahead
- [ ] Timeline view shows all queued commands clearly
- [ ] Drag-and-drop feels smooth and responsive

---

### Step 6: Polish & Bug Fixes
**Goal:** Smooth out rough edges

**Tasks:**
- Improve piece visuals (better icons, colors, labels)
- Add animation when pieces move
- Better error messaging (invalid moves, disconnects)
- Handle edge cases (both players move to same square, pieces die, etc.)
- Clean up console logs (keep useful ones, remove spam)

**Testing Criteria:**
- [ ] Play 10+ rounds without crashes
- [ ] Movement feels responsive and clear
- [ ] No desync between instances
- [ ] Error messages make sense

---

## Definition of Done

**Milestone 1 is complete when:**
1. ✅ 11x11 grid with 6 total pieces (3 per player) visible
2. ✅ Player assignment working (A vs B clearly labeled)
3. ✅ Tick system running every 3 seconds with visible countdown
4. ✅ Movement commands queue and execute on tick
5. ✅ Both dual-interface instances show identical, synchronized state
6. ✅ Can play multiple rounds moving pieces around board
7. ✅ Playwright MCP tests confirm all above functionality

**What's explicitly NOT in Milestone 1:**
- ❌ Capture-the-flag mechanics
- ❌ Tagging/jail system
- ❌ Win conditions
- ❌ ChatGPT MCP integration
- ❌ Multi-round command planning
- ❌ Advanced UI polish

---

## Development Workflow

### Before Each Step:
1. Read the step goals and changes
2. Make the code changes
3. Test manually with Playwright MCP
4. Verify both instances work identically
5. Check server logs for errors
6. Only move to next step when all criteria pass

### Testing Commands:
```bash
# Start servers (already running)
cd server && npm run dev
cd frontend && npm run dev

# Test with Playwright MCP at localhost:3457
# (Use dual interface to verify sync)
```

### Key Files to Modify:
- **Frontend:**
  - `frontend/src/components/BattleArena.ts` - Board rendering
  - `frontend/src/dual-main.ts` - WebSocket handlers, game state
  - `frontend/src/types/game.ts` - Type definitions

- **Server:**
  - `server/src/movement-server.ts` - All game logic, WebSocket handlers, tick system

---

## Success Metrics

After Milestone 1, we should be able to:
- Create a room
- Join with 2 players
- See pieces on board
- Queue movement commands
- Watch pieces move every 3 seconds
- Play for 5+ minutes without issues
- See identical state on both clients

This gives us the foundation to add game rules (flags, tagging, win conditions) in Milestone 2.
