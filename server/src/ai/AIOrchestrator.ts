/**
 * AIOrchestrator
 * Manages AI move generation and queuing for game rooms
 */

import type { GameRoom } from '../game/types.js';
import { RoomManager } from '../game/RoomManager.js';

export class AIOrchestrator {
  private roomManager: RoomManager;

  constructor(roomManager: RoomManager) {
    this.roomManager = roomManager;
  }

  /**
   * Check if room needs AI generation and start if needed
   */
  checkAndStartAIGeneration(roomCode: string): void {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    const playerB = room.gameState.players.B;
    console.log(`🔍 AIOrchestrator.checkAndStartAIGeneration() - Room: ${roomCode}, PlayerB type: ${playerB?.player.type || 'null'}, Pending: ${room.pendingAIGeneration}`);

    // Check if Player B is AI - start AI generation in background (NON-BLOCKING)
    // AI commands will be queued for next available round when they arrive
    if (room.gameState.players.B?.player.type === 'ai' && !room.pendingAIGeneration) {
      console.log(`✅ Starting AI generation for room ${roomCode}`);
      this.startAIGenerationInBackground(roomCode);
    }
  }

  /**
   * Start AI generation in background - NON-BLOCKING
   * Commands will be queued for next available round when AI responds
   */
  private startAIGenerationInBackground(roomCode: string): void {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return;

    // Mark that AI generation is in progress
    room.pendingAIGeneration = true;
    const requestedForRound = room.gameState.round;

    console.log(`🤖 Starting AI generation in background for round ${requestedForRound} (non-blocking)`);

    // Get AI player instance
    const aiPlayer = room.gameState.players.B?.player;
    if (!aiPlayer || aiPlayer.type !== 'ai') {
      console.error(`❌ Player B is not an AI player`);
      room.pendingAIGeneration = false;
      return;
    }

    // Start async AI call - DO NOT AWAIT
    aiPlayer.getCommands(room.gameState)
      .then(({ commands: aiCommands, reasoning, analysis, prompt }) => {
        // Re-fetch room in case it changed during AI call
        const freshRoom = this.roomManager.getRoom(roomCode);
        if (!freshRoom) {
          console.log(`⚠️ Room ${roomCode} no longer exists`);
          return;
        }

        // Clear pending flag
        freshRoom.pendingAIGeneration = false;

        // Determine which round to queue for
        const currentRound = freshRoom.gameState.round;

        // Always try to queue for the round it was requested for
        // If that round already passed, queue for current round instead
        let targetRound = requestedForRound;
        if (requestedForRound < currentRound) {
          // We're late - the round we were generating for already passed
          targetRound = currentRound;
        }

        // Initialize queue if needed
        if (!freshRoom.gameState.commandQueue[targetRound]) {
          freshRoom.gameState.commandQueue[targetRound] = {
            playerA: [],
            playerB: [],
            aiReasoning: undefined,
            aiAnalysis: undefined,
            aiPrompt: undefined
          };
        }

        // Queue AI commands, reasoning, analysis, AND prompt together for the same round
        freshRoom.gameState.commandQueue[targetRound].playerB = aiCommands;
        freshRoom.gameState.commandQueue[targetRound].aiReasoning = reasoning;
        freshRoom.gameState.commandQueue[targetRound].aiAnalysis = analysis;
        freshRoom.gameState.commandQueue[targetRound].aiPrompt = prompt;

        if (targetRound === requestedForRound) {
          console.log(`🤖 AI responded on-time - queued ${aiCommands.length} commands for round ${targetRound}`);
        } else {
          console.log(`🤖 AI responded late - queued ${aiCommands.length} commands for round ${targetRound} (requested: ${requestedForRound}, late by ${targetRound - requestedForRound} rounds)`);
        }
      })
      .catch((error) => {
        console.error(`❌ AI generation failed:`, error);
        // Clear pending flag on error
        const freshRoom = this.roomManager.getRoom(roomCode);
        if (freshRoom) {
          freshRoom.pendingAIGeneration = false;
        }
      });
  }

}
