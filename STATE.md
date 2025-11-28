# Commander State - What We Know

**Purpose:** Knowledge base of accomplished work, lessons learned, and current facts. Always add new entries at the top with timestamps.

---

## [2025-11-28 15:45] AI is Competitive ✅

**Achievement:** Position Exploration Strategy with Combinatorial Move Selection is working well

**User Feedback:** "AI just beat me again... AI is pretty good now"

**Key Success Factors:**
1. **Combinatorial Team Coordination:**
   - Collects best move per direction (4 per piece)
   - Generates 64 combinations (4×4×4)
   - Filters friendly stacking
   - Picks highest total team score

2. **Predicted Score Breakdown:**
   - Fixed crash when simulating final state
   - Properly populates `predictedScoreBreakdown` for frontend display
   - Shows captures, piece advantage, flag status, etc.

3. **AI Timing Fix:**
   - Moved AI generation to AFTER round execution (not before)
   - AI now sees current board state instead of lagging 1 round behind

**Decision:** AI is "good enough for now" - ready to move to next phase (Railway deployment testing)

**Code Health:**
- 50/50 unit tests passing (AI, Movement, Collision, Rescue, Flag Carrier)
- Frontend/backend coordinate systems aligned
- No known critical bugs

---

## [2025-11-27 09:45] Railway Deployment Fixed

**Problem:** TypeScript couldn't run in Railway's Docker environment - tsx had bugs (`s.split is not a function`)

**Solution:** Compile TypeScript to JavaScript first, then run compiled output with plain node

**Key Changes:**
1. **package.json**
   ```json
   "build": "tsup",
   "start": "node dist/movement-server.js"
   ```

2. **tsconfig.json**
   ```json
   "module": "NodeNext",
   "moduleResolution": "NodeNext"
   ```

3. **tsup.config.ts**
   ```typescript
   bundle: true,
   external: [/node_modules/]  // Don't bundle deps with dynamic requires
   ```

**Insight:** Railway's official templates ALL compile TypeScript to JavaScript first - never run tsx in production

**Deployment Flow:** Push to GitHub → Railway auto-deploys (builds and starts backend)

**Railway URL:** https://commander-production.up.railway.app
**WebSocket:** wss://commander-production.up.railway.app/ws

---

## Game Architecture

**Tech Stack:**
- Frontend: TypeScript + Vite (port 3456)
- Backend: Node.js + TypeScript (port 9999)
- WebSocket: Real-time game state sync

**Server Management:**
- `npm start` - Start both servers with PID tracking
- `npm stop` - Kill tracked servers
- `npm restart` - Full restart cycle
- PID files stored in `.pids/`
- Logs in `.backend.log` and `.frontend.log`

**Frontend HMR Issues:**
- Vite HMR frequently fails to reload
- **Always add proof-of-change console.log** to verify code reloaded
- Remove previous log to avoid clutter

**Code Organization:**
- Codebase refactored from 2000+ line monolith into focused modules
- Consult `DIRECTORY.md` before adding code
- Entry point `movement-server.ts` stays slim (~200 lines)

---
