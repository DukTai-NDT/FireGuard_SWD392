// src/controllers/fireDetection.js
const {
  Zone,
  Sensor,
  DetectionPolicy,
  SensorReading,
  FireEvent,
  AlarmTrigger,
  SystemLog,
} = require("../models");
const { Op } = require("sequelize");
const { v4: uuidv4 } = require("uuid");

exports.detectFire = async (req, res, next) => {
  try {
    const { zone_id } = req.body;
    if (!zone_id)
      return res.status(400).json({ error: "zone_id is required" });

    // 1️ Lấy sensors đang hoạt động trong zone
    const sensors = await Sensor.findAll({
      where: { zone_id, is_active: true },
    });
    if (sensors.length === 0)
      return res.status(404).json({ error: "No active sensors in zone" });

    // 2️ Lấy rule global (hoặc dùng mặc định)
    const policy = await DetectionPolicy.findOne({ where: { scope: "global" } });
    const rule = policy?.rules || {
      smoke_ppm: 70,
      temp_c: 60,
      co2_ppm: 1200,
      need_concurrence: 2,
    };

    // 3️ Lấy reading mới nhất cho từng sensor
    const readings = [];
    for (const s of sensors) {
      const latest = await SensorReading.findOne({
        where: { sensor_id: s.id },
        order: [["reading_ts", "DESC"]],
      });
      if (latest) readings.push({ sensor: s, reading: latest });
    }

    if (readings.length === 0)
      return res.status(404).json({ error: "No sensor readings found in this zone" });

    // 4️ Phát hiện bất thường
    let abnormalCount = 0;
    const evidence = {};

    for (const { sensor, reading } of readings) {
      const limit = { ...rule, ...(sensor.thresholds || {}) };
      const abnormal =
        (reading.smoke_ppm && reading.smoke_ppm >= limit.smoke_ppm) ||
        (reading.temp_c && reading.temp_c >= limit.temp_c) ||
        (reading.co2_ppm && reading.co2_ppm >= limit.co2_ppm);

      if (abnormal) {
        abnormalCount++;
        evidence[sensor.serial_number] = {
          smoke_ppm: reading.smoke_ppm,
          temp_c: reading.temp_c,
          co2_ppm: reading.co2_ppm,
        };
      }
    }

    // 5️ Quyết định trạng thái
    let state = "cleared";
    if (abnormalCount >= rule.need_concurrence) state = "confirmed";
    else if (abnormalCount > 0) state = "suspected";

   // 6️ Tạo event mới (đảm bảo đầy đủ các cột thời gian)
const now = new Date();

const eventData = {
  id: uuidv4(),
  zone_id,
  state,
  correlation: evidence,
  severity: Math.min(abnormalCount, 5),
  suspected_at: now,
  confirmed_at: state === "confirmed" ? now : null,
  cleared_at: state === "cleared" ? now : null,
  created_at: now,
  updated_at: now,
};

// ✅ Ép Sequelize include tất cả cột, kể cả null
const newEvent = await FireEvent.create(eventData, {
  fields: [
    "id",
    "zone_id",
    "state",
    "correlation",
    "severity",
    "suspected_at",
    "confirmed_at",
    "cleared_at",
    "created_at",
    "updated_at",
  ],
});

    // 7️⃣ Nếu confirmed → tạo alarm active
    if (state === "confirmed") {
      await AlarmTrigger.create({
        event_id: newEvent.id,
        zone_id,
        status: "active",
        triggered_at: new Date(),
        details: { source: "auto" },
        created_at: new Date(),
      });
    }

    // 8️⃣ Ghi log hệ thống
    await SystemLog.create({
      level: "info",
      message: "Fire detection run complete",
      ctx: { zone_id, state, abnormalCount },
      event_id: newEvent.id,
    });

    // 9️⃣ Phản hồi kết quả
    res.json({
      zone_id,
      fire_event_id: newEvent.id,
      state,
      abnormal_sensors: abnormalCount,
      correlation: evidence,
    });
  } catch (err) {
    console.error("DetectFire error:", err);
    next(err);
  }
};
