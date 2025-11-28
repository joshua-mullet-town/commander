/**
 * Player - Abstract interface for game participants
 * Enables polymorphic command sources (Human, AI strategies, etc.)
 */

import type { Command, AIResponse } from '../ai/strategies/AIStrategy.js';
import type { GameState } from './types.js';

/**
 * Player interface - all players must implement getCommands()
 */
export interface Player {
  readonly id: string;
  readonly type: 'human' | 'ai';
  readonly side: 'A' | 'B';

  /**
   * Get commands for this player's turn
   * @returns Promise resolving to commands and optional reasoning
   */
  getCommands(gameState: GameState): Promise<AIResponse>;
}

/**
 * HumanPlayer - Waits for commands from WebSocket client
 */
export class HumanPlayer implements Player {
  readonly type = 'human' as const;
  readonly id: string;
  readonly side: 'A' | 'B';

  private pendingCommands: Command[] | null = null;
  private commandResolver: ((commands: Command[]) => void) | null = null;

  constructor(id: string, side: 'A' | 'B') {
    this.id = id;
    this.side = side;
  }

  /**
   * Get commands - returns a promise that resolves when client submits commands
   */
  async getCommands(_gameState: GameState): Promise<AIResponse> {
    if (this.pendingCommands) {
      const commands = this.pendingCommands;
      this.pendingCommands = null;
      return { commands, reasoning: 'Human player' };
    }

    // Wait for commands from client
    return new Promise((resolve) => {
      this.commandResolver = (commands: Command[]) => {
        resolve({ commands, reasoning: 'Human player' });
      };
    });
  }

  /**
   * Submit commands from WebSocket client
   */
  submitCommands(commands: Command[]): void {
    if (this.commandResolver) {
      this.commandResolver(commands);
      this.commandResolver = null;
    } else {
      this.pendingCommands = commands;
    }
  }
}
