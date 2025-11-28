/**
 * BaselineStrategy - "The Ass AI"
 * Original AI strategy - known to be weak, preserved as baseline for comparison
 * Uses basic tactical priorities without chain-of-thought reasoning
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import type { AIStrategy, AIResponse, Command } from './AIStrategy.js';
import type { GameState } from '../../game/types.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Enable/disable prompt logging (set to true to capture prompts/responses)
const ENABLE_PROMPT_LOGGING = true;
const LOG_DIR = path.join(process.cwd(), 'ai-logs');

// Track which game sessions we've initialized logs for
const initializedSessions = new Set<string>();

const GAME_RULES = `# Commander's Flag War - Game Rules

## Objective
Capture the enemy flag and bring it back to your territory to win.

## Board
- 11x11 grid (x: 0-10, y: 0-10)
- Blue territory: rows 6-10 (Player A)
- Neutral zone: row 5
- Red territory: rows 0-4 (Player B)

## Teams
- Blue (Player A): You control pieces that start in rows 6-10
- Red (Player B): Enemy pieces that start in rows 0-4
- Each team has 5 pieces (IDs 0-4)

## Flags
- Blue flag spawns at (5, 10)
- Red flag spawns at (5, 0)
- Land on enemy flag to pick it up
- Bring enemy flag to your territory to WIN
- If flag carrier is tagged, flag returns to spawn

## Tagging & Jail
- In enemy territory: You can be tagged and sent to jail
- In your territory: You can tag enemies and send them to jail
- Jailed pieces appear in opponent's back row
- Rescue keys spawn randomly in your territory
- Pick up rescue key to free all your jailed pieces

## Movement
- Each round, give commands for your pieces
- Format: {pieceId, direction, distance}
- Directions: 'up', 'down', 'left', 'right'
- Distance: Any number of cells (up to board edge or until blocked)
- Pieces move simultaneously, then check collisions/tags
- Movement stops when hitting a wall, another piece, or the target distance

## Strategy Tips
- Protect your flag
- Coordinate attacks
- Use rescue keys to free teammates
- Balance offense and defense`;

export class BaselineStrategy implements AIStrategy {
  readonly name = 'baseline';
  readonly version = 'v1';
  readonly description = 'Original "ass" AI - weak baseline for comparison';

  private currentSessionId: string | null = null;
  private currentLogFile: string | null = null;

  /**
   * Initialize a new game session log file
   */
  private initializeSessionLog(sessionId: string, systemPrompt: string): void {
    if (initializedSessions.has(sessionId)) return;

    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const filename = `game-session_${this.name}-${this.version}_${timestamp}.md`;
      const filepath = path.join(LOG_DIR, filename);

      const header = `# AI Game Session Log
**Strategy**: ${this.name} ${this.version}
**Session ID**: ${sessionId}
**Started**: ${new Date().toISOString()}

---

## System Prompt (Game Rules)

\`\`\`
${systemPrompt}
\`\`\`

---

# Round-by-Round Interactions

`;

      fs.writeFileSync(filepath, header, 'utf-8');
      this.currentSessionId = sessionId;
      this.currentLogFile = filepath;
      initializedSessions.add(sessionId);
      console.log(`📝 Started new AI log session: ${filename}`);
    } catch (error) {
      console.error('❌ Failed to initialize AI session log:', error);
    }
  }

  /**
   * Append round data to the session log
   */
  private appendRoundToLog(round: number, aiPlayer: 'A' | 'B', userPrompt: string, response: string): void {
    if (!ENABLE_PROMPT_LOGGING || !this.currentLogFile) return;

    try {
      const roundContent = `
## Round ${round} - Player ${aiPlayer}
**Timestamp**: ${new Date().toISOString()}

### User Prompt (Board State + Strategy)

\`\`\`
${userPrompt}
\`\`\`

### AI Response

\`\`\`
${response}
\`\`\`

---

`;

      fs.appendFileSync(this.currentLogFile, roundContent, 'utf-8');
      console.log(`📝 Logged round ${round} to session log`);
    } catch (error) {
      console.error('❌ Failed to append round to log:', error);
    }
  }

  async getCommands(gameState: GameState, aiPlayer: 'A' | 'B'): Promise<AIResponse> {
    const boardState = this.formatBoardState(gameState, aiPlayer);
    const prompt = this.buildPrompt(boardState, aiPlayer);

    // Initialize session log on first call (round 1)
    const sessionId = `game-${Date.now()}`;
    if (gameState.round === 1 || !this.currentLogFile) {
      this.initializeSessionLog(sessionId, GAME_RULES);
    }

    try {
      console.log(`🤖 AI (${this.name}-${this.version}, Player ${aiPlayer}) thinking...`);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: GAME_RULES },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 800
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        console.error('❌ No response from AI');
        return { commands: [], reasoning: 'No response from AI' };
      }

      console.log(`🤖 AI Response:\n${response}`);

      // Append round to session log
      this.appendRoundToLog(gameState.round, aiPlayer, prompt, response);

      const { commands, reasoning } = this.parseAIResponse(response, gameState, aiPlayer);
      console.log(`✅ AI Commands:`, commands);
      console.log(`💭 AI Reasoning:`, reasoning);

      return { commands, reasoning, prompt };
    } catch (error) {
      console.error('❌ AI Error:', error);
      return { commands: [], reasoning: `Error: ${error}`, prompt };
    }
  }

  private formatBoardState(gameState: GameState, aiPlayer: 'A' | 'B'): string {
    const enemyPlayer = aiPlayer === 'A' ? 'B' : 'A';

    const myPieces = gameState.players[aiPlayer]?.pieces || [];
    const enemyPieces = gameState.players[enemyPlayer]?.pieces || [];

    const boardState = {
      round: gameState.round,
      yourTeam: aiPlayer,
      yourPieces: myPieces.map(p => ({ id: p.id, x: p.x, y: p.y, alive: p.alive })),
      yourJailedPieces: gameState.players[aiPlayer]?.jailedPieces || [],
      enemyPieces: enemyPieces.map(p => ({ id: p.id, x: p.x, y: p.y, alive: p.alive })),
      enemyJailedPieces: gameState.players[enemyPlayer]?.jailedPieces || [],
      blueFlag: gameState.flags.A,
      redFlag: gameState.flags.B,
      rescueKeys: {
        yours: gameState.rescueKeys[aiPlayer],
        enemy: gameState.rescueKeys[enemyPlayer]
      }
    };

    return JSON.stringify(boardState, null, 2);
  }

  private buildPrompt(boardState: string, aiPlayer: 'A' | 'B'): string {
    const teamName = aiPlayer === 'A' ? 'Blue' : 'Red';
    const myTerritory = aiPlayer === 'A' ? 'rows 6-10' : 'rows 0-4';
    const enemyTerritory = aiPlayer === 'A' ? 'rows 0-4' : 'rows 6-10';

    return `You are an EXPERT Capture the Flag strategist playing as ${teamName} team (Player ${aiPlayer}).

Current board state:
${boardState}

CRITICAL STRATEGIC PRIORITIES (in order):

1. **DEFEND AGAINST FLAG CAPTURE**
   - If enemy has YOUR flag and is heading to their territory → INTERCEPT IMMEDIATELY
   - Calculate their path and cut them off - use multiple pieces if needed
   - This is your #1 priority - if they score, you lose

2. **SECURE THE WIN**
   - If YOU have enemy flag, get it to your territory (${myTerritory}) as fast as possible
   - Have other pieces run interference to protect the flag carrier
   - Take the shortest path but avoid enemy pieces that could tag you

3. **TACTICAL FLAG CAPTURE**
   - Send fast raiders to grab enemy flag when path is clear
   - Use decoys: send 2-3 pieces toward flag, enemy can't defend everywhere
   - Coordinate timing: attack when enemy is out of position

4. **RESCUE OPERATIONS**
   - If you have jailed pieces AND a rescue key exists in your territory → grab it!
   - Freed pieces can immediately help with offense/defense
   - Don't waste a trip - only go for rescue key if it's strategically valuable

5. **DEFENSIVE POSITIONING**
   - Keep 1-2 pieces near your flag AT ALL TIMES
   - Position defenders to cover likely attack routes
   - If enemy is in your territory (${myTerritory}), TAG THEM - you have tagging power here

6. **OFFENSIVE POSITIONING**
   - When in enemy territory (${enemyTerritory}), you're at risk of being tagged
   - Move FAST through enemy territory - don't linger
   - Use long-distance moves (you can move 5-10 cells in one turn!)

TACTICAL EXECUTION:

**Piece Coordination:**
- Attack with 2-3 pieces simultaneously to overwhelm defense
- If splitting forces, have clear roles: raiders, defenders, support
- Don't cluster all pieces - spread out for better board control

**Movement Mastery:**
- You can move ANY distance in a turn (up to board edge)
- Use long moves: "distance": 8 is valid! Don't waste turns with tiny moves
- Plan multi-turn sequences: where will this piece be NEXT turn?

**Situational Awareness:**
- Track enemy piece positions - where are their defenders?
- Identify weak points in their formation
- If enemy has multiple jailed pieces, they're weakened - PRESS THE ATTACK

**Decision Making:**
- Be AGGRESSIVE when you have an advantage (more pieces, flag in hand)
- Be CAUTIOUS when at a disadvantage (pieces jailed, flag stolen)
- ADAPT: if original plan is blocked, pivot immediately

Provide your response in TWO parts:

1. REASONING: Explain your tactical decision for this turn (2-3 sentences max)
2. COMMANDS: JSON array of commands

Format your response exactly like this:
REASONING: [Your strategic explanation here]

COMMANDS:
[
  {"pieceId": 0, "direction": "down", "distance": 6},
  {"pieceId": 1, "direction": "right", "distance": 4}
]

Each command must have:
- pieceId: The ID of your piece (0-4)
- direction: One of "up", "down", "left", "right"
- distance: Any positive number (use large distances! 5-10 cells is normal)

Give commands for THIS ROUND ONLY. Play to WIN.`;
  }

  private parseAIResponse(response: string, gameState: GameState, aiPlayer: 'A' | 'B'): { commands: Command[]; reasoning: string } {
    try {
      // Extract reasoning
      const reasoningMatch = response.match(/REASONING:\s*(.+?)(?=COMMANDS:|$)/s);
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided';

      // Extract JSON array from response (AI might wrap it in markdown)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('❌ No JSON array found in AI response');
        return { commands: [], reasoning };
      }

      const commands = JSON.parse(jsonMatch[0]) as Command[];

      // Validate commands
      const validCommands = commands.filter(cmd => {
        const piece = gameState.players[aiPlayer]?.pieces.find(p => p.id === cmd.pieceId);
        const validDirection = ['up', 'down', 'left', 'right'].includes(cmd.direction);
        const validDistance = cmd.distance >= 1;
        const pieceAlive = piece && piece.alive;

        if (!piece) {
          console.warn(`⚠️  Invalid piece ID: ${cmd.pieceId}`);
          return false;
        }
        if (!pieceAlive) {
          console.warn(`⚠️  Piece ${cmd.pieceId} is not alive`);
          return false;
        }
        if (!validDirection) {
          console.warn(`⚠️  Invalid direction: ${cmd.direction}`);
          return false;
        }
        if (!validDistance) {
          console.warn(`⚠️  Invalid distance: ${cmd.distance} (must be >= 1)`);
          return false;
        }

        return true;
      });

      return { commands: validCommands, reasoning };
    } catch (error) {
      console.error('❌ Failed to parse AI response:', error);
      return { commands: [], reasoning: `Parse error: ${error}` };
    }
  }
}
