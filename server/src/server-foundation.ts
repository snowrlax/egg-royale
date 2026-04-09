import express, { type Express } from "express";
import { createServer, type Server as HttpServer } from "node:http";
import {
  Server as SocketIOServer,
  type ServerOptions as SocketIOServerOptions,
} from "socket.io";

// ── Logger ──

export type ServerLogger = {
  info(message: string): void;
  error(message: string, error?: unknown): void;
};

function createDefaultLogger(): ServerLogger {
  return {
    info: (msg) => console.info(`[server] ${msg}`),
    error: (msg, err) => console.error(`[server] ${msg}`, err ?? ""),
  };
}

// ── Tick Loop ──

export type AuthoritativeRoomRuntime = {
  roomId: string;
  step(): void;
};

export type TickLoop = {
  registerRoom(runtime: AuthoritativeRoomRuntime): void;
  unregisterRoom(roomId: string): boolean;
  start(): void;
  stop(): void;
  isRunning(): boolean;
  getTickCount(): number;
  getTickRate(): number;
  getRegisteredRoomCount(): number;
};

export type TickLoopOptions = {
  tickRate?: number;
  logger?: ServerLogger;
};

export function createTickLoop(options: TickLoopOptions = {}): TickLoop {
  const logger = options.logger ?? createDefaultLogger();
  const tickRate = options.tickRate ?? 30;
  const tickIntervalMs = Math.max(1, Math.round(1000 / tickRate));
  const runtimes = new Map<string, AuthoritativeRoomRuntime>();
  let timer: NodeJS.Timeout | null = null;
  let tickCount = 0;

  function tickOnce(): void {
    tickCount += 1;
    for (const runtime of runtimes.values()) {
      try {
        runtime.step();
      } catch (error) {
        logger.error(`tick failed for room ${runtime.roomId}`, error);
      }
    }
  }

  return {
    registerRoom(runtime) {
      runtimes.set(runtime.roomId, runtime);
    },
    unregisterRoom(roomId) {
      return runtimes.delete(roomId);
    },
    start() {
      if (timer) return;
      timer = setInterval(tickOnce, tickIntervalMs);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
    isRunning: () => timer !== null,
    getTickCount: () => tickCount,
    getTickRate: () => tickRate,
    getRegisteredRoomCount: () => runtimes.size,
  };
}

// ── Server Foundation ──

export type ServerFoundationOptions = {
  port?: number;
  host?: string;
  tickRate?: number;
  logger?: ServerLogger;
  socketServerOptions?: Partial<SocketIOServerOptions>;
};

export type ServerFoundation = {
  app: Express;
  httpServer: HttpServer;
  io: SocketIOServer;
  tickLoop: TickLoop;
  start(): Promise<{ host: string; port: number }>;
  stop(): Promise<void>;
};

export function createServerFoundation(
  options: ServerFoundationOptions = {}
): ServerFoundation {
  const host = options.host ?? "0.0.0.0";
  const port = options.port ?? 3001;
  const logger = options.logger ?? createDefaultLogger();
  const tickLoop = createTickLoop({
    tickRate: options.tickRate,
    logger,
  });

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      tickRate: tickLoop.getTickRate(),
      activeRooms: tickLoop.getRegisteredRoomCount(),
    });
  });

  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true },
    ...options.socketServerOptions,
  });

  return {
    app,
    httpServer,
    io,
    tickLoop,

    async start() {
      if (httpServer.listening) {
        const addr = httpServer.address();
        if (addr && typeof addr !== "string") {
          return { host: addr.address, port: addr.port };
        }
        return { host, port };
      }

      await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen({ host, port }, () => {
          httpServer.off("error", reject);
          resolve();
        });
      });

      tickLoop.start();
      const addr = httpServer.address();
      if (addr && typeof addr !== "string") {
        return { host: addr.address, port: addr.port };
      }
      return { host, port };
    },

    async stop() {
      tickLoop.stop();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) =>
          httpServer.close((err) => (err ? reject(err) : resolve()))
        );
      }
    },
  };
}
