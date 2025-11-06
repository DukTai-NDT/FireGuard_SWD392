// server.js (fileguard - tối giản theo mẫu của bạn)
const express = require("express");
const http = require("http");
const { sequelize } = require("./src/models");
// const redis = require("./config/redisConfig");
const app = express();
const cors = require('cors');
app.use(express.json());

// Allow CORS (giữ nguyên như mẫu)
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

// Giữ nguyên đoạn “fix body” của bạn
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
    } catch { }
  }
  next();
});

// Routes (tối giản, đúng dự án fileguard)
app.use("/api/ingest", require("./src/routes/ingestRoutes"));
app.use("/api/zones", require("./src/routes/zonesRoutes"));
app.use("/api/sensors", require("./src/routes/sensorsRoutes"));
app.use("/api/events", require("./src/routes/eventsRoutes"));
app.use("/api/readings", require("./src/routes/readingsRoutes"));
app.use("/api/alarms", require("./src/routes/alarmsRoutes"));
app.use('/api/logs', require("./src/routes/logsRoutes"));
app.use('/api/timeline', require("./src/routes/timeline"));
// Error handling middleware (y như mẫu)
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

sequelize
  .authenticate()
  .then(() => {
    console.log("Connected to PostgreSQL successfully");
    console.log("📘 Connected DB:", sequelize.config.database);
    console.log("👤 User:", sequelize.config.username);
    console.log("🖥️ Host:", sequelize.config.host);
    return sequelize.sync();
  })
  // .then(async () => {
  //   try {
  //     const pong = await redis.ping();
  //     if (pong === "PONG") console.log("Redis connection: OK");
  //   } catch (e) {
  //     console.error("Redis connection: FAILED -", e.message);
  //   }
  //   return sequelize.sync();
  // })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection error:", err);
  });
  app.use(cors({
    origin: '*' // Cho phép tất cả
    // Hoặc an toàn hơn:
    // origin: 'http://localhost:3000' // Nếu bạn chạy FE trên một server khác
    // origin: 'file://' // Đôi khi không hoạt động, '*' là dễ nhất để test
}));