# Commander's Flag War - Directory Organization

**Quick reference guide for where code belongs in the codebase.**

---

## Entry Point

**`server/src/movement-server.ts`** (~200 lines)
- Main HTTP/WebSocket server setup
- Application initialization and wiring
- **DOES NOT** contain game logic - only coordinates modules
- **DO NOT** add implementation details here - extract to modules instead

---

## Game Logic Modules

**`server/src/game/GameEngine.ts`**
- Core game rule execution
- Move validation and processing
- Collision detection
- Piece state updates
- **ADD:** New game mechanics, rule changes, move processing logic

**`server/src/game/GameLoopManager.ts`**
- Game loop timing (3-second intervals)
- Round execution orchestration
- Game state broadcasting
- **ADD:** Loop timing changes, round scheduling logic

**`server/src/game/RescueKeyManager.ts`**
- Rescue key spawning and lifecycle
- Rescue key pickup detection
- **ADD:** Key-related game mechanics

**`server/src/game/FlagManager.ts`**
- Flag state management
- Flag pickup/capture detection
- Scoring logic
- **ADD:** Flag-related mechanics, scoring changes

**`server/src/game/RoomManager.ts`**
- Room creation and lifecycle
- Player assignment to rooms
- WebSocket broadcast to room members
- **ADD:** Room management features, multiplayer coordination

**`server/src/game/types.ts`**
- TypeScript type definitions for game entities
- **ADD:** New types, interfaces, enums for game data

**`server/src/game/Player.ts`**
- Player interface for polymorphic command sources
- HumanPlayer class (waits for WebSocket commands)
- **ADD:** New player types, player coordination

**`server/src/game/AIPlayer.ts`**
- AIPlayer class wrapping AIStrategy
- Enables AI to participate as a Player
- **ADD:** AI player features, strategy selection

---

## Network Layer

**`server/src/network/MessageHandler.ts`**
- WebSocket message routing
- Message validation
- Client connection management
- **ADD:** New WebSocket message types, connection handling

---

## AI System

**`server/src/ai/strategies/AIStrategy.ts`**
- Interface defining AI strategy contract
- Command and AIResponse type definitions
- **ADD:** New AI strategy interfaces

**`server/src/ai/strategies/BaselineStrategy.ts`**
- Original "ass" AI preserved as baseline
- Basic tactical priorities without chain-of-thought
- **DO NOT MODIFY:** Preserved for comparison

**`server/src/ai/strategies/ChainOfThoughtStrategy.ts`**
- Improved AI using explicit step-by-step reasoning
- 6-step reasoning process for strategic decisions
- **ADD:** Improvements to chain-of-thought prompts

**`server/src/ai/AIOrchestrator.ts`**
- AI move generation coordination
- AI reasoning tracking
- Non-blocking AI command queuing
- **ADD:** AI coordination logic, reasoning improvements

**`server/src/ai/AIService.ts`**
- Legacy AI service (may be deprecated)
- Direct AI API calls
- AI prompt construction
- **NOTE:** Consider migrating to strategy pattern

---

## MCP Integration (Future Use)

**`server/src/mcp/MCPServerSetup.ts`**
- Model Context Protocol server configuration
- Tool definitions for AI assistant control
- Resource handlers for game widgets
- **ADD:** New MCP tools, AI assistant capabilities

---

## Frontend

**`frontend/src/components/`**
- React components for game UI
- **ADD:** New UI components, visualizations

**`frontend/src/types/`**
- TypeScript interfaces for frontend
- **ADD:** Frontend-specific types

---

## Decision Tree for Adding Code

```
New code to add?
├─ Is it core game rules/mechanics?
│  └─ → GameEngine.ts
├─ Is it timing/round execution?
│  └─ → GameLoopManager.ts
├─ Is it rescue key related?
│  └─ → RescueKeyManager.ts
├─ Is it flag/scoring related?
│  └─ → FlagManager.ts
├─ Is it room/player management?
│  └─ → RoomManager.ts
├─ Is it WebSocket message handling?
│  └─ → MessageHandler.ts
├─ Is it AI move generation?
│  └─ → AIOrchestrator.ts or AIService.ts
├─ Is it MCP/AI assistant integration?
│  └─ → MCPServerSetup.ts
├─ Is it a new type/interface?
│  └─ → server/src/game/types.ts
├─ Is it UI/frontend?
│  └─ → frontend/src/components/
└─ Doesn't fit any category?
   └─ → Create a NEW focused module (ask user first)
```

---

## File Size Guidelines

- Entry point: **~200 lines max**
- Game modules: **200-400 lines** (single responsibility)
- Utility modules: **100-300 lines**

**If a file exceeds guidelines, consider extraction.**

---

## Architecture Principles

1. **Single Responsibility** - Each file does ONE thing well
2. **Dependency Injection** - Pass dependencies through constructors
3. **Thin Entry Point** - movement-server.ts coordinates, doesn't implement
4. **Clear Boundaries** - Network, Game Logic, AI are separate concerns

**Respect these principles when adding code.**
