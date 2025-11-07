// services/SequelizeRepositories.js
const { v4: uuidv4 } = require("uuid");

class SequelizeRepositories {
  constructor({ Sensor, SensorReading, FireEvent, SystemLog, AlarmTrigger }) {
    this.Sensor = Sensor;
    this.SensorReading = SensorReading;
    this.FireEvent = FireEvent; // model map tới firecore.fire_events
    this.SystemLog = SystemLog;
    this.AlarmTrigger = AlarmTrigger;
  }

  // ---- Sensors & readings ---------------------------------------------------

  async findSensor(sensor_id) {
    return this.Sensor.findByPk(sensor_id);
  }

  async saveReading({
    sensor_id,
    reading_ts,
    smoke_ppm,
    temp_c,
    co2_ppm,
    payload,
    quality_score,
    ts,
  }) {
    try {
      await this.SensorReading.create({
        sensor_id,
        reading_ts,
        smoke_ppm,
        temp_c,
        co2_ppm,
        payload,
        quality_score,
        timestamp: new Date(ts),
      });
    } catch {
      // best-effort; không chặn luồng phân tích
    }
  }

  // ---- Fire events (ĐÚNG với schema firecore.fire_events) -------------------
  // Schema cột: id, zone_id, suspected_at, confirmed_at, cleared_at,
  //             state ('suspected'|'confirmed'|'cleared'), severity, correlation(jsonb), summary

  /**
   * Tạo bản ghi state='suspected' (UC-05).
   * - Nếu DB yêu cầu id: tự sinh UUID khi caller không truyền.
   */
  async createSuspectedEvent({
    id,
    zone_id,
    severity = 1,
    correlation = {},
    summary = null,
  }) {
    const now = new Date();
    const finalId = id || uuidv4();

    return this.FireEvent.create({
      id: finalId, // luôn có id (tự sinh nếu thiếu)
      zone_id,
      suspected_at: now,
      confirmed_at: null,
      cleared_at: null,
      state: "suspected",
      severity,
      correlation,
      summary,
    });
  }

  /**    console.log("abc: ", count);
    console.log("abcd: ", rows);;
   * (Tuỳ chọn) Xác nhận sự kiện: chuyển 'suspected' -> 'confirmed'
   */
  async confirmEvent(event_id) {
    const [count, rows] = await this.FireEvent.update(
      {
        state: "confirmed",
        confirmed_at: new Date(),
      },
      {
        where: { id: event_id, state: "suspected" },
        returning: true,
      }
    );

    return { count, event: rows?.[0] || null };
  }

  /**
   * (Tuỳ chọn) Kết thúc sự kiện: chuyển 'confirmed' -> 'cleared'
   * (Schema ràng buộc: cleared chỉ hợp lệ nếu đã confirmed_at)
   */
  async clearEvent({ event_id }) {
    const [count, rows] = await this.FireEvent.update(
      {
        state: "cleared",
        cleared_at: new Date(),
      },
      {
        where: { id: event_id, state: "confirmed" },
        returning: true,
      }
    );
    return { count, event: rows?.[0] || null };
  }

  /**
   * (Giữ để tương thích cũ) Tạo event thô – CHỈ dùng nếu bạn thật sự cần.
   * Tự động loại các field không có trong schema (event_type, status, details).
   * Nếu DB yêu cầu id, tự sinh nếu thiếu.
   */
  async createEvent({
    id,
    zone_id,
    suspected_at,
    confirmed_at,
    cleared_at,
    state,
    severity,
    correlation,
    // các field không có trong schema sẽ bị loại: event_type, status, details
    summary,
  }) {
    const finalId = id || uuidv4();

    return this.FireEvent.create({
      id: finalId,
      zone_id,
      suspected_at: suspected_at ? new Date(suspected_at) : new Date(),
      confirmed_at: confirmed_at ? new Date(confirmed_at) : null,
      cleared_at: cleared_at ? new Date(cleared_at) : null,
      state, // 'suspected' | 'confirmed' | 'cleared'
      severity: severity ?? 1,
      correlation: correlation ?? {},
      summary: summary ?? null,
    });
  }

  // ---- System log -----------------------------------------------------------

  async warn(message, ctx, event_id, sensor_id) {
    try {
      await this.SystemLog.create?.({
        level: "warn",
        message,
        ctx,
        event_id,
        sensor_id,
      });
    } catch {
      // nuốt lỗi log
    }
  }
  /** Tiền điều kiện: event phải đang 'confirmed' */
  async getConfirmedEvent(event_id) {
    return this.FireEvent.findOne({
      where: { id: event_id, state: "confirmed" },
    });
  }

  /** Ghi bản ghi AlarmTriggered (bảng của bạn có BIGINT id sequence → không cần truyền id) */
  async createAlarmTrigger({
    event_id,
    zone_id,
    triggered_at,
    status = "active",
    details = {},
  }) {
    return this.AlarmTrigger.create({
      event_id,
      zone_id,
      triggered_at: triggered_at || new Date(),
      status, // firecore.alarm_status (enum)
      details, // jsonb
    });
  }
}

module.exports = SequelizeRepositories;
