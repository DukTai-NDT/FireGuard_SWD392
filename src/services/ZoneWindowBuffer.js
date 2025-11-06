class ZoneWindowBuffer {
  constructor({ windowMs }) {
    this.windowMs = windowMs;
    this.buffers = new Map(); // zoneId -> [{ sensor_id, sensor_type, value, ts }
  }
  push(zoneId, item) {
    const buf = this.buffers.get(zoneId) || [];
    buf.push(item);
    this.buffers.set(zoneId, this._prune(buf));
    return this.buffers.get(zoneId);
  }
  get(zoneId) {
    return this.buffers.get(zoneId) || [];
  }
  _prune(readings) {
    if (!readings.length) return [];
    const latestTs = Math.max(...readings.map((r) => r.ts));
    return readings.filter((r) => latestTs - r.ts <= this.windowMs);
  }
}
module.exports = ZoneWindowBuffer;
