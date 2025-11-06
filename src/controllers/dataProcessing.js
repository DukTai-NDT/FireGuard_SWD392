// src/controllers/dataProcessing.js
const {
  Sensor,
  DetectionPolicy,
  SensorReading,
  SystemLog,
} = require("../models");
const { Op } = require("sequelize");

// (Tùy chọn) mô phỏng smoothing filter
const smoothValue = (current, previous) => {
  if (previous == null) return current;
  return (current * 0.7 + previous * 0.3);
};

exports.analyzeData = async (req, res, next) => {
  try {
    const { serial_number, smoke_ppm, temp_c, co2_ppm, payload } = req.body;

    if (!serial_number)
      return res.status(400).json({ error: "serial_number is required" });

    // 1️⃣ Tìm sensor
    const sensor = await Sensor.findOne({ where: { serial_number } });
    if (!sensor) throw new Error(`Sensor with serial_number ${serial_number} not found`);

    // 2️⃣ Kiểm tra dữ liệu thiếu (A4.1)
    if (smoke_ppm == null || temp_c == null || co2_ppm == null) {
      await SystemLog.create({
        level: "warn",
        message: "Data Integrity Warning: Incomplete sensor packet",
        ctx: req.body,
        sensor_id: sensor.id,
      });
    }

    // 3️⃣ Lấy bản đọc trước để smoothing (A4.2)
    const prevReading = await SensorReading.findOne({
      where: { sensor_id: sensor.id },
      order: [["reading_ts", "DESC"]],
    });

    const smoothSmoke = smoothValue(smoke_ppm, prevReading?.smoke_ppm);
    const smoothTemp = smoothValue(temp_c, prevReading?.temp_c);
    const smoothCO2 = smoothValue(co2_ppm, prevReading?.co2_ppm);

    // 4️⃣ Lưu bản đọc đã xử lý
    const reading = await SensorReading.create({
      sensor_id: sensor.id,
      reading_ts: new Date(),
      smoke_ppm: smoothSmoke,
      temp_c: smoothTemp,
      co2_ppm: smoothCO2,
      payload: payload || {},
    });

    // 5️⃣ Lấy policy (global → sensor-specific)
    const policy =
      (await DetectionPolicy.findOne({ where: { scope: "global" } })) ||
      (await DetectionPolicy.findOne({
        where: { scope: "sensor", sensor_id: sensor.id },
      }));

    if (!policy) {
      // E4.2 – thiếu threshold profile
      await SystemLog.create({
        level: "error",
        message: "Unverifiable: Missing threshold policy configuration",
        ctx: { serial_number },
        sensor_id: sensor.id,
      });
      return res.json({ status: "unverifiable" });
    }

    const rules = {
      ...(policy?.rules || {}),
      ...(sensor.thresholds || {}),
    };

    // 6️⃣ Kiểm tra bất thường
    const anomaly =
      (smoothSmoke && smoothSmoke >= rules.smoke_ppm) ||
      (smoothTemp && smoothTemp >= rules.temp_c) ||
      (smoothCO2 && smoothCO2 >= rules.co2_ppm);

    // 7️⃣ Tag classification
    const classification = anomaly ? "Potential Risk" : "Normal";

    // 8️⃣ Ghi log hệ thống
    await SystemLog.create({
      level: anomaly ? "warn" : "info",
      message: anomaly
        ? "Anomaly detected in sensor reading"
        : "Normal sensor reading",
      ctx: {
        serial_number,
        smoke_ppm: smoothSmoke,
        temp_c: smoothTemp,
        co2_ppm: smoothCO2,
        classification,
      },
      sensor_id: sensor.id,
    });

    // 9️⃣ Cập nhật last_seen_at
    await sensor.update({ last_seen_at: new Date() });

    // 🔟 Nếu có bất thường → forward sang UC-06 Detect Fire (mock)
    if (anomaly) {
      // Ở production có thể gọi service hoặc emit event:
      // detectFireQueue.enqueue({ sensor_id: sensor.id, reading_id: reading.id });
      console.log(
        `[FORWARD] Potential Risk packet from ${serial_number} forwarded to UC-06 Detect Fire`
      );
    }

    // ✅ Kết quả
    res.json({
      status: "ok",
      classification,
      anomaly,
      thresholds: rules,
      smoothed: { smoke_ppm: smoothSmoke, temp_c: smoothTemp, co2_ppm: smoothCO2 },
    });
  } catch (err) {
    console.error("AnalyzeData error:", err);

    // E4.1 – Stream Retrieval / DB error
    await SystemLog.create({
      level: "error",
      message: "Processing Pipeline Error during analyzeData",
      ctx: { error: err.message },
    });

    next(err);
  }
};
