// services/CorrelationAnalyzer.js
const dayjs = require("dayjs");
const {
  isConflicting,
  calculateStatsByType,
  getExceededReadings,
} = require("../domain/correlationRules");

class CorrelationAnalyzer {
  constructor({
    repos,
    buffer,
    cooldown,
    thresholds,
    publisher,
    options = {},
  }) {
    this.repos = repos;
    this.buffer = buffer;
    this.cooldown = cooldown;
    this.thresholds = thresholds;
    this.publisher = publisher;

    this.windowMs = options.windowMs ?? 5000;
    this.sensorTimeoutMs = options.sensorTimeoutMs ?? 10000;
    this.requireDistinctTypes = options.requireDistinctTypes ?? true;
  }

  /**
   * Nhận 1 reading và thực hiện phân tích correlation theo cửa sổ của zone
   */
  async process(payload) {
    const { sensor_id, sensor_type, value } = payload;
    const ts = payload.timestamp
      ? new Date(payload.timestamp).getTime()
      : Date.now();

    let co2_ppm = null;
    let temp_c = null;
    let smoke_ppm = null;

    if (sensor_type === "co2") {
      co2_ppm = value;
    } else if (sensor_type === "temperature") {
      temp_c = value;
    } else if (sensor_type === "smoke") {
      smoke_ppm = value;
    }

    const payloadCreate = {
      status: "danger",
    };

    const reading_ts = dayjs().toISOString();
    const quality_score = 100;

    const saveReading = await this.repos.saveReading({
      sensor_id,
      reading_ts,
      smoke_ppm,
      temp_c,
      co2_ppm,
      payload: payloadCreate,
      quality_score,
      ts,
    });
    // 2) Kiểm tra sensor hợp lệ
    const sensor = await this.repos.findSensor(sensor_id);
    if (!sensor) {
      await this.repos.warn(
        `Nhận dữ liệu từ sensor chưa đăng ký: ${sensor_id}`,
        {
          sensor_id,
          sensor_type,
          value,
        }
      );
      return { status: "ignored", reason: "unknown_sensor" };
    }

    const zoneId = sensor.zone_id;

    // 3) Cập nhật buffer theo zone
    const window = this.buffer.push(zoneId, {
      sensor_id,
      sensor_type,
      value,
      ts,
    });

    // 4) Cảnh báo timeout trong cửa sổ (opportunistic)
    const now = Date.now();
    const timeoutSensors = new Set();
    const activeTypes = new Set();

    for (const r of window) {
      if (now - r.ts > this.sensorTimeoutMs) timeoutSensors.add(r.sensor_id);
      else activeTypes.add(r.sensor_type);
    }

    if (timeoutSensors.size) {
      await this.repos.warn("Một số sensor không báo cáo kịp thời", {
        zoneId,
        timeoutSensors: [...timeoutSensors],
      });
    }

    // 5) Phát hiện dữ liệu mâu thuẫn -> KHÔNG tạo event, chỉ log/publish diagnostic
    if (isConflicting(window)) {
      await this.repos.warn("Phát hiện dữ liệu mâu thuẫn", { zoneId, window });
      await this.publisher.publish({
        type: "diagnostic_inconsistent",
        zone_id: zoneId,
        at: dayjs().toISOString(),
      });
      return { status: "inconsistent" };
    }

    // 6) Tính thống kê + lấy threshold áp dụng
    const stats = calculateStatsByType(window);
    const thresholds = await this.thresholds.getZoneThresholds(zoneId);

    // 7) Xác định các reading vượt ngưỡng/outlier/tăng nhanh
    const exceeded = getExceededReadings(window, thresholds, stats);

    // Không có exceed -> bình thường
    if (exceeded.length === 0) {
      return {
        status: "normal",
        activeTypes: [...activeTypes],
        windowCount: window.length,
      };
    }

    // 8) Kiểm tra correlation & cooldown
    const typesExceeded = new Set(exceeded.map((e) => e.sensor_type));

    const enough = this.requireDistinctTypes
      ? typesExceeded.size >= 2
      : exceeded.length >= 2;
    const canTrigger = this.cooldown.canTrigger(zoneId, now);

    // 9) ĐỦ correlation & qua cooldown -> TẠO bản ghi suspected
    if (enough && canTrigger) {
      const correlation = {
        exceeded,
        stats,
        detectedAt: dayjs().toISOString(),
        rules: { requireDistinctTypes: this.requireDistinctTypes },
      };

      const summary = `Fire suspected: ${typesExceeded.size} types exceeded within ${this.windowMs}ms`;
      const ev = await this._createSuspectedEvent(zoneId, correlation, summary);
      for (const ex of exceeded) {
        await this.repos.warn(
          "Fire suspected",
          `Fire suspected: ${typesExceeded.size} types exceeded within ${this.windowMs}ms`,
          ev.id,
          ex.sensor_id
        );
      }
      // đánh dấu cooldown để chặn lặp lại quá nhanh
      this.cooldown.mark(zoneId, "suspected", now);

      // publish realtime cho các consumer khác
      await this.publisher.publish({
        type: "fire_event_state_changed",
        state: "suspected",
        fireEventId: ev.id,
        zone_id: zoneId,
        severity: ev.severity ?? 1,
        at: dayjs().toISOString(),
      });

      return {
        status: "fire_suspected",
        fireEventId: ev.id,
        exceededCount: exceeded.length,
      };
    }

    // 10) CHƯA đủ correlation hoặc đang cooldown -> KHÔNG tạo event
    await this.repos.warn("Insufficient correlation or cooldown active", {
      zoneId,
      exceededCount: exceeded.length,
      canTrigger,
    });

    await this.publisher.publish({
      type: "diagnostic_insufficient_or_cooldown",
      zone_id: zoneId,
      exceededCount: exceeded.length,
      canTrigger,
      at: dayjs().toISOString(),
    });

    return {
      status: canTrigger ? "insufficient_exceeds" : "cooldown_active",
      exceededCount: exceeded.length,
    };
  }

  /**
   * Helper tạo suspected event tương thích schema firecore.fire_events.
   * - Ưu tiên dùng repos.createSuspectedEvent nếu có
   * - Nếu không, fallback dùng repos.createEvent với đúng cột của bảng
   */
  async _createSuspectedEvent(zone_id, correlation, summary) {
    const payload = {
      zone_id,
      severity: 1,
      correlation,
      summary,
    };

    if (typeof this.repos.createSuspectedEvent === "function") {
      // API “đẹp” theo schema
      return this.repos.createSuspectedEvent(payload);
    }

    // Fallback: dùng createEvent cũ nhưng truyền đúng cột
    const newEvent = await this.repos.createEvent({
      zone_id,
      state: "suspected",
      suspected_at: new Date(),
      confirmed_at: null,
      cleared_at: null,
      severity: 1,
      correlation,
      summary,
    });
    return newEvent;
  }
}

module.exports = CorrelationAnalyzer;
