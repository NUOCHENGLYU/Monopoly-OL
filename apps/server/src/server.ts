import cors from "cors";
import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import type { Express } from "express";
import { Server } from "socket.io";

import { registerRoomHandlers } from "./rooms";

export type ServerBundle = {
  app: Express;
  io: Server;
  httpServer: http.Server;
};

export type ServerOptions = {
  rngSeed?: number;
};

export function createServer(options?: ServerOptions): ServerBundle {
  const app = express();

  const corsOriginRaw = process.env.CORS_ORIGIN;
  const corsOrigin =
    !corsOriginRaw || corsOriginRaw === "*"
      ? "*"
      : corsOriginRaw.split(",").map((value) => value.trim());

  app.use(
    cors({
      origin: corsOrigin
    })
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const staticDir = process.env.STATIC_DIR;
  if (staticDir && fs.existsSync(staticDir)) {
    const resolved = path.resolve(staticDir);
    app.use(express.static(resolved));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(resolved, "index.html"));
    });
  }

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*"
    }
  });

  registerRoomHandlers(io, { rngSeed: options?.rngSeed });

  return { app, io, httpServer };
}
