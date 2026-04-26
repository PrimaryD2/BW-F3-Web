import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import factoryRoutes from "./routes/factoryRoutes.js";
import ncrRoutes from "./routes/ncrRoutes.js";
import statisticsRoutes from "./routes/statisticsRoutes.js";
import exportRoutes from "./routes/exportRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";

export function createApp() {
  const app = express();
  const allowedOrigins = env.clientOrigin.split(",").map((origin) => origin.trim());

  app.use(cors({
    origin(origin, callback) {
      if (env.clientOrigin === "*" || !origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    }
  }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "f3-server" }));
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api", factoryRoutes);
  app.use("/api/ncrs", ncrRoutes);
  app.use("/api/statistics", statisticsRoutes);
  app.use("/api/exports", exportRoutes);
  app.use("/api/audit-logs", auditRoutes);
  app.use(errorHandler);

  return app;
}
