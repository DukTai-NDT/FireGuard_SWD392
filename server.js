// server.js (FileGuard Real-time Fire Detection)
const express = require("express");
const http = require("http");
const { sequelize } = require("./src/models");
const redis = require("./config/redisConfig");
const { analyzeData } = require("./src/controllers/dataProcessing");
const { confirmFireEvent } = require("./src/controllers/fireDetection");

// const redis = require("./config/redisConfig");
const app = express();
const cors = require("cors");

app.use(cors());
app.use(express.json());

//  CORS middleware

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

//  Fix body

app.use((req, res, next) => {
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (Buffer.isBuffer(req.body)) {
    const text = req.body.toString("utf8");
    if (ct.includes("application/json")) {
      try {
        req.body = JSON.parse(text);
      } catch {
        req.body = {};
      }
    } else {
      req.body = text;
    }
  } else if (typeof req.body === "string" && ct.includes("application/json")) {
    try {
      req.body = JSON.parse(req.body);
    } catch {}
  }
  next();
});

//  Routes (core của hệ thống FileGuard)

app.use("/api/ingest", require("./src/routes/ingestRoutes"));
app.use("/api/zones", require("./src/routes/zonesRoutes"));
app.use("/api/sensors", require("./src/routes/sensorsRoutes"));
app.use("/api/events", require("./src/routes/eventsRoutes"));
app.use("/api/readings", require("./src/routes/readingsRoutes"));
app.use("/api/alarms", require("./src/routes/alarmsRoutes"));
app.use("/api/dashboard", require("./src/routes/dashboardRoutes"));
app.use("/api/map", require("./src/routes/mapRoutes"));

//  UC04 + UC06 (Data & Fire Detection)

app.post("/api/data/analyze", analyzeData);
app.post("/api/fire/detect", confirmFireEvent);

//  Error handling

app.use((error, req, res, next) => {
  const status = error.statusCode || 500;
  res.status(status).json({
    timestamp: new Date().toISOString(),
    status,
    path: req.originalUrl,
    error: http.STATUS_CODES[status] || "Error",
    message: error.message,
    details: error.data || {},
  });
});

const PORT = process.env.PORT || 8090;

// Database & Redis bootstrap

sequelize
  .authenticate()
  .then(() => {
    console.log("✅ Connected to PostgreSQL successfully");
    return sequelize.sync();
  })
  .then(async () => {
    try {
      const pong = await redis.ping();
      if (pong === "PONG") console.log("Redis connection: OK");
    } catch (e) {
      console.error("Redis connection: FAILED -", e.message);
    }
    return sequelize.sync();
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 FileGuard server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection error:", err);
  });
