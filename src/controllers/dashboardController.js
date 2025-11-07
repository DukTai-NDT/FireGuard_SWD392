// src/controllers/dashboardController.js
const sequelize = require("../../config/dbConfig");
const { QueryTypes } = require("sequelize");

// helper query SELECT
async function runSelect(sql, bind = []) {
  return sequelize.query(sql, { bind, type: QueryTypes.SELECT });
}

// GET /api/dashboard/overview
async function getOverview(req, res) {
  try {
    const [zoneHealth, activeEvents, activeAlarms, latestReadings] =
      await Promise.all([
        // Zone health + trạng thái suy luận từ latest readings (normal/warn/alarm)
        runSelect(`
          WITH L AS (
            SELECT sr.sensor_id, sr.reading_ts, sr.smoke_ppm, sr.temp_c, sr.co2_ppm
            FROM firecore.v_latest_sensor_readings sr
          ),
          T AS (
            SELECT s.zone_id, s.id AS sensor_id, l.reading_ts,
                   l.smoke_ppm, l.temp_c, l.co2_ppm,
                   COALESCE((s.thresholds->>'smoke_ppm')::numeric, 70)   AS th_smoke,
                   COALESCE((s.thresholds->>'temp_c')::numeric, 60)      AS th_temp,
                   COALESCE((s.thresholds->>'co2_ppm')::numeric, 1200)   AS th_co2
            FROM firecore.sensors s
            LEFT JOIN L l ON l.sensor_id = s.id
            WHERE s.is_active = true
          ),
          M AS (
            SELECT zone_id,
                   COUNT(*) FILTER (
                     WHERE (smoke_ppm >= th_smoke) OR (temp_c >= th_temp) OR (co2_ppm >= th_co2)
                   ) AS alarm_sensors,
                   COUNT(*) FILTER (
                     WHERE ((smoke_ppm >= 0.7*th_smoke AND smoke_ppm < th_smoke)
                         OR (temp_c   >= 0.85*th_temp   AND temp_c   < th_temp)
                         OR (co2_ppm  >= 0.8*th_co2     AND co2_ppm  < th_co2))
                   ) AS warning_sensors,
                   MAX(reading_ts) AS last_reading_ts
            FROM T
            GROUP BY zone_id
          ),
          S AS (
            SELECT zone_id,
                   COUNT(*) FILTER (WHERE is_active)    AS active_sensors,
                   COUNT(*) FILTER (WHERE NOT is_active) AS inactive_sensors,
                   MAX(last_seen_at)                     AS last_seen_any
            FROM firecore.sensors
            GROUP BY zone_id
          ),
          A AS (
            SELECT zone_id, COUNT(*) AS active_alarms
            FROM firecore.alarm_triggers
            WHERE status = 'active'
            GROUP BY zone_id
          )
          SELECT z.id AS zone_id, z.name AS zone_name, z.floor,
                 COALESCE(S.active_sensors, 0)  AS active_sensors,
                 COALESCE(S.inactive_sensors, 0) AS inactive_sensors,
                 S.last_seen_any,
                 COALESCE(A.active_alarms, 0)   AS active_alarms,
                 COALESCE(M.alarm_sensors, 0)   AS alarm_sensors,
                 COALESCE(M.warning_sensors, 0) AS warning_sensors,
                 M.last_reading_ts,
                 CASE
                   WHEN COALESCE(M.alarm_sensors,0)   > 0 THEN 'Alarm'
                   WHEN COALESCE(M.warning_sensors,0) > 0 THEN 'Warning'
                   ELSE 'Normal'
                 END AS derived_state
          FROM firecore.zones z
          LEFT JOIN S ON S.zone_id = z.id
          LEFT JOIN A ON A.zone_id = z.id
          LEFT JOIN M ON M.zone_id = z.id
          ORDER BY z.floor, z.name
        `),
        runSelect(
          `SELECT * FROM firecore.v_active_events ORDER BY suspected_at DESC`
        ),
        runSelect(
          `SELECT * FROM firecore.v_active_alarms ORDER BY triggered_at DESC`
        ),
        runSelect(`
          SELECT s.id AS sensor_id, s.serial_number, s.type, s.zone_id,
                 sr.reading_ts, sr.smoke_ppm, sr.temp_c, sr.co2_ppm
          FROM firecore.v_latest_sensor_readings sr
          JOIN firecore.sensors s ON s.id = sr.sensor_id
          ORDER BY sr.reading_ts DESC
          LIMIT 500
        `),
      ]);

    res.json({ zoneHealth, activeEvents, activeAlarms, latestReadings });
  } catch (err) {
    console.error("dashboard.getOverview", err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/dashboard/stream  (SSE)
async function stream(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  //fire-event, sensor, sensor-reading (tài-báo cháy)
  async function send() {
    try {
      const rows = await runSelect(`
        SELECT json_build_object(
          'ts', now(),
          'active_events',  (SELECT coalesce(json_agg(e), '[]') FROM firecore.v_active_events e),
          'active_alarms',  (SELECT coalesce(json_agg(a), '[]') FROM firecore.v_active_alarms a),
          'latest_readings',(SELECT coalesce(json_agg(x), '[]') FROM (
               SELECT s.id AS sensor_id, s.serial_number, s.type, s.zone_id,
                      sr.reading_ts, sr.smoke_ppm, sr.temp_c, sr.co2_ppm
               FROM firecore.v_latest_sensor_readings sr
               JOIN firecore.sensors s ON s.id = sr.sensor_id
               ORDER BY sr.reading_ts DESC
               LIMIT 300
          ) x)
        ) AS data;
      `);
      res.write(`data: ${JSON.stringify(rows[0].data)}\n\n`);
    } catch (e) {
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`
      );
    }
  }

  await send();
  const timer = setInterval(send, 2000);
  req.on("close", () => clearInterval(timer));
}

module.exports = { getOverview, stream };
