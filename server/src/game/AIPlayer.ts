/**
 * AIPlayer - Wraps an AIStrategy for polymorphic use with Player interface
 */

import type { AIStrategy, AIResponse } from '../ai/strategies/AIStrategy.js';
import type { CommanderGameState } from './types.js';
import type { Player } from './Player.js';

export class AIPlayer implements Player {
  readonly type = 'ai' as const;
  readonly id: string;
  readonly side: 'A' | 'B';
  private strategy: AIStrategy;

  constructor(id: string, side: 'A' | 'B', strategy: AIStrategy) {
    this.id = id;
    this.side = side;
    this.strategy = strategy;
  }

  /**
   * Get commands by delegating to AI strategy
   */
  async getCommands(gameState: CommanderGameState): Promise<AIResponse> {
    console.log(`🎯 AIPlayer.getCommands() called - Strategy: ${this.strategy.name}, Side: ${this.side}, Round: ${gameState.round}`);
    const result = await this.strategy.getCommands(gameState, this.side);
    console.log(`✅ AIPlayer.getCommands() returned ${result.commands.length} commands:`, result.commands);
    return result;
  }

  /**
   * Get strategy info for debugging/display
   */
  getStrategyInfo(): { name: string; version: string; description: string } {
    return {
      name: this.strategy.name,
      version: this.strategy.version,
      description: this.strategy.description
    };
  }
}
