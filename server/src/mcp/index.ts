#!/usr/bin/env node
/**
 * MCP Server Entry Point
 * Exposes game control tools via Model Context Protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';

// Game backend connection
const GAME_SERVER_WS = 'ws://localhost:9999/ws';
let gameConnection: WebSocket | null = null;

/**
 * Connect to the game WebSocket server
 */
function connectToGameServer(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(GAME_SERVER_WS);

    ws.on('open', () => {
      console.error('✅ MCP Server connected to game backend');
      resolve(ws);
    });

    ws.on('error', (error) => {
      console.error('❌ Failed to connect to game server:', error.message);
      reject(error);
    });

    ws.on('close', () => {
      console.error('⚠️ Game server connection closed - reconnecting in 2s...');
      gameConnection = null;
      setTimeout(() => {
        connectToGameServer().then(conn => {
          gameConnection = conn;
          console.error('✅ Reconnected to game server');
        }).catch(err => {
          console.error('❌ Failed to reconnect:', err.message);
        });
      }, 2000);
    });
  });
}

/**
 * Find active game with human player
 */
async function findActiveHumanGame(): Promise<{ roomCode: string; playerSide: 'A' | 'B' } | null> {
  if (!gameConnection) {
    throw new Error('Not connected to game server');
  }

  return new Promise((resolve) => {
    // Request games list
    gameConnection!.send(JSON.stringify({
      type: 'getGamesList',
      payload: {}
    }));

    // Listen for response
    const handler = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'gamesList') {
          const games = message.payload.games || [];

          // Filter for active games (status: 'playing')
          const activeGames = games.filter((g: any) => g.status === 'playing');

          if (activeGames.length === 0) {
            resolve(null);
          } else if (activeGames.length === 1) {
            // Found exactly one active game - assume human is Player A
            resolve({ roomCode: activeGames[0].roomCode, playerSide: 'A' });
          } else {
            // Multiple active games - can't auto-detect
            resolve(null);
          }

          gameConnection!.removeListener('message', handler);
        }
      } catch (error) {
        console.error('Error parsing games list:', error);
        resolve(null);
      }
    };

    gameConnection!.on('message', handler);

    // Timeout after 1 second
    setTimeout(() => {
      gameConnection!.removeListener('message', handler);
      resolve(null);
    }, 1000);
  });
}

/**
 * Queue a move command for the detected human player
 */
async function queueMoveCommand(
  pieceId: number,
  direction: 'up' | 'down' | 'left' | 'right',
  distance: number,
  targetRound?: number
): Promise<string> {
  const game = await findActiveHumanGame();

  if (!game) {
    return '❌ No active game found. Start a game first by visiting http://localhost:3456';
  }

  if (!gameConnection) {
    return '❌ Not connected to game server';
  }

  // Queue the move using MCP-specific handler
  gameConnection.send(JSON.stringify({
    type: 'mcpQueueMove',
    payload: {
      pieceId,
      direction,
      distance,
      targetRound
    }
  }));

  const roundInfo = targetRound ? `for Round ${targetRound}` : 'for next round';
  return `✅ Queued: Piece ${pieceId} → ${direction} ${distance} spaces ${roundInfo} (Room: ${game.roomCode}, Player: ${game.playerSide})`;
}

/**
 * Create and start the MCP server
 */
async function main() {
  console.error('🎮 Starting Commander MCP Server...');

  // Connect to game backend first
  try {
    gameConnection = await connectToGameServer();
  } catch (error) {
    console.error('❌ Failed to start MCP server: Could not connect to game backend');
    console.error('   Make sure the game server is running: npm run dev (from /server)');
    process.exit(1);
  }

  const server = new Server(
    {
      name: 'commander-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'move_piece',
          description: 'Move a piece in the active game. Automatically detects your active game and queues the move for the next round.',
          inputSchema: {
            type: 'object',
            properties: {
              pieceId: {
                type: 'number',
                description: 'Piece ID (1, 2, or 3)',
                enum: [1, 2, 3]
              },
              direction: {
                type: 'string',
                enum: ['up', 'down', 'left', 'right'],
                description: 'Direction to move'
              },
              distance: {
                type: 'number',
                description: 'Number of spaces to move (1-10)',
                minimum: 1,
                maximum: 10
              },
              targetRound: {
                type: 'number',
                description: 'Optional: specific round to execute the move. If not specified, queues for next round.',
              }
            },
            required: ['pieceId', 'direction', 'distance']
          }
        }
      ]
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'move_piece') {
      const { pieceId, direction, distance, targetRound } = args as {
        pieceId: number;
        direction: 'up' | 'down' | 'left' | 'right';
        distance: number;
        targetRound?: number;
      };

      const result = await queueMoveCommand(pieceId, direction, distance, targetRound);

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('🚀 Commander MCP Server ready!');
  console.error('📡 Connected to game backend at', GAME_SERVER_WS);
  console.error('🎯 Ready to accept move_piece commands');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
