// src/controllers/fireEventController.js
const {
  FireEvent,
  DetectionPolicy,
  Sensor,
  SensorReading,
  SystemLog,
} = require("../models");
const { Op } = require("sequelize");
const { v4: uuidv4 } = require("uuid");
const { sequelize } = require("../models");
// const redis = require("../services/redisClient");

// UC-06: Confirm suspected fire event
exports.confirmFireEvent = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    // 1️⃣ Tìm event ở trạng thái "suspected"
    const event = await FireEvent.findOne({
      where: { id, state: "suspected" },
      transaction: t,
    });

    if (!event) {
      await SystemLog.create({
        level: "warn",
        message: "Cannot confirm event: not found or already confirmed",
        ctx: { eventId: id },
      });
      if (!t.finished) await t.rollback(); // ✅ tránh rollback khi transaction đã commit
      return res.status(409).json({ error: "cannot_confirm" });
    }

    // 2️⃣ Lấy detection policy
    const policy =
      (await DetectionPolicy.findOne({
        where: { zone_id: event.zone_id },
        transaction: t,
      })) ||
      (await DetectionPolicy.findOne({
        where: { scope: "global" },
        transaction: t,
      }));

    const confirm_window_ms = policy?.rules?.confirm_window_ms || 20000;
    const confirm_min_sensors = policy?.rules?.confirm_min_sensors || 2;
    const require_distinct_types =
      policy?.rules?.require_distinct_types ?? false;

    // 3️⃣ Lấy readings trong khung thời gian xác nhận
    const windowStart = new Date(Date.now() - confirm_window_ms);
    const readings = await SensorReading.findAll({
      where: { reading_ts: { [Op.gte]: windowStart } },
      include: [
        {
          model: Sensor,
          where: { zone_id: event.zone_id },
        },
      ],
      transaction: t,
    });

    if (!readings.length) {
      await SystemLog.create({
        level: "warn",
        message: "Insufficient evidence: no readings in window",
        ctx: { event_id: id, zone_id: event.zone_id },
      });
      if (!t.finished) await t.rollback();
      return res.status(409).json({ error: "insufficient_evidence" });
    }

    // 4️⃣ Kiểm tra cảm biến vượt ngưỡng
    const exceeded = [];
    for (const r of readings) {
      const limit = {
        ...policy?.rules,
        ...(r.Sensor.thresholds || {}),
      };

      const abnormal =
        (r.smoke_ppm && r.smoke_ppm >= limit.smoke_ppm) ||
        (r.temp_c && r.temp_c >= limit.temp_c) ||
        (r.co2_ppm && r.co2_ppm >= limit.co2_ppm);

      if (abnormal) {
        exceeded.push({
          sensor_type: r.Sensor.type,
          serial_number: r.Sensor.serial_number,
          smoke_ppm: r.smoke_ppm,
          temp_c: r.temp_c,
          co2_ppm: r.co2_ppm,
        });
      }
    }

    const types = new Set(exceeded.map((x) => x.sensor_type));
    const enough = require_distinct_types
      ? types.size >= 2
      : exceeded.length >= confirm_min_sensors;

    if (!enough) {
      await SystemLog.create({
        level: "warn",
        message: "Not enough distinct abnormal sensors to confirm",
        ctx: { event_id: id, zone_id: event.zone_id },
      });
      if (!t.finished) await t.rollback();
      return res.status(409).json({ error: "insufficient_evidence" });
    }

    // 5️⃣ Cập nhật event sang "confirmed"
    const now = new Date();
    await FireEvent.update(
      {
        state: "confirmed",
        confirmed_at: now,
        correlation: { evidence: exceeded },
        updated_at: now,
      },
      { where: { id, state: "suspected" }, transaction: t }
    );

    await SystemLog.create(
      {
        level: "info",
        message: "Fire event confirmed",
        ctx: {
          event_id: id,
          zone_id: event.zone_id,
          evidence_count: exceeded.length,
        },
      },
      { transaction: t }
    );

    await t.commit();

    // (Tùy chọn) Publish Redis event nếu cần
    // if (redis) {
    //   await redis.publish(
    //     "fire_events",
    //     JSON.stringify({
    //       type: "fire_event_state_changed",
    //       state: "confirmed",
    //       fireEventId: id,
    //       zone_id: event.zone_id,
    //       at: now.toISOString(),
    //     })
    //   );
    // }

    res.json({
      ok: true,
      id,
      state: "confirmed",
      confirmed_at: now,
    });
  } catch (err) {
    if (!t.finished) await t.rollback(); // ✅ chỉ rollback khi chưa commit
    console.error("ConfirmFireEvent error:", err);
    await SystemLog.create({
      level: "error",
      message: "Error confirming fire event",
      ctx: { error: err.message },
    });
    next(err);
  }
};
