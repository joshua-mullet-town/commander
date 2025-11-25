# Commander's Flag War - Game Rules (Source of Truth)

**Last Updated**: 2025-11-17

This document is the **authoritative source of truth** for game rules. When code contradicts this doc, the code is wrong and should be updated to match.

---

## 🎯 Core Concept

A turn-based strategy game where two teams compete to capture each other's flags while defending their own. The game runs on a synchronized tick system where all commands execute simultaneously every 3 seconds.

**Future Vision**: Multiple control modes including manual piece control, natural language strategy interpretation, and AI-assisted gameplay.

---

## 📐 Board Setup

### Grid
- **Size**: 11x11 (coordinates 0-10)
- **Design Principle**: Grid size should be configurable for future larger boards
- **Perspective**: Fixed (Player A always shown at bottom, Player B at top)

### Teams
- **Player A (Blue)**: Bottom of board
- **Player B (Red)**: Top of board
- **Pieces per team**: 3 mobile pieces + 1 stationary flag

### Starting Positions

**Flags** (stationary):
- Blue Flag: (5, 10) - center of bottom row
- Red Flag: (5, 0) - center of top row

**Pieces** (mobile):
- Blue Pieces: (4, 8), (5, 8), (6, 8) - row 8
- Red Pieces: (4, 2), (5, 2), (6, 2) - row 2

**Design Principle**: Pieces start one row outside their own no-guard zone

### Territory Boundaries
- **Blue Territory**: Rows 6-10
- **Red Territory**: Rows 0-4
- **Neutral Zone**: Row 5

---

## 🎮 Game Loop & Timing

### Architecture Principles

**Server Authority**:
- Server controls when rounds start/execute
- Fixed 3-second intervals, independent of game logic execution time
- Loop runs continuously once game starts

**Client Behavior**:
- Clients send commands as fast as they want
- Commands tagged with target round number
- Server decides when/if commands execute

**No Missed Turns**:
- If command arrives for round 19 but round 20 has already started → executes in round 20
- If command specifies round 40 and current round is 20 → queued for round 40
- **Never**: "Oops, missed your turn" - commands play ASAP or as specified

### Tick System
- **Interval**: 3 seconds per round (fixed, unwavering)
- **Execution**: All queued commands for current round execute simultaneously
- **Synchronization**: Server broadcasts identical state to all clients
- **Timer**: Server timestamp included in broadcast for client countdown sync

### Round Execution Order
1. **AI Command Generation** (if AI player present) - happens in parallel, doesn't block timer
2. Reset rescuing pieces from previous round
3. Process all movement commands queued for this round
4. Check for collisions
5. Check flag interactions (pickup/score/return)
6. Check rescue key interactions
7. Update no-guard zones
8. Broadcast updated state to clients

### Command Queue Structure
```typescript
commandQueue: {
  [roundNumber: number]: {
    A: Command[], // Player A commands for this round
    B: Command[]  // Player B commands for this round
  }
}
```

**Queue Behavior**:
- Commands arrive with `targetRound` number
- If `targetRound` <= `currentRound` → execute next available round
- If `targetRound` > `currentRound` → queue for that specific round
- Multiple commands for same piece in same round → last one wins

**Current Implementation**:
- Commands queue for next round only (no round targeting)
- **Future**: Multi-round planning with explicit round numbers

### AI Response Timing

**Problem**: AI calls to OpenAI block execution for 500-3000ms

**Solution** (to be implemented):
1. **Pre-fetch AI commands in parallel** during previous round
2. AI generation happens asynchronously, doesn't block timer
3. If AI response arrives late → queues for next available round (no missed turns)
4. Countdown continues regardless of AI response time

**Design Goal**:
- AI has same 3-second window as humans to submit commands
- If AI misses window → commands execute next round
- Game loop never waits for AI

---

## 🚶 Movement Rules

### Directions
- **Allowed**: Up, down, left, right (cardinal directions only)
- **Not Allowed**: Diagonals (NE, NW, SE, SW)

### Distance
- **Any number of squares per move** (not limited to one square)
- Pieces move instantaneously to destination (no animation of traversal)

### Boundaries
- **Grid bounds**: 0-10 on both axes
- Pieces cannot move outside grid boundaries

### Command Handling
- **One command per piece per round**
- Last command replaces any previous command for that piece
- Commands execute simultaneously for all pieces

---

## 💥 Collision Rules

### Detection
- Collision checked at **final destination only**
- Pieces can "pass through" each other during movement
- Multiple pieces can end on same square

### Same-Team Collision
- Both pieces reset to their starting positions
- No jail penalty
- If either piece was carrying flag, flag returns to spawn

### Enemy Collision (Territory-Based Tagging)

**In Your Own Territory (Defending)**:
- Enemy lands on your piece → Enemy goes to jail
- You remain on the board

**In Enemy Territory (Attacking)**:
- Enemy lands on you → You go to jail
- Enemy remains on the board

**In Neutral Zone (Row 5)**:
- Both pieces land on same square → Both go to jail

**Flag Carrier Special Case**:
- If flag carrier collides with enemy and gets jailed → Flag returns to spawn immediately

---

## 🚩 Flag Mechanics

### Flag Pickup
- Piece lands on enemy flag position → Picks up flag
- Flag follows carrier's position each round
- Carrier can continue moving normally (no movement penalty)
- Cannot drop or pass flag (only way to lose it is capture/death)

### Flag Carrier Display
- Frontend shows flag at carrier's position
- Flag rendered with 50% opacity and high z-index (z-20) when carried
- Flag rendered normally (z-5) when at spawn

### Scoring (Win Condition)
- Flag carrier reaches their own territory → **GAME ENDS**
- Winner declared immediately
- `gameStatus = 'finished'`, `winner = <team>`

### Flag Return
- Carrier gets jailed → Flag returns to spawn immediately
- Carrier dies (boundary/reset) → Flag returns to spawn
- Flag return triggers no-guard zone reactivation

---

## 🔒 No-Guard Zones

### Definition
- Protected area "N units away from flag" where defending team cannot enter
- Currently: 2-row zone in front of each flag

### Zone Boundaries
- **Blue No-Guard Zone**: Rows 9-10 (x: 4-6)
- **Red No-Guard Zone**: Rows 0-1 (x: 4-6)

### Activation Rules
- **Active**: When team's flag is at spawn position
- **Inactive**: When flag is picked up by enemy
- **Reactivated**: When flag returns to spawn

### Enforcement
- **Defending team**: Cannot enter their own no-guard zone while it's active
- **Attacking team**: CAN enter to grab flag
- **Violation**: Defending pieces in zone when flag returns → Reset to starting positions immediately

### Frontend Validation
- Drag-drop attempts to move into active no-guard zone → Red flash feedback
- Blocked moves not queued
- Ghost preview cleared

---

## 🔑 Rescue Key System

### Key Spawning
- **Two independent keys** (one per team)
- **Blue Key**: Spawns at (9, 1) when Blue has jailed pieces - in Red territory
- **Red Key**: Spawns at (1, 9) when Red has jailed pieces - in Blue territory
- Both keys can exist simultaneously
- Keys appear/disappear based on jail state

### Key Pickup
- Piece lands on own team's key → Triggers rescue
- **Immediate**: All jailed teammates reset to starting positions
- **Delayed**: Rescuer piece stays at key position, resets next round
- Key disappears after rescue

### Rescue Timing
```
Round N:   Piece reaches key
           - Jailed pieces reset to starting positions immediately
           - Rescuer stays at key position
Round N+1: Rescuer resets to starting position
```

### Design Note
- Current implementation: Two independent keys
- Future: System should be configurable/consolidatable

---

## 🏆 Win Conditions

1. **Flag Capture**: Carrier returns enemy flag to own territory
2. **Total Elimination**: All enemy pieces in jail (Not currently implemented)

Game ends immediately when win condition is met.

---

## 🎮 Control Modes (Roadmap)

### Current: Manual Mode
- Direct piece-by-piece control via UI
- Drag-and-drop movement planning
- Command queue for next round

### Future: Prompt Mode
- Natural language strategy commands
- AI interprets intent and generates commands
- Multi-round planning via conversation

### Future: Hybrid Mode
- Mix of manual control and AI suggestions
- Strategic prompts + tactical overrides

---

## 🔧 Design Principles

### Configurability
- Grid size should be adjustable (currently 11x11)
- No-guard zone size should be configurable ("N units from flag")
- Rescue key system should support different spawn logic
- Movement rules (distance, directions) should be modular

### Synchronization
- Server is single source of truth
- All clients receive identical state updates
- No client-side game logic that could cause desync

### Timing
- Fixed 3-second tick interval
- All commands execute simultaneously (no turn order advantage)
- Commands can be pre-queued for future rounds (future feature)

---

## 🐛 Known Implementation Gaps

The following features are documented here but not yet fully implemented:

- [ ] Movement distance validation (currently allows any distance, doc says "any distance" ✅)
- [ ] Diagonal movement blocking (code supports diagonals, doc says no diagonals ❌)
- [ ] Multi-round command planning (future feature)
- [ ] Natural language control modes (future feature)
- [ ] Total elimination win condition (documented but not implemented)
- [ ] Configurable grid sizes (hardcoded to 11x11)

---

## 📝 Notes for Developers

When implementing or debugging game logic:

1. **This doc is the source of truth** - if code contradicts this, fix the code
2. **Update this doc first** when changing rules - then implement
3. **Mark implementation gaps** in the "Known Gaps" section above
4. **Keep configurability in mind** - avoid hardcoding constants where possible
5. **Document timing-sensitive behavior** - especially around rescue resets and flag returns

---

*This document consolidates and supersedes: game-concept.md (original vision), milestone-1-plan.md (implementation roadmap). Those docs remain for historical context but this is the authoritative rules reference.*
