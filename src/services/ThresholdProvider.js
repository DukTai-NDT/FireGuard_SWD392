const DEFAULT_THRESHOLDS = { temperature: 60, smoke: 3, co2: 1000 };
class ThresholdProvider {
  constructor({ DetectionPolicy }) {
    this.DetectionPolicy = DetectionPolicy;
  }
  async getZoneThresholds(zoneId) {
    try {
      const policies = await this.DetectionPolicy.findAll({
        where: { zone_id: zoneId },
      });
      const th = { ...DEFAULT_THRESHOLDS };
      for (const p of policies)
        if (p.threshold != null) th[p.sensor_type] = p.threshold;
      return th;
    } catch {
      return { ...DEFAULT_THRESHOLDS };
    }
  }
}
module.exports = ThresholdProvider;
