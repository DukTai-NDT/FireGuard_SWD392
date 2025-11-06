class EventPublisher {
  constructor({ redis, channel = "fire_events" }) {
    this.redis = redis;
    this.channel = channel;
  }
  async publish(payload) {
    try {
      await this.redis.publish(this.channel, JSON.stringify(payload));
    } catch {}
  }
}
module.exports = EventPublisher;
