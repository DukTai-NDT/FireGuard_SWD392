class CooldownRegistry {
  constructor({ cooldownMs }) {
    this.cooldownMs = cooldownMs;
    this.last = new Map(); // zoneId -> { timestamp, eventType }
  }
  canTrigger(zoneId, now = Date.now()) {
    const last = this.last.get(zoneId);
    return !last || now - last.timestamp > this.cooldownMs;
  }
  mark(zoneId, eventType, now = Date.now()) {
    this.last.set(zoneId, { timestamp: now, eventType });
  }
}
module.exports = CooldownRegistry;
