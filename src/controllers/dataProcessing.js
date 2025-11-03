// src/controllers/dataProcessing.js
const {
  Sensor,
  DetectionPolicy,
  SensorReading,
  SystemLog,
} = require("../models");
const { Op } = require("sequelize");

exports.analyzeData = async (req, res, next) => {
  try {
    const { serial_number, smoke_ppm, temp_c, co2_ppm, payload } = req.body;

    if (!serial_number)
      return res.status(400).json({ error: "serial_number is required" });

    //  1️ Tìm sensor theo serial_number
    const sensor = await Sensor.findOne({ where: { serial_number } });
    if (!sensor) throw new Error(`Sensor with serial_number ${serial_number} not found`);

    // 2️ Lưu bản ghi đọc cảm biến
    await SensorReading.create({
      sensor_id: sensor.id, 
      reading_ts: new Date(),
      smoke_ppm,
      temp_c,
      co2_ppm,
      payload: payload || {},
    });

    // 3️ Lấy policy (global hoặc riêng)
    const policy =
      (await DetectionPolicy.findOne({ where: { scope: "global" } })) ||
      (await DetectionPolicy.findOne({
        where: { scope: "sensor", sensor_id: sensor.id },
      }));

    const rules = {
      ...(policy?.rules || {}),
      ...(sensor.thresholds || {}),
    };

    // 4️ Kiểm tra bất thường
    const anomaly =
      (smoke_ppm && smoke_ppm >= rules.smoke_ppm) ||
      (temp_c && temp_c >= rules.temp_c) ||
      (co2_ppm && co2_ppm >= rules.co2_ppm);

    // 5️ Ghi log hệ thống
    await SystemLog.create({
      level: anomaly ? "warn" : "info",
      message: anomaly
        ? "Anomaly detected in sensor reading"
        : "Normal sensor reading",
      ctx: { serial_number, smoke_ppm, temp_c, co2_ppm },
      sensor_id: sensor.id,
    });

    // 6️ Cập nhật last_seen_at
    await sensor.update({ last_seen_at: new Date() });

    res.json({
      status: "ok",
      anomaly,
      thresholds: rules,
    });
  } catch (err) {
    console.error("AnalyzeData error:", err);
    next(err);
  }
};
