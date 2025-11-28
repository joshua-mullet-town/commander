/**
 * AIStrategy Interface
 * Defines the contract for all AI strategies
 */

import type { GameState } from '../../game/types.js';

export type Command = {
  pieceId: number;
  direction: 'up' | 'down' | 'left' | 'right';
  distance: number;
};

import type { AIAnalysis } from '../../game/types.js';

export type AIResponse = {
  commands: Command[];
  reasoning: string; // Legacy text reasoning
  analysis?: AIAnalysis; // New structured scoreboard data
  prompt: string; // The full user prompt sent to AI
};

export interface AIStrategy {
  readonly name: string;
  readonly version: string;
  readonly description: string;

  /**
   * Generate commands for the given game state
   */
  getCommands(gameState: GameState, aiPlayer: 'A' | 'B'): Promise<AIResponse>;
}
