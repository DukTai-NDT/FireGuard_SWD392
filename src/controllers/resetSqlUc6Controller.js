const { sequelize } = require("../models");

/**
 * POST /api/dev/reset-sql-uc6
 * Dành cho DEV TEST: reset dữ liệu để test UC-06 (fire event suspected + readings)
 */
exports.resetSqlUc6 = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const eventId = "77777777-aaaa-bbbb-cccc-222222222222";
    const zoneId = "9e911b80-5a44-4f14-8d1c-5a7bc762737c";
    const sensorTemp = "f58ac9bc-d8d9-420a-8297-15ffda1e5941";
    const sensorCo2 = "b8247580-1c47-46ce-b6a6-5592267efd4b";

    // 🔹 Xóa event cũ nếu có
    await sequelize.query(
      `DELETE FROM firecore.fire_events WHERE id = :id`,
      { replacements: { id: eventId }, transaction: t }
    );

    // 🔹 Tạo event mới ở trạng thái suspected
    await sequelize.query(
      `INSERT INTO firecore.fire_events
      (id, zone_id, state, suspected_at, severity, correlation, created_at, updated_at)
      VALUES (:id, :zone, 'suspected', NOW(), 2, '{}'::jsonb, NOW(), NOW())`,
      { replacements: { id: eventId, zone: zoneId }, transaction: t }
    );

    // 🔹 Thêm readings vượt ngưỡng (2 sensor)
    await sequelize.query(
      `INSERT INTO firecore.sensor_readings
        (sensor_id, reading_ts, temp_c, co2_ppm, quality_score, payload, created_at)
      VALUES
        (:s1, NOW(), 75.0, NULL, 100, '{}'::jsonb, NOW()),
        (:s2, NOW(), NULL, 1350.0, 100, '{}'::jsonb, NOW())`,
      { replacements: { s1: sensorTemp, s2: sensorCo2 }, transaction: t }
    );

    await t.commit();

    return res.json({
      ok: true,
      status: "reset_done",
      message: "Đã reset dữ liệu UC-06 thành công (fire_events + readings).",
      fire_event_id: eventId,
      zone_id: zoneId,
    });
  } catch (err) {
    console.error("resetSqlUc6 error:", err);
    await t.rollback();
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
};
