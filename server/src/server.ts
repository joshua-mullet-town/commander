import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ListResourceTemplatesRequest,
  type ListResourcesRequest,
  type ListToolsRequest,
  type ReadResourceRequest,
  type Resource,
  type ResourceTemplate,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// WebSocket client to communicate with Movement Commander game server
let movementGameSocket: WebSocket | null = null;
let movementGameState: CommanderGameState | null = null;

function connectToMovementGame() {
  if (movementGameSocket?.readyState === WebSocket.OPEN) {
    return movementGameSocket;
  }

  console.log('🔌 Connecting to Movement Commander game server...');
  movementGameSocket = new WebSocket('ws://localhost:8001/ws');

  movementGameSocket.onopen = () => {
    console.log('✅ Connected to Movement Commander game server (MCP client)');
    // Don't join - just connect for sending commands
  };

  movementGameSocket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'gameState') {
      movementGameState = message.payload;
      console.log('📡 Updated movement game state from server');
    }
  };

  movementGameSocket.onclose = () => {
    console.log('🔌 Disconnected from Movement Commander game server');
    movementGameSocket = null;
  };

  movementGameSocket.onerror = (error) => {
    console.error('❌ Movement game connection error:', error);
    movementGameSocket = null;
  };

  return movementGameSocket;
}

function sendToMovementGame(message: any): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connectToMovementGame();

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      console.log('📤 Sent to movement game:', message.type);
      resolve(true);
    } else if (socket.readyState === WebSocket.CONNECTING) {
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify(message));
        console.log('📤 Sent to movement game (after connect):', message.type);
        resolve(true);
      }, { once: true });
    } else {
      console.log('❌ Failed to send to movement game - no connection');
      resolve(false);
    }
  });
}

type PizzazWidget = {
  id: string;
  title: string;
  templateUri: string;
  invoking: string;
  invoked: string;
  html: string;
  responseText: string;
};

// Movement Commander Game State
type Piece = {
  id: number;
  x: number;
  y: number;
  alive: boolean;
};

type Movement = {
  pieceId: number;
  direction: 'up' | 'down' | 'left' | 'right';
  distance: number;
};

type CommanderGameState = {
  round: number;
  players: {
    A: { id: string; type: 'chatgpt' | 'local'; pieces: Piece[] } | null;
    B: { id: string; type: 'chatgpt' | 'local'; pieces: Piece[] } | null;
  };
  commandQueue: {
    [round: number]: {
      playerA: Movement[];
      playerB: Movement[];
    };
  };
  gameStatus: 'waiting' | 'playing' | 'finished';
};

type GameMessage = {
  type: 'gameState' | 'move' | 'join' | 'reset';
  payload: any;
};

class TicTacToeGameManager {
  private game: GameState;
  private connections: Set<WebSocket> = new Set();

  constructor() {
    this.resetGame();
  }

  resetGame() {
    // Preserve existing players during reset (if game exists)
    const currentPlayers = this.game?.players || { X: null, O: null };
    this.game = {
      board: Array(9).fill(null),
      currentPlayer: 'X',
      gameStatus: currentPlayers.X && currentPlayers.O ? 'playing' : 'waiting',
      winner: null,
      players: currentPlayers // Keep existing player assignments
    };
  }

  addConnection(ws: WebSocket) {
    this.connections.add(ws);

    // Assign unique ID to this WebSocket connection
    (ws as any)._playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🆔 Assigned player ID: ${(ws as any)._playerId}`);

    this.sendGameState(ws);

    ws.on('close', (code, reason) => {
      this.connections.delete(ws);
      console.log(`🔌 WebSocket connection closed. Code: ${code}, Reason: ${reason || 'none'}`);

      // Remove player if they disconnect
      const playerId = (ws as any)._playerId;
      if (this.game.players.X?.id === playerId) {
        console.log(`❌ Player X (${this.game.players.X.type}) disconnected`);
        this.game.players.X = null;
      }
      if (this.game.players.O?.id === playerId) {
        console.log(`❌ Player O (${this.game.players.O.type}) disconnected`);
        this.game.players.O = null;
      }
      this.broadcastGameState();
    });

    ws.on('error', (error) => {
      console.log(`💥 WebSocket error:`, error);
    });
  }

  handleMessage(ws: WebSocket, message: GameMessage) {
    switch (message.type) {
      case 'join':
        this.handleJoin(ws, message.payload);
        break;
      case 'move':
        this.handleMove(ws, message.payload);
        break;
      case 'reset':
        console.log(`🔄 Reset requested by player ${(ws as any)._playerId}`);
        console.log(`🔄 Players before reset: X=${this.game.players.X?.type}, O=${this.game.players.O?.type}`);
        this.resetGame();
        console.log(`🔄 Players after reset: X=${this.game.players.X?.type}, O=${this.game.players.O?.type}`);
        console.log(`🔄 Broadcasting reset game state to ${this.connections.size} connections`);
        this.broadcastGameState();
        break;
    }
  }

  private handleJoin(ws: WebSocket, payload: { playerType: 'chatgpt' | 'local' }) {
    const playerId = (ws as any)._playerId;

    // Check if this player type is already connected
    const existingPlayerX = this.game.players.X;
    const existingPlayerO = this.game.players.O;

    if (existingPlayerX?.type === payload.playerType || existingPlayerO?.type === payload.playerType) {
      console.log(`⚠️ Player type ${payload.playerType} already connected, updating connection`);
      // Update the existing player's connection ID - maintain same role
      if (existingPlayerX?.type === payload.playerType) {
        this.game.players.X.id = playerId;
        console.log(`🔄 Player X (${payload.playerType}) reconnected`);
      } else if (existingPlayerO?.type === payload.playerType) {
        this.game.players.O.id = playerId;
        console.log(`🔄 Player O (${payload.playerType}) reconnected`);
      }
    } else {
      // Assign new player based on preference: ChatGPT = X, Local = O
      if (payload.playerType === 'chatgpt') {
        if (!this.game.players.X) {
          this.game.players.X = { id: playerId, type: payload.playerType };
          console.log(`👤 Player X assigned: ${payload.playerType}`);
        } else if (!this.game.players.O) {
          this.game.players.O = { id: playerId, type: payload.playerType };
          console.log(`👤 Player O assigned: ${payload.playerType}`);
        }
      } else { // local player
        if (!this.game.players.O) {
          this.game.players.O = { id: playerId, type: payload.playerType };
          console.log(`👤 Player O assigned: ${payload.playerType}`);
        } else if (!this.game.players.X) {
          this.game.players.X = { id: playerId, type: payload.playerType };
          console.log(`👤 Player X assigned: ${payload.playerType}`);
        }
      }
    }

    // Start game if both players joined
    if (this.game.players.X && this.game.players.O) {
      this.game.gameStatus = 'playing';
      console.log(`🎯 Game started! X: ${this.game.players.X.type}, O: ${this.game.players.O.type}`);
    }

    this.broadcastGameState();
  }

  private handleMove(ws: WebSocket, payload: { position: number }) {
    const playerId = (ws as any)._playerId;
    const { position } = payload;

    console.log(`🎯 Processing move: position ${position} from player ${playerId}`);

    // Validate move
    if (this.game.gameStatus !== 'playing') {
      console.log(`❌ Move rejected: game not playing (status: ${this.game.gameStatus})`);
      return;
    }
    if (this.game.board[position] !== null) {
      console.log(`❌ Move rejected: cell ${position} already occupied (${this.game.board[position]})`);
      return;
    }

    // Check if it's this player's turn
    const playerSymbol = this.getPlayerSymbol(playerId);
    if (!playerSymbol) {
      console.log(`❌ Move rejected: player ${playerId} not found in game`);
      return;
    }
    if (playerSymbol !== this.game.currentPlayer) {
      console.log(`❌ Move rejected: not player's turn (current: ${this.game.currentPlayer}, player: ${playerSymbol})`);
      return;
    }

    console.log(`✅ Move accepted: ${playerSymbol} → position ${position}`);

    // Make move
    this.game.board[position] = playerSymbol;

    // Check for winner
    const winner = this.checkWinner();
    if (winner) {
      this.game.winner = winner;
      this.game.gameStatus = 'finished';
      console.log(`🏆 Game finished! Winner: ${winner}`);
    } else if (this.game.board.every(cell => cell !== null)) {
      this.game.winner = 'tie';
      this.game.gameStatus = 'finished';
      console.log(`🤝 Game finished! It's a tie!`);
    } else {
      // Switch turns
      const nextPlayer = this.game.currentPlayer === 'X' ? 'O' : 'X';
      this.game.currentPlayer = nextPlayer;
      console.log(`🔄 Turn switched to: ${nextPlayer}`);
    }

    console.log(`📤 Broadcasting game state to ${this.connections.size} connections`);
    this.broadcastGameState();
  }

  private getPlayerSymbol(playerId: string): 'X' | 'O' | null {
    if (this.game.players.X?.id === playerId) return 'X';
    if (this.game.players.O?.id === playerId) return 'O';
    return null;
  }

  private checkWinner(): string | null {
    const board = this.game.board;
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
      [0, 4, 8], [2, 4, 6] // diagonals
    ];

    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  }

  private sendGameState(ws: WebSocket) {
    ws.send(JSON.stringify({
      type: 'gameState',
      payload: this.game
    }));
  }

  private broadcastGameState() {
    const message = JSON.stringify({
      type: 'gameState',
      payload: this.game
    });

    this.connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}

// Global game manager
const gameManager = new TicTacToeGameManager();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.resolve(ROOT_DIR, "assets");

function readWidgetHtml(componentName: string): string {
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error(
      `Widget assets not found. Expected directory ${ASSETS_DIR}. Run "pnpm run build" before starting the server.`
    );
  }

  const directPath = path.join(ASSETS_DIR, `${componentName}.html`);
  let htmlContents: string | null = null;

  if (fs.existsSync(directPath)) {
    htmlContents = fs.readFileSync(directPath, "utf8");
  } else {
    const candidates = fs
      .readdirSync(ASSETS_DIR)
      .filter(
        (file) => file.startsWith(`${componentName}-`) && file.endsWith(".html")
      )
      .sort();
    const fallback = candidates[candidates.length - 1];
    if (fallback) {
      htmlContents = fs.readFileSync(path.join(ASSETS_DIR, fallback), "utf8");
    }
  }

  if (!htmlContents) {
    throw new Error(
      `Widget HTML for "${componentName}" not found in ${ASSETS_DIR}. Run "pnpm run build" to generate the assets.`
    );
  }

  return htmlContents;
}

function widgetMeta(widget: PizzazWidget) {
  return {
    "openai/outputTemplate": widget.templateUri,
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
    "openai/widgetAccessible": true,
    "openai/resultCanProduceWidget": true,
  } as const;
}

const widgets: PizzazWidget[] = [
  {
    id: "pizza-map",
    title: "Show Pizza Map",
    templateUri: "ui://widget/pizza-map.html",
    invoking: "Hand-tossing a map",
    invoked: "Served a fresh map",
    html: readWidgetHtml("pizzaz"),
    responseText: "Rendered a pizza map!",
  },
  {
    id: "pizza-carousel",
    title: "Show Pizza Carousel",
    templateUri: "ui://widget/pizza-carousel.html",
    invoking: "Carousel some spots",
    invoked: "Served a fresh carousel",
    html: readWidgetHtml("pizzaz-carousel"),
    responseText: "Rendered a pizza carousel!",
  },
  {
    id: "pizza-albums",
    title: "Show Pizza Album",
    templateUri: "ui://widget/pizza-albums.html",
    invoking: "Hand-tossing an album",
    invoked: "Served a fresh album",
    html: readWidgetHtml("pizzaz-albums"),
    responseText: "Rendered a pizza album!",
  },
  {
    id: "pizza-list",
    title: "Show Pizza List",
    templateUri: "ui://widget/pizza-list.html",
    invoking: "Hand-tossing a list",
    invoked: "Served a fresh list",
    html: readWidgetHtml("pizzaz-list"),
    responseText: "Rendered a pizza list!",
  },
  {
    id: "pong-game",
    title: "Play a fully interactive Pong game with keyboard controls directly in the chat",
    templateUri: "ui://widget/pong-game.html",
    invoking: "Starting up the game",
    invoked: "Game ready to play",
    html: readWidgetHtml("pong"),
    responseText: "Here's your interactive Pong game! Use W and S keys to control your paddle and play against the AI.",
  },
  {
    id: "hello-world",
    title: "Show a simple hello world widget",
    templateUri: "ui://widget/hello-world.html",
    invoking: "Creating hello world",
    invoked: "Hello world ready",
    html: readWidgetHtml("hello-world"),
    responseText: "Here's your custom Hello World widget! This proves your app is working.",
  },
  {
    id: "simple-interactive",
    title: "Test interactive JavaScript widget",
    templateUri: "ui://widget/simple-interactive.html",
    invoking: "Loading interactive widget",
    invoked: "Interactive widget ready",
    html: readWidgetHtml("simple-interactive"),
    responseText: "Here's an interactive counter widget with buttons and keyboard support - proving JavaScript works!",
  },
  {
    id: "pong-mouse",
    title: "Play mouse-controlled Pong game",
    templateUri: "ui://widget/pong-mouse.html",
    invoking: "Setting up Pong arena",
    invoked: "Game ready to play",
    html: readWidgetHtml("pong-mouse"),
    responseText: "🏓 Ready to play Pong! Move your mouse up and down to control your paddle. Click Start Game to begin!",
  },
  {
    id: "multiplayer-tictactoe",
    title: "Play multiplayer Tic-Tac-Toe",
    templateUri: "ui://widget/multiplayer-tictactoe.html",
    invoking: "Connecting to multiplayer game",
    invoked: "Ready for multiplayer",
    html: readWidgetHtml("multiplayer-tictactoe"),
    responseText: "🎮 Multiplayer Tic-Tac-Toe ready! You'll be the ChatGPT player. Waiting for a local player to join...",
  },
  {
    id: "movement-commander",
    title: "Movement Commander - Real-time strategy game",
    templateUri: "ui://widget/movement-commander.html",
    invoking: "Opening movement commander game...",
    invoked: "Movement commander game ready!",
    html: readWidgetHtml("movement-commander"),
    responseText: "⚔️ Welcome to Movement Commander! Control your pieces by saying things like 'Move piece 1 right 2 spaces'. The board shows everything automatically.",
  },
];

const widgetsById = new Map<string, PizzazWidget>();
const widgetsByUri = new Map<string, PizzazWidget>();

widgets.forEach((widget) => {
  widgetsById.set(widget.id, widget);
  widgetsByUri.set(widget.templateUri, widget);
});

const toolInputSchema = {
  type: "object",
  properties: {
    pizzaTopping: {
      type: "string",
      description: "Topping to mention when rendering the widget.",
    },
  },
  required: ["pizzaTopping"],
  additionalProperties: false,
} as const;

const toolInputParser = z.object({
  pizzaTopping: z.string(),
});

const pongInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const pongInputParser = z.object({});

const tools: Tool[] = [
  ...widgets.map((widget) => ({
    name: widget.id,
    description: widget.title,
    inputSchema: (widget.id === "pong-game" || widget.id === "hello-world" || widget.id === "simple-interactive" || widget.id === "pong-mouse" || widget.id === "multiplayer-tictactoe" || widget.id === "movement-commander") ? pongInputSchema : toolInputSchema,
    title: widget.title,
    _meta: widgetMeta(widget),
    // To disable the approval prompt for the widgets
    annotations: {
      destructiveHint: false,
      openWorldHint: false,
      readOnlyHint: true,
    },
  })),
  // Movement Commander tools
  {
    name: "move_piece",
    description: "Move a piece in a specific direction. Can queue moves for future rounds or execute immediately.",
    inputSchema: {
      type: "object",
      properties: {
        pieceId: { type: "number", description: "Piece ID (1, 2, or 3)" },
        direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Direction to move" },
        distance: { type: "number", description: "Number of spaces to move" },
        targetRound: { type: "number", description: "Optional: specific round to execute the move (defaults to current round)" }
      },
      required: ["pieceId", "direction", "distance"]
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    },
  },
];

const resources: Resource[] = widgets.map((widget) => ({
  uri: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: "text/html+skybridge",
  _meta: widgetMeta(widget),
}));

const resourceTemplates: ResourceTemplate[] = widgets.map((widget) => ({
  uriTemplate: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: "text/html+skybridge",
  _meta: widgetMeta(widget),
}));

function createPizzazServer(): Server {
  const server = new Server(
    {
      name: "pizzaz-node",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (_request: ListResourcesRequest) => ({
      resources,
    })
  );

  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest) => {
      const widget = widgetsByUri.get(request.params.uri);

      if (!widget) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }

      return {
        contents: [
          {
            uri: widget.templateUri,
            mimeType: "text/html+skybridge",
            text: widget.html,
            _meta: widgetMeta(widget),
          },
        ],
      };
    }
  );

  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_request: ListResourceTemplatesRequest) => ({
      resourceTemplates,
    })
  );

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest) => {
      console.log("🔧 ChatGPT asked for available tools");
      console.log("📋 Returning tools:", tools.map(t => t.name));
      return { tools };
    }
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      console.log("🎯 ChatGPT called tool:", request.params.name);
      console.log("📦 With arguments:", request.params.arguments);

      const { name, arguments: args } = request.params;

      // Handle movement tools
      if (name === "move_piece") {
        const { pieceId, direction, distance, targetRound } = args as {
          pieceId: number;
          direction: string;
          distance: number;
          targetRound?: number;
        };

        // Get current round from game state or default to 1
        const currentRound = movementGameState?.round || 1;
        const round = targetRound || currentRound;

        // Send move command to game server - add playerType so server can route to correct player
        const moveMessage = {
          type: 'move',
          payload: { pieceId, direction, distance, round, playerType: 'chatgpt' }
        };

        await sendToMovementGame(moveMessage);

        return {
          content: [
            {
              type: "text",
              text: `⚔️ Movement command sent: Piece ${pieceId} move ${direction} ${distance} spaces in round ${round}`,
            },
          ],
        };
      }


      // Handle widget tools
      const widget = widgetsById.get(name);

      if (!widget) {
        console.log("❌ Unknown tool requested:", name);
        throw new Error(`Unknown tool: ${name}`);
      }

      console.log("✅ Returning widget:", widget.title);

      // Simple widgets don't need pizza topping
      if (widget.id === "pong-game" || widget.id === "hello-world" || widget.id === "simple-interactive" || widget.id === "pong-mouse" || widget.id === "multiplayer-tictactoe" || widget.id === "movement-commander") {
        pongInputParser.parse(request.params.arguments ?? {});
        return {
          content: [
            {
              type: "text",
              text: widget.responseText,
            },
          ],
          structuredContent: {},
          _meta: widgetMeta(widget),
        };
      }

      // Pizza widgets need pizza topping
      const widgetArgs = toolInputParser.parse(request.params.arguments ?? {});
      return {
        content: [
          {
            type: "text",
            text: widget.responseText,
          },
        ],
        structuredContent: {
          pizzaTopping: widgetArgs.pizzaTopping,
        },
        _meta: widgetMeta(widget),
      };
    }
  );

  return server;
}

type SessionRecord = {
  server: Server;
  transport: SSEServerTransport;
};

const sessions = new Map<string, SessionRecord>();

const ssePath = "/mcp";
const postPath = "/mcp/messages";

async function handleSseRequest(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const server = createPizzazServer();
  const transport = new SSEServerTransport(postPath, res);
  const sessionId = transport.sessionId;

  sessions.set(sessionId, { server, transport });

  transport.onclose = async () => {
    sessions.delete(sessionId);
    await server.close();
  };

  transport.onerror = (error) => {
    console.error("SSE transport error", error);
  };

  try {
    await server.connect(transport);
  } catch (error) {
    sessions.delete(sessionId);
    console.error("Failed to start SSE session", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to establish SSE connection");
    }
  }
}

async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    res.writeHead(400).end("Missing sessionId query parameter");
    return;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    res.writeHead(404).end("Unknown session");
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Failed to process message", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to process message");
    }
  }
}

const portEnv = Number(process.env.PORT ?? 8000);
const port = Number.isFinite(portEnv) ? portEnv : 8000;

const httpServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (
      req.method === "OPTIONS" &&
      (url.pathname === ssePath || url.pathname === postPath)
    ) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === ssePath) {
      await handleSseRequest(res);
      return;
    }

    if (req.method === "POST" && url.pathname === postPath) {
      await handlePostMessage(req, res, url);
      return;
    }

    // Serve static assets
    if (req.method === "GET" && url.pathname.match(/\.(js|css|html)$/)) {
      const assetPath = path.join(ROOT_DIR, "assets", path.basename(url.pathname));
      console.log(`📁 Static file request: ${url.pathname}`);
      console.log(`📂 Looking for file at: ${assetPath}`);
      console.log(`📋 File exists: ${fs.existsSync(assetPath)}`);
      if (fs.existsSync(assetPath)) {
        const contentType = url.pathname.endsWith(".js") ? "application/javascript" :
                           url.pathname.endsWith(".css") ? "text/css" : "text/html";
        res.writeHead(200, {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
        });
        fs.createReadStream(assetPath).pipe(res);
        return;
      }
    }

    res.writeHead(404).end("Not Found");
  }
);

httpServer.on("clientError", (err: Error, socket) => {
  console.error("HTTP client error", err);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

// WebSocket server for multiplayer games
const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws'
});

wss.on('connection', (ws, req) => {
  console.log('🎮 New WebSocket connection for multiplayer game');

  gameManager.addConnection(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 WebSocket message:', message.type);
      gameManager.handleMessage(ws, message);
    } catch (error) {
      console.error('❌ Invalid WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');
  });

  ws.on('error', (error) => {
    console.error('🚨 WebSocket error:', error);
  });
});

httpServer.listen(port, () => {
  console.log(`Pizzaz MCP server listening on http://localhost:${port}`);
  console.log(`  SSE stream: GET http://localhost:${port}${ssePath}`);
  console.log(
    `  Message post endpoint: POST http://localhost:${port}${postPath}?sessionId=...`
  );
  console.log(`  🎮 WebSocket server: ws://localhost:${port}/ws`);
});
