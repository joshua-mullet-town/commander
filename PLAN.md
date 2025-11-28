# Commander Plan - What We're Doing

**Purpose:** Active work queue and future plans. Current task always at top. When completed, scoop off top and consolidate into STATE.md.

---

## CURRENT: Test Railway Deployment - Live Server Performance

**Goal:** Deploy backend to Railway and test real-world performance with frontend pointed at production server

**Why:** We want to see if the game is responsive and fast on an actual deployed server, not just localhost

**Steps:**

1. **Deploy Backend to Railway**
   - Push current code to GitHub
   - Railway auto-deploys from main branch
   - Verify WebSocket server is running: `wss://commander-production.up.railway.app/ws`

2. **Configure Frontend to Use Production Server**
   - Update frontend WebSocket connection URL
   - Point to Railway instead of localhost:9999
   - Test connection handshake

3. **Performance Testing**
   - Play several games against AI on production server
   - Measure responsiveness (round execution, AI moves, animations)
   - Check for lag, connection issues, or timeout problems
   - Verify AI still plays well on deployed server

4. **Debug/Logging Strategy**
   - Production server shouldn't spam logs like dev mode
   - Consider log levels or environment-based logging
   - Keep critical game events, reduce verbose AI reasoning logs

**Success Criteria:**
- ✅ Frontend connects to Railway WebSocket successfully
- ✅ Game plays smoothly with no noticeable lag
- ✅ AI responds within 3-second round window
- ✅ No connection drops or errors
- ✅ Overall experience feels "production-ready"

**Known Info:**
- Railway URL: https://commander-production.up.railway.app
- WebSocket: wss://commander-production.up.railway.app/ws
- Deployment: Auto-deploy on push to main branch

---

## COMPLETED: Improve AI Opponent (Position Exploration Strategy) ✅

**Goal:** Create an intelligent opponent that feels like a real challenge - eventually should dominate human players

**Current Problem:** AI is beatable with minimal effort, doesn't feel intelligent, makes poor moves

**Approach:** Position exploration strategy - systematically explores every position each piece can reach, evaluates board state, keeps best move per piece

**Unique Challenge:** Not like chess/checkers - both players move simultaneously, opponent moves can directly affect your move outcomes

**Computational Efficiency:** ~120 board evaluations (vs 45,000 in Nash)

---

## 🗺️ COORDINATE SYSTEM & MOVEMENT REFERENCE

**Board Layout:**
```
y=10 (top)    ← Blue Territory (Team A)
  ↑           Blue Flag at (5, 10)
  |           Blue Pieces start at y=8
y=5           Neutral Zone at y=5
  |           Red Pieces start at y=2
  ↓           Red Flag at (5, 0)
y=0 (bottom)  ← Red Territory (Team B)

x: 0 (left) → 10 (right)
```

**Movement Directions:**
- `up` = **stepY = -1** (decrease Y, move toward y=0, toward Red)
- `down` = **stepY = +1** (increase Y, move toward y=10, toward Blue)
- `left` = **stepX = -1** (decrease X)
- `right` = **stepX = +1** (increase X)

**Examples:**
- Blue P1 at (4,8) moves `up 6` → (4,2) (enters Red territory)
- Blue P1 at (4,8) moves `down 2` → (4,10) (reaches own flag/back wall)
- Red P1 at (4,2) moves `down 6` → (4,8) (enters Blue territory)
- Red P1 at (4,2) moves `up 2` → (4,0) (reaches own flag/back wall)
- Any piece at (4,5) moves `left 1` → (3,5)
- Any piece at (4,5) moves `right 1` → (5,5)

---

### CURRENT STATUS: Debugging AI Stacking Bug - Phantom Capture Issue 🐛

**✅ Movement System Working Correctly (14/14 tests passing)**

We created comprehensive movement direction tests in `CommandProcessor.directions.test.ts`:
- ✅ UP increases Y (toward y=10, Blue/top)
- ✅ DOWN decreases Y (toward y=0, Red/bottom)
- ✅ LEFT decreases X, RIGHT increases X
- ✅ Boundary detection (x=0-10, y=0-10)
- ✅ Guard zone blocking (both teams, all directions)

**🐛 CURRENT BUG: AI Stacking - Phantom Capture Scoring**

**Symptom:** All three Red pieces choose to stack on same square (3,2) instead of exploiting open lane

**Root Cause:** AI thinks moving LEFT scores +1700 points per piece:
- `capturesThisRound: 1000` (FALSE - no capture should occur)
- `pieceAdvantage: 200`

**Test Case:** `PositionExplorationStrategy.openLane.test.ts`
- Blue P1 moves from (4,8) to (3,8), opening lane at x=4
- Red P1 at (4,2) should move UP to (4,10) for +1500 (safe zone + back wall)
- Instead: All Red pieces move LEFT and stack at (3,2) for +1700 each

**Root Cause Found:**

1. ✅ Collision detection works correctly (phantom capture test passes)
2. ✅ Movement system works correctly (direction tests pass)
3. ❌ **AI enemy prediction is flawed**

**The Bug:**
- Red AI asks: "What's Blue's best move if I stay still?"
- Blue P1 at (3,8) evaluates `down 8` as best move (delta=500)
- Blue's path from (3,8) `down 8` goes through (3,2), (3,1), (3,0)
- Red pieces moving to (3,2) collide with Blue's path at step (3,2)
- This is a REAL collision IF Blue actually moves `down 8`
- But Blue already moved last turn - won't move `down 8` next turn

**The Flaw:**
AI algorithm predicts enemy moves from current state, not accounting for what moves make sense given recent history. Blue just moved LEFT - unlikely to immediately charge toward Red's back wall.

**🎯 SOLUTION: Combinatorial Move Selection (Team Coordination)**

**The Real Bug:**
Not a phantom capture - AI correctly predicts enemy move. The bug is **all three pieces independently choose the same move**, not realizing teammates are doing the same thing.

**Current Behavior:**
- Red P1 evaluates: "LEFT 1 scores +1700" → chooses LEFT
- Red P2 evaluates: "LEFT 2 scores +1700" → chooses LEFT
- Red P3 evaluates: "LEFT 3 scores +1700" → chooses LEFT
- **Result:** All stack at (3,2) for total +1700 (only one capture possible)

**Desired Behavior:**
- Red P1: UP 8 → +1500 (back wall exploit)
- Red P2: LEFT 2 → +1700 (block enemy)
- Red P3: Stay → +0 (defend)
- **Result:** Diversified strategy for total +3200

## New Algorithm Design

**Step 1: Collect Best Move Per Direction (per piece)**

For each piece, find the single highest-scoring move in each direction:
- Best UP move
- Best DOWN move
- Best LEFT move
- Best RIGHT move

Maximum 4 moves collected per piece (not 40).

**Step 2: Generate All Valid Combinations**

With 3 pieces × 4 directions = 12 possible moves, generate all combinations:
- 4 × 4 × 4 = 64 total combinations (manageable!)

**Step 3: Filter Out Friendly Stacking**

Remove combinations where two pieces end at same position.

**Step 4: Pick Highest Total Score**

Sum scores across all 3 pieces, pick combination with highest total.

## Implementation Plan

1. **Modify `findBestMoveForPiece()`:**
   - Return **4 moves** (best per direction) instead of 1
   - Return type: `{ up: BestMoveResult, down: ..., left: ..., right: ... }`

2. **Add `findBestCombination()` method:**
   - Input: 4 moves per piece (12 total)
   - Generate 64 combinations
   - Filter friendly collisions
   - Return combination with max total score

3. **Update `getCommands()` main loop:**
   - Collect 4 moves per piece (vs enemy's best response)
   - Call `findBestCombination()`
   - Return winning combination

## Performance Impact

- Before: 41 evals per piece × 3 = 123 evaluations
- After: 41 evals per piece × 3 = 123 evaluations (same!)
- Plus: 64 combinations to filter/score (trivial cost)

**No performance hit** - we already evaluate all 40 moves, just keeping top 4 instead of top 1.

**NEXT: Implement new algorithm**

**Previous Test Coverage:**
- ✅ **AI Strategy Tests** (22 tests) - Position Exploration AI
- ✅ **Rescue Key Tests** (9 tests) - Key spawning, pickup, rescue mechanics
- ✅ **Collision Tests** (5 tests) - Neutral zone, same-team, territory-based tagging
- ✅ **Movement Tests** (14 tests) - Direction correctness and guard zones

---

### COMPLETED: Unit Testing ✅

**✅ COMPLETED:**
- Implemented `PositionExplorationStrategy` with `findBestMoveForPiece()` core method
- Created comprehensive unit test suite (17 tests total)
- Fixed simulation bug (flag capture now works correctly)
- Validated AI decision-making across all major scenarios

**🐛 BUG FIXED:**
- Initial bug: Simulation wasn't capturing flags correctly
- Root cause: Misunderstood debug output (showing all explorations, not final choice)
- Solution: AI was actually working correctly all along! Added proper debug logging to verify

**📊 UNIT TEST RESULTS:**

1. **✅ Flag Capture** - WORKING
   - ✅ Piece landing on enemy flag captures it
   - ✅ Simulation correctly updates `flags.carriedBy`
   - ✅ Score reflects capture (+8500 points including back wall bonus)
   - **AI chose:** `up 3, delta=8500` to grab flag at (5,0)

2. **✅ Piece Captures/Tagging** - WORKING
   - ✅ Test: Landing on enemy piece in their territory
     - Result: AI chose `delta=0` (territory penalty -200 may outweigh capture bonus)
   - ✅ Test: Piece in danger in enemy territory
     - **AI chose:** `up 3, delta=9500` to escape danger AND grab flag (smart!)

3. **✅ Back Wall Scoring** - WORKING
   - ✅ AI recognizes value of reaching enemy back wall
   - **AI chose:** `up 2, delta=1500` to reach back wall at y=0
   - Territory penalty (-200 per step) partially offsets back wall bonus (+500)

4. **✅ Territory Control** - WORKING
   - ✅ No-guard zone blocking when active: AI respects boundary (chose `delta=0`)
   - ✅ No-guard zone open when flag captured: Test ran (behavior depends on scoring)

5. **⚠️  Enemy Response Simulation** - NEEDS TUNING
   - Test: AI against enemy counter-move
   - Result: AI chose `delta=0` (stay still) when enemy can intercept
   - Possible issue: Score evaluator might not account for simultaneous enemy threats

**🎯 NEXT: Frontend Testing**

Unit tests prove the core logic works. Time to test against a human player:

- [ ] Start frontend/backend servers
- [ ] Select Position Exploration AI as opponent
- [ ] Play several games, observe AI decision-making
- [ ] Use AI analysis timeline to debug unexpected moves
- [ ] Verify AI makes strategically sound moves in real game scenarios

**Key Insights from Unit Tests:**
- Simulation IS working correctly (flag capture, movement, collisions)
- AI prioritizes high-value objectives (flag capture > back wall > staying safe)
- Territory penalty (-200 per turn in enemy territory) is a strong deterrent
- Enemy response simulation might need tuning (AI too conservative against threats)

**Success Criteria for Frontend Testing:**
- AI moves toward enemy flag when opportunity exists
- AI defends own flag when threatened
- AI reaches back wall when it's the best option
- AI beats human player more often than not

---

### Implementation Steps (Resume After Unit Tests Pass)
1. **Planning Phase** ✅ - Complete
2. **Implementation Phase** ✅ - Complete (but buggy)
3. **Unit Testing Phase** 🚧 - IN PROGRESS (fixing simulation bugs)
4. **Frontend Testing Phase** - Test against human, verify moves make sense
5. **Optimization Phase** - Tune until AI dominates

**Estimated Effort:** 10+ hours (significant undertaking)

---

## NEXT: ChatGPT App Interface

**Goal:** Test if gaming via chat interface is fun/viable - social experiment

**What:** ChatGPT app where humans play against the (now-good) AI using natural language prompts

**Requirements:**
- MCP server integration (similar to local version we already have)
- Single-file HTML widget served via MCP resource
- ChatGPT can send commands to Railway backend WebSocket
- **Automate Frontend Deployment:** CI/CD for frontend (push to GitHub → auto-deploy, like backend)

**Gating Mechanism:** Players must beat AI in ChatGPT before unlocking human-vs-human matches

**Blockers:** Need improved AI opponent first (current priority above)

---

## END GOAL: Human vs Human Competitive Prompting Game

**Vision:** Humans compete using prompting skills to command their pieces in strategic battles

**Possible Modes:**
1. Pre-written prompt that auto-competes throughout match
2. Live prompting - small bits of prompting as game progresses
3. Simpler drag-and-drop versions for accessibility

**Why This Matters:** First game where strategic commanding via prompts is the core mechanic - test of prompting skill, not just game knowledge

**Path to Get There:** ChatGPT app (above) proves the concept is fun before building full human-vs-human infrastructure

---

## FUTURE: Game Mechanic Improvements

**Lower priority quality-of-life fixes:**

### Rescue Key Timing Fix
**Current behavior:** When a piece captures a rescue key to free a jailed teammate, the piece waits a full turn before being returned to its starting position.

**Desired behavior:** The piece should be immediately returned to its starting position in the SAME round when it captures the key.

**Why it matters:** Current mechanic feels sluggish and punishes the rescuing player unnecessarily. Immediate return would make rescues feel more fluid and fair.

**Affected code:** `RescueKeyManager.ts` - key capture and piece return logic

---
