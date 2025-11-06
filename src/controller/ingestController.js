// ingestController.js
const {
  Sensor,
  DetectionPolicy,
  SensorReading,
  FireEvent,
  SystemLog,
} = require("../models");
const redis = require("../../config/redisConfig");
const SequelizeRepositories = require("../services/SequelizeRepositories");
const ThresholdProvider = require("../services/ThresholdProvider");
const ZoneWindowBuffer = require("../services/ZoneWindowBuffer");
const CooldownRegistry = require("../services/CooldownRegistry");
const EventPublisher = require("../services/EventPublisher");
const CorrelationAnalyzer = require("../services/CorrelationAnalyzer");

// --- Singleton wiring (tạo 1 lần) ---
const repos = new SequelizeRepositories({
  Sensor,
  SensorReading,
  FireEvent,
  SystemLog,
});
const thresholds = new ThresholdProvider({ DetectionPolicy });
const buffer = new ZoneWindowBuffer({ windowMs: 5000 });
const cooldown = new CooldownRegistry({ cooldownMs: 30000 });
const publisher = new EventPublisher({ redis, channel: "fire_events" });
const analyzer = new CorrelationAnalyzer({
  repos,
  buffer,
  cooldown,
  thresholds,
  publisher,
  options: {
    windowMs: 5000,
    sensorTimeoutMs: 10000,
    requireDistinctTypes: true,
  },
});

// --- Handler dùng lại singleton analyzer ---
async function ingestHandler(req, res, next) {
  try {
    const payload = req.body;
    if (Array.isArray(payload)) {
      const results = [];
      for (const p of payload) results.push(await analyzer.process(p));
      return res
        .status(200)
        .json({ results, message: "Xử lý nhiều reading hoàn tất" });
    } else {
      const result = await analyzer.process(payload);
      return res
        .status(200)
        .json({ result, message: "Xử lý reading hoàn tất" });
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { ingestHandler };
