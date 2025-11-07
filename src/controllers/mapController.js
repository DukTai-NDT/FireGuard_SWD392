// src/controllers/mapController.js
const sequelize = require("../../config/dbConfig");
const { QueryTypes } = require("sequelize");

// --- helper: chạy SELECT
async function runSelect(sql, bind = []) {
  return sequelize.query(sql, { bind, type: QueryTypes.SELECT });
}

// --- helper: chuẩn hoá weight 0..1 cho heatmap
function calcWeightFromReading(row) {
  // Ưu tiên smoke -> temp -> co2; dùng ngưỡng "tạm" nếu không có threshold cụ thể
  const smoke = Number(row.smoke_ppm ?? 0);
  const temp = Number(row.temp_c ?? 0);
  const co2 = Number(row.co2_ppm ?? 0);

  const thSmoke = Number(row.th_smoke ?? 70); // fallback từ policy global của bạn
  const thTemp = Number(row.th_temp ?? 60);
  const thCO2 = Number(row.th_co2 ?? 1200);

  let v = 0,
    th = 1;

  if (!isNaN(smoke) && smoke > 0) {
    v = smoke;
    th = thSmoke;
  } else if (!isNaN(temp) && temp > 0) {
    v = temp;
    th = thTemp;
  } else if (!isNaN(co2) && co2 > 0) {
    v = co2;
    th = thCO2;
  }

  const w = Math.max(0, Math.min(1, v / (th || 1)));
  return Number(w.toFixed(3));
}

// ========== API ==========

// GET /api/map/sensors
// Trả list sensor + toạ độ map_x/map_y + latest readings + weight 0..1
async function getSensorsOnMap(req, res) {
  try {
    const rows = await runSelect(
      `
      WITH L AS (
        SELECT sr.sensor_id, sr.reading_ts, sr.smoke_ppm, sr.temp_c, sr.co2_ppm
        FROM firecore.v_latest_sensor_readings sr
      )
      SELECT
        s.id AS sensor_id, s.serial_number, s.type, s.zone_id,
        z.name AS zone_name, z.floor, z.map_ref,
        s.map_x, s.map_y,
        coalesce(s.thresholds->>'smoke_ppm', NULL)::numeric AS th_smoke,
        coalesce(s.thresholds->>'temp_c', NULL)::numeric    AS th_temp,
        coalesce(s.thresholds->>'co2_ppm', NULL)::numeric   AS th_co2,
        l.reading_ts, l.smoke_ppm, l.temp_c, l.co2_ppm
      FROM firecore.sensors s
      JOIN firecore.zones z ON z.id = s.zone_id
      LEFT JOIN L l ON l.sensor_id = s.id
      WHERE s.is_active = true
      ORDER BY z.floor, s.serial_number
      `
    );

    // Tính weight 0..1 cho heatLayer
    const withWeight = rows.map((r) => ({
      ...r,
      weight: calcWeightFromReading(r),
    }));

    res.json(withWeight);
  } catch (err) {
    console.error("map.getSensorsOnMap", err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/map/sensor/:id
async function getSensorDetail(req, res) {
  const { id } = req.params;
  try {
    const infoArr = await runSelect(
      `SELECT s.id AS sensor_id, s.serial_number, s.type, s.zone_id,
              z.name AS zone_name, z.floor, z.map_ref, s.map_x, s.map_y,
              s.thresholds
       FROM firecore.sensors s JOIN firecore.zones z ON z.id = s.zone_id
       WHERE s.id = $1`,
      [id]
    );
    if (infoArr.length === 0)
      return res.status(404).json({ error: "Not found" });

    const history = await runSelect(
      `SELECT reading_ts, smoke_ppm, temp_c, co2_ppm, quality_score
       FROM firecore.sensor_readings
       WHERE sensor_id = $1
       ORDER BY reading_ts DESC
       LIMIT 200`,
      [id]
    );

    res.json({ info: infoArr[0], history });
  } catch (err) {
    console.error("map.getSensorDetail", err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/map/events?limit=50
async function listEvents(req, res) {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  try {
    const rows = await runSelect(
      `SELECT * FROM firecore.fire_events ORDER BY suspected_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error("map.listEvents", err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/map/floor/:zoneId/meta
// Trả meta ảnh floor để FE dùng CRS.Simple (không cần OSM)
// Nếu bạn chưa lưu width/height ảnh, tạm trả kích thước giả định.
async function getFloorMeta(req, res) {
  const { zoneId } = req.params;
  try {
    const z = await runSelect(
      `SELECT id, name, floor, map_ref FROM firecore.zones WHERE id = $1`,
      [zoneId]
    );
    if (z.length === 0)
      return res.status(404).json({ error: "Zone not found" });

    // TODO: nếu bạn có file thật, có thể đọc kích thước ảnh ở đây (hiện để cứng)
    const width = 1600;
    const height = 1000;

    res.json({
      zone_id: z[0].id,
      zone_name: z[0].name,
      floor: z[0].floor,
      imageUrl: `/public/maps/${z[0].map_ref || "map_floor1.png"}`,
      width,
      height,
      // bounds cho Leaflet CRS.Simple
      bounds: [
        [0, 0],
        [height, width],
      ],
    });
  } catch (err) {
    console.error("map.getFloorMeta", err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/map/stream  (SSE realtime cho Map View)
// Gộp latest readings + active events/alarms (nhẹ)
async function streamMapSSE(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  async function push() {
    try {
      const payload = await runSelect(
        `
        SELECT json_build_object(
          'ts', now(),
          'active_events',  (SELECT coalesce(json_agg(e), '[]') FROM firecore.v_active_events e),
          'active_alarms',  (SELECT coalesce(json_agg(a), '[]') FROM firecore.v_active_alarms a),
          'latest',         (SELECT coalesce(json_agg(x), '[]') FROM (
               SELECT s.id AS sensor_id, s.zone_id, s.map_x, s.map_y,
                      sr.reading_ts, sr.smoke_ppm, sr.temp_c, sr.co2_ppm,
                      coalesce(s.thresholds->>'smoke_ppm', NULL)::numeric AS th_smoke,
                      coalesce(s.thresholds->>'temp_c', NULL)::numeric    AS th_temp,
                      coalesce(s.thresholds->>'co2_ppm', NULL)::numeric   AS th_co2
               FROM firecore.v_latest_sensor_readings sr
               JOIN firecore.sensors s ON s.id = sr.sensor_id
               WHERE s.is_active = true
               ORDER BY sr.reading_ts DESC
               LIMIT 400
          ) x)
        ) AS data;
        `
      );
      const data = payload[0].data || {};
      // map weight ở đây cho tiện FE (nếu muốn): để FE không phải tính
      if (Array.isArray(data.latest)) {
        data.latest = data.latest.map((r) => ({
          ...r,
          weight: calcWeightFromReading(r),
        }));
      }
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`
      );
    }
  }

  await push();
  const timer = setInterval(push, 2000);
  req.on("close", () => clearInterval(timer));
}

module.exports = {
  getSensorsOnMap,
  getSensorDetail,
  listEvents,
  getFloorMeta,
  streamMapSSE,
};
