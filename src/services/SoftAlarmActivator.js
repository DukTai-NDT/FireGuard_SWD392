// services/SoftAlarmActivator.js
// UC-07 — Software-only: không gọi phần cứng.
// Nhiệm vụ: kiểm tra event confirmed, ghi alarm_triggers, publish AlarmTriggered, retry nếu notify lỗi.

const dayjs = require("dayjs");

class SoftAlarmActivator {
  /**
   * @param {Object} deps
   * @param {SequelizeRepositories} deps.repos
   * @param {NotificationPublisher} deps.notifier
   * @param {number} [deps.notifyTimeoutMs=2000]  // BR: phải publish <= 2s
   * @param {number} [deps.retryDelayMs=30000]    // E6.1: retry sau 30s
   */
  constructor({
    repos,
    notifier,
    notifyTimeoutMs = 2000,
    retryDelayMs = 30000,
  }) {
    this.repos = repos;
    this.notifier = notifier;
    this.notifyTimeoutMs = notifyTimeoutMs;
    this.retryDelayMs = retryDelayMs;
  }

  /**
   * Kích hoạt báo động (software) từ 1 sự kiện fire_events đã confirmed.
   * - Không chạm phần cứng; coi như "đã bật" ở mức logic/hệ thống.
   * @param {string} eventId UUID fire_events.id
   * @returns {Promise<{ok:boolean, alarmTriggerId?:number, error?:string}>}
   */
  async activateFromConfirmed(eventId) {
    // 1) Preconditions: event confirmed
    const ev = await this.repos.getConfirmedEvent(eventId);
    if (!ev) {
      await this.repos.warn("UC-07: event not confirmed or not found", {
        eventId,
      });
      return { ok: false, error: "event_not_confirmed" };
    }

    const zoneId = ev.zone_id;

    // 2) Ghi alarm_triggers (POST-2)
    // Vì không bật phần cứng, coi status='active' (nếu muốn đánh dấu soft-only thì thêm details.flag)
    const alarm = await this.repos.createAlarmTrigger({
      event_id: eventId,
      zone_id: zoneId,
      triggered_at: new Date(),
      status: "active",
      details: { mode: "SOFTWARE_ONLY" },
    });

    // 3) Publish Notification (POST-3) — phải trong 2s
    try {
      await this.notifier.publishAlarmTriggered(
        {
          alarm_id: alarm.id,
          event_id: eventId,
          zone_id: zoneId,
          severity: ev.severity ?? 1,
          at: dayjs().toISOString(),
        },
        { timeoutMs: this.notifyTimeoutMs }
      );
    } catch (e) {
      // E6.1 — Notification Service Unavailable → log + retry sau 30s
      await this.repos.warn("UC-07: notification publish failed, will retry", {
        eventId,
        zoneId,
        error: e?.message,
      });

      setTimeout(async () => {
        try {
          await this.notifier.publishAlarmTriggered(
            {
              alarm_id: alarm.id,
              event_id: eventId,
              zone_id: zoneId,
              severity: ev.severity ?? 1,
              at: dayjs().toISOString(),
              retry: true,
            },
            { timeoutMs: this.notifyTimeoutMs }
          );
        } catch (err2) {
          await this.repos.warn("UC-07: notification retry failed", {
            eventId,
            zoneId,
            error: err2?.message,
          });
        }
      }, this.retryDelayMs);
    }

    return { ok: true, alarmTriggerId: alarm.id };
  }
}

module.exports = SoftAlarmActivator;
