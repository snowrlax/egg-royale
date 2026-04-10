import express from "express";
import { createServer } from "node:http";
import { Server as SocketIOServer, } from "socket.io";
function createDefaultLogger() {
    return {
        info: (msg) => console.info(`[server] ${msg}`),
        error: (msg, err) => console.error(`[server] ${msg}`, err ?? ""),
    };
}
export function createTickLoop(options = {}) {
    const logger = options.logger ?? createDefaultLogger();
    const tickRate = options.tickRate ?? 30;
    const tickIntervalMs = Math.max(1, Math.round(1000 / tickRate));
    const runtimes = new Map();
    let timer = null;
    let tickCount = 0;
    function tickOnce() {
        tickCount += 1;
        for (const runtime of runtimes.values()) {
            try {
                runtime.step();
            }
            catch (error) {
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
            if (timer)
                return;
            timer = setInterval(tickOnce, tickIntervalMs);
        },
        stop() {
            if (!timer)
                return;
            clearInterval(timer);
            timer = null;
        },
        isRunning: () => timer !== null,
        getTickCount: () => tickCount,
        getTickRate: () => tickRate,
        getRegisteredRoomCount: () => runtimes.size,
    };
}
export function createServerFoundation(options = {}) {
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
            await new Promise((resolve, reject) => {
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
            await new Promise((resolve) => io.close(() => resolve()));
            if (httpServer.listening) {
                await new Promise((resolve, reject) => httpServer.close((err) => (err ? reject(err) : resolve())));
            }
        },
    };
}
