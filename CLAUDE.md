# Commander's Flag War - Development Guide

## 🧠 Memory System - START HERE

**Every new agent should read these files FIRST:**

### STATE.md - What We Know (The Past)
- **Location:** `/Users/joshuamullet/code/commander/STATE.md`
- **Contains:** Facts, lessons learned, accomplished work, current state
- **Organization:** Newest entries at top with timestamps
- **Does NOT contain:** Future plans or todos

### PLAN.md - What We're Doing (The Future)
- **Location:** `/Users/joshuamullet/code/commander/PLAN.md`
- **Contains:** Current work, next steps, active tasks
- **Organization:** Current task at top, priority order descending
- **Does NOT contain:** Past accomplishments or lessons learned

### The Workflow (Scoop & Consolidate)
1. Work on top item in PLAN.md
2. When completed: scoop it off the top
3. Consolidate debugging/details into concise learning
4. Drop at top of STATE.md with timestamp
5. Next item in PLAN.md becomes new priority

**Key principle:** PLAN.md can be messy with trial-and-error. STATE.md gets the distilled lesson.

---

## ⚠️ CRITICAL: Server Restart Protocol

**MANDATORY: Run `npm restart` after EVERY backend code change.**

Auto-reload (`tsx watch`) is BROKEN. It fails ~50% of the time. Always restart manually.

```bash
npm start    # Start both servers, track PIDs in .pids/
npm stop     # Kill ONLY tracked servers
npm restart  # Stop + 2s cooldown + Start (USE THIS AFTER CHANGES)
```

**Rules:**
- ✅ **ALWAYS** `npm restart` after backend changes
- ❌ **NEVER** assume `tsx watch` picked up changes
- ❌ **NEVER** use `pkill` or `killport` manually - use `npm stop`

**Ports:**
- Frontend: `http://localhost:3456`
- Backend: `ws://localhost:9999/ws`

---

## 🔄 Frontend Auto-Reload Protocol

**Frontend HMR is unreliable.** Add unique console.log to every change as proof it loaded:

```typescript
console.log('✅ Feature X updated - v2');
```

Remove old proof-of-change logs to avoid clutter.

---

## 🚨 CODE ORGANIZATION - MANDATORY RULES

**Before adding ANY code:**

1. **READ DIRECTORY.md FIRST** - Understand where code belongs
2. **One responsibility per file** - Respect existing architecture
3. **Don't bloat movement-server.ts** - Entry point stays slim (~200 lines)
4. **Ask before creating files** - If unsure where code belongs

See `/Users/joshuamullet/code/commander/DIRECTORY.md` for file organization guide.

---

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
