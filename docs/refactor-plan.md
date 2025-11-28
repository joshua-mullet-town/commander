# Movement Server Refactor Plan

**Status**: Planning → Implementation → Testing
**Date**: 2025-11-17

---

## Problem Statement

`movement-server.ts` is a 2000+ line monolith mixing:
- WebSocket connection handling
- Room lifecycle management
- Game loop execution
- Movement validation
- Collision detection
- AI coordination
- History tracking

This makes it:
- Hard to understand
- Hard to test
- Hard to extend
- Prone to breaking changes

---

## Goals

1. **Separation of Concerns**: Each file has ONE clear responsibility
2. **Maintainability**: Easy to find and modify specific logic
3. **Testability**: Each component can be unit tested
4. **Extensibility**: New features don't require touching core logic
5. **Non-Breaking**: Keep existing functionality working throughout

---

## New Architecture

```
server/src/
├── game/
│   ├── constants.ts                 ✅ EXISTS - game constants
│   ├── types.ts                     🆕 Shared type definitions
│   ├── GameEngine.ts                🆕 Core round execution orchestrator
│   ├── RoomManager.ts               🆕 Room lifecycle & state management
│   ├── CommandProcessor.ts          🆕 Movement command execution & validation
│   ├── CollisionDetector.ts         🆕 Collision detection & resolution
│   ├── FlagManager.ts               ✅ EXISTS - flag mechanics (keep as-is)
│   ├── RescueKeyManager.ts          ✅ EXISTS - rescue key mechanics (keep as-is)
│   └── AIOrchestrator.ts            🆕 Non-blocking AI command generation
├── network/
│   ├── WebSocketServer.ts           🆕 Pure WebSocket connection handling
│   └── MessageRouter.ts             🆕 Route incoming messages to handlers
├── movement-server.ts               🔄 SLIM ENTRY POINT - wire everything together
└── movement-server.LEGACY.ts        📦 RENAME old file for reference
```

---

## File-by-File Decomposition Map

### **Source File**: `movement-server.ts` (Lines 1-2000+)

---

### 🆕 `game/types.ts`

**Purpose**: Centralize all type definitions

**Extracted From**:
- Lines 1-100: Type definitions (Command, GameState, PlayerData, etc.)

**Contents**:
```typescript
export type Command = { ... }
export type PlayerData = { ... }
export type CommanderGameState = { ... }
export type GameRoom = { ... }
export type RoundHistory = { ... }
```

**Why**: Stop duplicating types, single source of truth

---

### 🆕 `game/RoomManager.ts`

**Purpose**: Manage room lifecycle and state

**Extracted From**:
- Lines 370-420: `createRoom()` logic
- Lines 480-550: `joinRoom()` logic
- Lines 380-390: Room creation/initialization
- Lines 98-107: GameRoom type
- Lines 113: `private rooms: Map<string, GameRoom>`

**Responsibilities**:
- Create new rooms
- Join existing rooms
- Track room connections
- Initialize default game state
- Clean up empty rooms

**Methods**:
```typescript
class RoomManager {
  createRoom(roomCode: string, creator: WebSocket): GameRoom
  joinRoom(roomCode: string, joiner: WebSocket): GameRoom | null
  getRoom(roomCode: string): GameRoom | null
  removeConnection(ws: WebSocket): void
  getRoomByConnection(ws: WebSocket): GameRoom | null
  cleanupEmptyRooms(): void
}
```

**Why**: Isolate room state management from game logic

---

### 🆕 `game/CommandProcessor.ts`

**Purpose**: Execute and validate movement commands

**Extracted From**:
- Lines 860-950: `executeSimultaneousMovement()`
- Lines 1050-1150: Movement validation logic
- Lines 780-850: Direction parsing (N/S/E/W/NE/NW/SE/SW)

**Responsibilities**:
- Parse movement commands
- Validate moves (bounds, no-guard zones)
- Execute all movements simultaneously
- Track piece positions

**Methods**:
```typescript
class CommandProcessor {
  executeCommands(gameState: GameState, commands: Command[]): void
  validateMove(piece: Piece, command: Command, gameState: GameState): boolean
  isInNoGuardZone(x: number, y: number, team: 'A' | 'B', gameState: GameState): boolean
}
```

**Why**: Centralize all movement logic in one place

---

### 🆕 `game/CollisionDetector.ts`

**Purpose**: Detect and resolve piece collisions

**Extracted From**:
- Lines 950-1050: `handleCollisions()` logic
- Lines 1000-1020: Territory-based tagging rules
- Lines 1020-1040: Jail logic

**Responsibilities**:
- Find all pieces on same square
- Determine collision type (friendly/enemy/neutral)
- Apply tagging rules based on territory
- Update jailed pieces

**Methods**:
```typescript
class CollisionDetector {
  detectAndResolve(gameState: GameState): CollisionEvent[]
  private getTerritory(y: number): 'A' | 'B' | 'neutral'
  private handleEnemyCollision(p1: Piece, p2: Piece, territory: string): void
  private handleFriendlyCollision(p1: Piece, p2: Piece): void
}
```

**Why**: Collision logic is complex and should be isolated

---

### 🆕 `game/GameEngine.ts`

**Purpose**: Orchestrate round execution

**Extracted From**:
- Lines 724-815: `executeRoomRound()` - the main loop
- Lines 690-707: `startRoomGameLoop()`
- Lines 709-721: `stopRoomGameLoop()`

**Responsibilities**:
- Coordinate round execution order
- Call managers in correct sequence
- Emit events for network layer
- Update round counter
- Set timestamps

**Methods**:
```typescript
class GameEngine {
  constructor(
    commandProcessor: CommandProcessor,
    collisionDetector: CollisionDetector,
    flagManager: FlagManager,
    rescueKeyManager: RescueKeyManager,
    aiOrchestrator: AIOrchestrator
  )

  executeRound(room: GameRoom): RoundResult
  startGameLoop(room: GameRoom, interval: number): void
  stopGameLoop(room: GameRoom): void
}
```

**Round Execution Order**:
```typescript
1. Set lastRoundTime = Date.now()
2. Reset rescuing pieces (from previous round)
3. Execute movement commands → CommandProcessor
4. Detect collisions → CollisionDetector
5. Check flag interactions → FlagManager
6. Check rescue keys → RescueKeyManager
7. Update no-guard zones
8. Increment round counter
9. Return result with events
```

**Why**: Single place to see/modify game loop logic

---

### 🆕 `game/AIOrchestrator.ts`

**Purpose**: Non-blocking AI command generation

**Extracted From**:
- Lines 814-860: `getAICommandsForRound()`
- AI service integration
- Reasoning storage

**Responsibilities**:
- Start AI generation in background (non-blocking)
- Track pending AI requests
- Queue commands when AI responds (even if late)
- Log AI activity (on-time, late, missed rounds)

**Methods**:
```typescript
class AIOrchestrator {
  startGeneration(gameState: GameState, targetRound: number): void
  hasPendingGeneration(roomCode: string): boolean
  logActivity(event: AIActivityEvent): void
  getActivityLog(roomCode: string): AIActivityEvent[]
}
```

**AI Activity Logging**:
```typescript
type AIActivityEvent = {
  round: number
  requestedAt: number
  respondedAt?: number
  status: 'on-time' | 'late' | 'missed' | 'error'
  targetRound: number
  actualRound: number
  reasoning?: string
}
```

**Why**: AI timing is critical and complex, needs dedicated handling

---

### 🆕 `network/WebSocketServer.ts`

**Purpose**: Pure WebSocket connection handling

**Extracted From**:
- Lines 116-170: WebSocket server setup
- Lines 1200-1400: Connection/disconnection handlers
- Broadcast logic

**Responsibilities**:
- Start/stop WebSocket server
- Handle connections/disconnections
- Broadcast messages to rooms
- Track connection → room mapping

**Methods**:
```typescript
class WebSocketServer {
  start(port: number): void
  broadcastToRoom(roomCode: string, message: any): void
  onConnection(ws: WebSocket): void
  onDisconnection(ws: WebSocket): void
}
```

**Why**: Network code should be separate from game logic

---

### 🆕 `network/MessageRouter.ts`

**Purpose**: Route incoming WebSocket messages

**Extracted From**:
- Lines 1400-1800: Message handling switch statement
- All `ws.on('message')` handlers

**Responsibilities**:
- Parse incoming messages
- Route to appropriate handlers
- Validate message format

**Methods**:
```typescript
class MessageRouter {
  route(ws: WebSocket, message: any): void
  private handleCreateRoom(ws: WebSocket, data: any): void
  private handleJoinRoom(ws: WebSocket, data: any): void
  private handleQueueCommand(ws: WebSocket, data: any): void
  private handleStartGame(ws: WebSocket, data: any): void
}
```

**Why**: Centralize all message routing logic

---

### 🔄 `movement-server.ts` (NEW - Slim Entry Point)

**Purpose**: Wire everything together

**New Contents**:
```typescript
import { GameEngine } from './game/GameEngine';
import { RoomManager } from './game/RoomManager';
import { CommandProcessor } from './game/CommandProcessor';
// ... other imports

class MovementCommanderGameManager {
  private roomManager: RoomManager;
  private gameEngine: GameEngine;
  private wsServer: WebSocketServer;
  private messageRouter: MessageRouter;

  constructor() {
    // Initialize managers
    this.roomManager = new RoomManager();
    this.gameEngine = new GameEngine(/* inject dependencies */);
    this.wsServer = new WebSocketServer();
    this.messageRouter = new MessageRouter(
      this.roomManager,
      this.gameEngine
    );
  }

  start() {
    this.wsServer.start(9999);
  }
}

// Start server
const manager = new MovementCommanderGameManager();
manager.start();
```

**Why**: Entry point should just wire dependencies, not contain logic

---

## Implementation Strategy

### Phase 1: Extract Types & Constants ✅
- [x] Create `game/types.ts`
- [x] Move all type definitions
- [x] Update imports in existing code
- [x] **Test**: Game still works

### Phase 2: Extract Managers (One at a Time)
- [ ] Create `game/CommandProcessor.ts`
  - Extract movement logic
  - Test in isolation
  - Update movement-server.ts to use it
  - **Test**: Game still works

- [ ] Create `game/CollisionDetector.ts`
  - Extract collision logic
  - Test in isolation
  - Update movement-server.ts to use it
  - **Test**: Game still works

- [ ] Create `game/RoomManager.ts`
  - Extract room logic
  - Test in isolation
  - Update movement-server.ts to use it
  - **Test**: Game still works

### Phase 3: Create Game Engine
- [ ] Create `game/GameEngine.ts`
  - Extract executeRoomRound logic
  - Inject all managers
  - **Test**: Game still works

### Phase 4: Extract Network Layer
- [ ] Create `network/WebSocketServer.ts`
- [ ] Create `network/MessageRouter.ts`
- [ ] **Test**: Game still works

### Phase 5: Create AI Orchestrator
- [ ] Create `game/AIOrchestrator.ts`
- [ ] Implement non-blocking generation
- [ ] Add activity logging
- [ ] **Test**: AI responds properly, doesn't block timer

### Phase 6: Slim Down Entry Point
- [ ] Rewrite `movement-server.ts` as slim coordinator
- [ ] Rename old file to `movement-server.LEGACY.ts`
- [ ] **Test**: Everything still works

### Phase 7: Cleanup
- [ ] Remove `movement-server.LEGACY.ts` once confident
- [ ] Add unit tests for each manager
- [ ] Update documentation

---

## Testing Checkpoints

After each phase:
1. ✅ Game starts successfully
2. ✅ Players can create/join rooms
3. ✅ Pieces move correctly
4. ✅ Collisions work (friendly, enemy, neutral)
5. ✅ Flags can be picked up and scored
6. ✅ Rescue keys work correctly
7. ✅ AI responds (if present)
8. ✅ No-guard zones block properly
9. ✅ Game timer runs at 3-second intervals
10. ✅ No console errors

---

## Success Criteria

**After refactor, the codebase should be**:
- ✅ Easier to understand (each file < 300 lines)
- ✅ Easier to test (each class isolated)
- ✅ Easier to extend (new features touch 1-2 files)
- ✅ More maintainable (clear separation of concerns)
- ✅ Same functionality (all existing features work)

**AI Improvements**:
- ✅ Non-blocking AI generation
- ✅ AI activity logging
- ✅ Late commands execute ASAP
- ✅ Game timer never waits for AI

---

## Current File Line Count

- `movement-server.ts`: **~2000 lines**

## Target File Line Count

- `movement-server.ts`: **~100 lines** (entry point only)
- `game/types.ts`: **~100 lines**
- `game/RoomManager.ts`: **~200 lines**
- `game/CommandProcessor.ts`: **~250 lines**
- `game/CollisionDetector.ts`: **~150 lines**
- `game/GameEngine.ts`: **~150 lines**
- `game/AIOrchestrator.ts`: **~200 lines**
- `network/WebSocketServer.ts`: **~150 lines**
- `network/MessageRouter.ts`: **~200 lines**
- `game/FlagManager.ts`: **~235 lines** (existing)
- `game/RescueKeyManager.ts`: **~175 lines** (existing)

**Total**: ~1900 lines across 11 focused files (vs 2000 lines in 1 monolith)

---

## Notes for Implementation

1. **Keep movement-server.ts working** at all times - never delete until new version proven
2. **Test after each file extraction** - don't batch changes
3. **Use TypeScript strictly** - proper types prevent regression
4. **Log activity** - especially AI timing events
5. **Maintain existing behavior** - refactor = reorganize, not rewrite

---

*This document is the source of truth for the refactor. Update as implementation progresses.*
