import cors from "cors";
import express from "express";
import http from "http";
import type { Express } from "express";
import { Server } from "socket.io";

import { registerRoomHandlers } from "./rooms";

export type ServerBundle = {
  app: Express;
  io: Server;
  httpServer: http.Server;
};

export function createServer(): ServerBundle {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*"
    }
  });

  registerRoomHandlers(io);

  return { app, io, httpServer };
}
