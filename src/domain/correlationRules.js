const DEFAULT_THRESHOLDS = { temperature: 60, smoke: 3, co2: 1000 };
function latestByType(readings) {
  const map = {};
  for (const r of readings) {
    if (!map[r.sensor_type] || r.ts > map[r.sensor_type].ts)
      map[r.sensor_type] = r;
  }
  return map;
}
function isConflicting(readings) {
  const latest = latestByType(readings);
  const t = latest.temperature?.value;
  const s = latest.smoke?.value;
  if (typeof t === "number" && typeof s === "number") {
    if (
      t > DEFAULT_THRESHOLDS.temperature &&
      s < DEFAULT_THRESHOLDS.smoke * 0.2
    )
      return true;
  }
  return false;
}
function calculateStatsByType(windowReadings) {
  const byType = new Map();
  for (const r of windowReadings) {
    if (typeof r.value !== "number") continue;
    if (!byType.has(r.sensor_type)) byType.set(r.sensor_type, []);
    byType.get(r.sensor_type).push({ value: r.value, ts: r.ts });
  }
  const stats = {};
  for (const [type, arr] of byType.entries()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.ts - b.ts);
    const values = arr.map((x) => x.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (values.length - 1);
    const stdDev = Math.sqrt(variance);
    const latest = values[values.length - 1];
    const first = values[0];
    const durSec = Math.max(0.001, (arr[arr.length - 1].ts - arr[0].ts) / 1000);
    const base = Math.abs(first) < 1e-6 ? 1e-6 : first;
    const changeRate = (latest - first) / base / durSec; // ~%/s
    stats[type] = {
      avg,
      stdDev,
      zScoreLatest: stdDev === 0 ? 0 : (latest - avg) / stdDev,
      changeRate,
    };
  }
  return stats;
}
function getExceededReadings(windowReadings, thresholds, statsByType) {
  const seen = new Set();
  const exceeds = [];
  for (const r of windowReadings) {
    const key = `${r.sensor_id}|${r.sensor_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const th = thresholds[r.sensor_type];
    if (th == null) continue;
    const st = statsByType[r.sensor_type];
    const byValue = r.value > th;
    const byZ = st && st.zScoreLatest > 3;
    const byRate = st && st.changeRate > 0.5;
    if (byValue || byZ || byRate) {
      exceeds.push({
        ...r,
        threshold: th,
        stats: st || null,
        reason: [byValue && "value", byZ && "zscore", byRate && "rate"].filter(
          Boolean
        ),
      });
    }
  }
  return exceeds;
}
module.exports = { isConflicting, calculateStatsByType, getExceededReadings };
