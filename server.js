import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "./src/config/db.js";
import { swaggerSpec, swaggerUi } from "./src/config/swagger.js";
import { errorHandler } from "./src/middleware/errorHandler.js";
import { globalLimiter } from "./src/middleware/rateLimiter.js";
import { etagMiddleware } from "./src/middleware/etag.js";
import { sanitize } from "./src/middleware/sanitize.js";

// Route imports
import authRoutes from "./src/routes/auth.js";
import provinceRoutes from "./src/routes/provinces.js";
import districtRoutes from "./src/routes/districts.js";
import stationRoutes from "./src/routes/stations.js";
import tukTukRoutes from "./src/routes/tuktuks.js";
import locationRoutes from "./src/routes/locations.js";
import alertRoutes from "./src/routes/alerts.js";
import geofenceRoutes from "./src/routes/geofences.js";

dotenv.config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set to a random string of at least 32 characters.");
  }
  console.warn("⚠️  JWT_SECRET is missing or short – acceptable for local development only.");
}

const app = express();
// Render (and most PaaS) terminate TLS at a proxy: without this every client appears
// to share the proxy's IP, so IP rate-limiting would throttle ALL users together.
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

// ─── Connect to Database ─────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  connectDB();
}

// ─── Security & Utility Middleware ───────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    exposedHeaders: ["Link", "X-Total-Count", "X-Total-Pages", "X-Current-Page", "ETag"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-Id", "X-Device-Key", "If-None-Match"],
  })
);
app.use(morgan("combined"));
app.use(express.json({ limit: "200kb" })); // batch of 100 pings is ~20kb
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(sanitize); // strip $-operators / dotted keys (NoSQL injection)
app.use(globalLimiter);
app.use(etagMiddleware); // Conditional GET (ETag / If-None-Match)

// ─── Swagger Documentation ───────────────────────────────────────────────────
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/provinces", provinceRoutes);
app.use("/api/districts", districtRoutes);
app.use("/api/stations", stationRoutes);
app.use("/api/tuktuks", tukTukRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/geofences", geofenceRoutes);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "Tuk-Tuk Tracker API",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────────────────
let server;
if (process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, () => {
    console.log(`🚀 Tuk-Tuk Tracker API running on port ${PORT}`);
    console.log(`📚 Swagger docs: http://localhost:${PORT}/api/docs`);
    console.log(`🩺 Health check: http://localhost:${PORT}/health`);
  });

  // Graceful shutdown for Render and other PaaS platforms
  const shutdown = (signal) => {
    console.info(`${signal} received. Closing HTTP server and MongoDB connection...`);
    server.close(async (err) => {
      if (err) {
        console.error("Error closing HTTP server:", err);
        process.exit(1);
      }
      try {
        await mongoose.connection.close(false);
        console.log("MongoDB connection closed.");
        process.exit(0);
      } catch (closeErr) {
        console.error("Error closing MongoDB connection:", closeErr);
        process.exit(1);
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export default app;
