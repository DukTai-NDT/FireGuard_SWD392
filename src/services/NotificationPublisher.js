// services/NotificationPublisher.js
// Gửi sự kiện ra kênh Redis cho Notification Service.

class NotificationPublisher {
  /**
   * @param {Object} deps
   * @param {import("ioredis")} deps.redis
   * @param {string} [deps.channel="notifications"]
   */
  constructor({ redis, channel = "notifications" }) {
    this.redis = redis;
    this.channel = channel;
  }

  /**
   * Publish AlarmTriggered; enforce timeout để bám BR 2s.
   * @param {Object} payload
   * @param {Object} [ctl]
   * @param {number} [ctl.timeoutMs=2000]
   */
  async publishAlarmTriggered(payload, { timeoutMs = 2000 } = {}) {
    const op = this.redis.publish(
      this.channel,
      JSON.stringify({ type: "AlarmTriggered", ...payload })
    );
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("notify_timeout")), timeoutMs)
    );
    await Promise.race([op, timeout]);
  }
}

module.exports = NotificationPublisher;
