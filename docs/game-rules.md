# Commander's Flag War - Game Rules

## Board Setup
- **Grid:** 11x11 (coordinates 0-10)
- **Players:** 2 (Player A vs Player B)
- **Pieces per player:** 3 mobile pieces + 1 flag

### Starting Positions
**Player A (Bottom - Blue):**
- Flag: (5, 10) - cannot move
- Pieces: (4, 9), (5, 9), (6, 9)

**Player B (Top - Red):**
- Flag: (5, 0) - cannot move
- Pieces: (4, 1), (5, 1), (6, 1)

## Movement Rules
- **Tick System:** Game executes every 3 seconds
- **Directions:** Up, down, left, right only (no diagonals)
- **Distance:** Any number of squares per move
- **Command Queue:** Players queue moves for current round
- **One Move Per Piece:** Only one command per piece per round (last command replaces previous)
- **Boundaries:** Pieces stop at walls (0-10 range), cannot move off board

## Collision Rules

### Simultaneous Movement
- All pieces move at the same time
- Collision is checked at **final destinations only**
- Pieces can "pass through" each other during movement

### Collision Detection (Same Square, Same Round)

#### Same Team Collision
- **Both pieces bounce back** to their original positions
- No penalty

#### Enemy Collision (Different Teams)
Depends on **territory**:

**Your Territory:**
- **Rows 6-10** = Player A territory
- **Rows 0-4** = Player B territory
- **Row 5** = Neutral zone

**Tagging Rules:**
1. **Defending (in your territory):**
   - Enemy lands on you → **Enemy goes to jail**

2. **Attacking (in enemy territory):**
   - Enemy lands on you → **You go to jail**

3. **Neutral Zone (row 5):**
   - Both pieces land on same square → **Both go to jail**

### Jail Rules

**Jail System:**
- Jailed pieces are removed from the board but remain visible on the sidelines
- Each player has their own jail where their tagged pieces wait
- Jailed pieces cannot move or participate in gameplay

**Rescue Key Mechanic:**
- When **any player has pieces in jail**, a **rescue key** appears on the board
- Key appears in **neutral territory (row 5)** at a random position
- Only **one key** exists at a time (shared between both teams)
- When **any piece lands on the key**:
  - **ALL jailed pieces** from that player's team are rescued
  - **The rescuing piece** is also reset
  - **All rescued pieces + rescuer** return to their **original starting positions**
  - Key disappears after rescue
  - New key spawns if any player still has pieces in jail

**Example:**
1. Player A has 2 pieces in jail
2. Key spawns at random position on row 5
3. Player A's remaining piece lands on key
4. All 3 pieces (2 jailed + 1 rescuer) return to original positions: (4,9), (5,9), (6,9)

## Win Conditions
- **Capture enemy flag:** Land a piece on enemy flag position
- **Eliminate all enemy pieces:** All enemy mobile pieces in jail
- Game ends immediately when win condition met

## Future Rules (Not Yet Implemented)
- [ ] Flag capture
- [x] Jail rescue mechanic (✅ Implemented)
- [ ] Piece speed variations
- [ ] Special abilities
- [ ] Multi-round command planning
