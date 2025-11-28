/**
 * MCPServerSetup
 * MCP (Model Context Protocol) server configuration for AI assistant integration
 * Provides tools and resources for ChatGPT/Claude to interact with the game
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ReadResourceRequest,
  type Resource,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import type { PizzazWidget } from "../game/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const ASSETS_DIR = path.resolve(ROOT_DIR, "assets");

/**
 * Read widget HTML from assets directory
 */
function readWidgetHtml(componentName: string): string {
  const componentPath = path.join(ASSETS_DIR, `${componentName}.html`);
  if (fs.existsSync(componentPath)) {
    return fs.readFileSync(componentPath, "utf-8");
  }
  return `<p>Widget ${componentName} not found</p>`;
}

/**
 * Define the game widgets available through MCP
 */
const pizzazWidgets: PizzazWidget[] = [
  {
    id: "movement-commander",
    title: "Movement Commander",
    templateUri: "movement-commander-game",
    invoking: "Opening movement commander game...",
    invoked: "Movement commander game ready!",
    html: readWidgetHtml("movement-commander"),
    responseText: "Welcome to Movement Commander! Control your pieces through natural language commands.",
  },
];

/**
 * Create and configure the MCP server
 */
export function createMCPServer(): Server {
  const server = new Server(
    {
      name: "movement-commander",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "move_piece",
          description: "Move a piece in a specific direction",
          inputSchema: {
            type: "object",
            properties: {
              pieceId: { type: "number", description: "Piece ID (1, 2, or 3)" },
              direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Direction to move" },
              distance: { type: "number", description: "Number of spaces to move" },
              targetRound: { type: "number", description: "Optional: specific round to execute the move" }
            },
            required: ["pieceId", "direction", "distance"]
          }
        },
        {
          name: "view_battle_plan",
          description: "View your queued movements for upcoming rounds",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "command_piece",
          description: "Command a piece to move in a specific direction for a specific round (overrides any existing command for that round)",
          inputSchema: {
            type: "object",
            properties: {
              pieceId: { type: "number", description: "Piece ID (1, 2, or 3)" },
              direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Direction to move" },
              distance: { type: "number", description: "Number of spaces to move" },
              round: { type: "number", description: "Specific round to execute the move" }
            },
            required: ["pieceId", "direction", "distance", "round"]
          }
        },
        {
          name: "cancel_piece_commands",
          description: "Cancel all future commands for a specific piece",
          inputSchema: {
            type: "object",
            properties: {
              pieceId: { type: "number", description: "Piece ID (1, 2, or 3)" }
            },
            required: ["pieceId"]
          }
        }
      ] satisfies Tool[]
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "move_piece": {
          const { pieceId, direction, distance, targetRound } = args as {
            pieceId: number;
            direction: string;
            distance: number;
            targetRound?: number;
          };

          return {
            content: [
              {
                type: "text",
                text: `Movement command queued: Piece ${pieceId} move ${direction} ${distance} spaces${targetRound ? ` in round ${targetRound}` : ' next round'}`,
              },
              {
                type: "resource",
                resource: {
                  uri: "movement-commander-game",
                  mimeType: "text/html",
                  text: readWidgetHtml("movement-commander"),
                },
              },
            ],
          };
        }

        case "view_battle_plan": {
          // TODO: Return current battle plan
          return {
            content: [
              {
                type: "text",
                text: "Battle plan view - showing your queued movements",
              },
              {
                type: "resource",
                resource: {
                  uri: "movement-commander-game",
                  mimeType: "text/html",
                  text: readWidgetHtml("movement-commander"),
                },
              },
            ],
          };
        }

        case "command_piece": {
          // Note: This will be re-implemented for room-based MCP integration
          return {
            content: [
              {
                type: "text",
                text: "This tool will be re-implemented for room-based game system.",
              },
            ],
          };
        }

        case "cancel_piece_commands": {
          // Note: This will be re-implemented for room-based MCP integration
          return {
            content: [
              {
                type: "text",
                text: "This tool will be re-implemented for room-based game system.",
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      throw new Error(`Error executing tool ${name}: ${error}`);
    }
  });

  // Register resource list handler
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: pizzazWidgets.map(widget => ({
        uri: widget.templateUri,
        name: widget.title,
        mimeType: "text/html",
        description: `${widget.title} widget`
      })) satisfies Resource[]
    };
  });

  // Register resource read handler
  server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
    const { uri } = request.params;
    const widget = pizzazWidgets.find(w => w.templateUri === uri);

    if (!widget) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: "text/html",
          text: widget.html
        }
      ]
    };
  });

  return server;
}

export { SSEServerTransport };
