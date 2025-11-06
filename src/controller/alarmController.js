const redisPub = require("../../config/redisConfig"); // publisher client (ioredis)
const redisSub = require("../../config/redisSub"); // subscriber client (ioredis)

// Lấy models từ Sequelize init của bạn:
const { FireEvent, AlarmTrigger, SystemLog } = require("../models");

const SequelizeRepositories = require("../services/SequelizeRepositories");
const NotificationPublisher = require("../services/NotificationPublisher");
const SoftAlarmActivator = require("../services/SoftAlarmActivator");
const {
  runConfirmedAlarmSubscriber,
} = require("../subscribers/confirmedAlarmSubscriber");

// Repos
const repos = new SequelizeRepositories({ FireEvent, AlarmTrigger, SystemLog });

// Notifier (Redis → Notification Service)
const notifier = new NotificationPublisher({
  redis: redisPub,
  channel: "notifications",
});

// UC-07 service (software-only)
const activator = new SoftAlarmActivator({ repos, notifier });

// Subscriber auto-run UC-07 khi UC-06 confirm
runConfirmedAlarmSubscriber({ redisSub, activator });

async function buildAlarmController(req, res, next) {
  try {
    const { id } = req.params; // fire_events.id (UUID)
    const out = await activator.activateFromConfirmed(id);
    if (!out.ok) return res.status(409).json({ ok: false, error: out.error });
    res.json({ ok: true, alarmTriggerId: out.alarmTriggerId });
  } catch (e) {
    next(e);
  }
}
async function confirmEvent(req, res, next) {
  try {
    const { id } = req.params;
    const out = await repos.confirmEvent(id);
    return res.status(201).json({
      status: 201,
      message: "confirm success",
      data: out,
    });
  } catch (e) {
    next(e);
  }
}
module.exports = { buildAlarmController, confirmEvent };
