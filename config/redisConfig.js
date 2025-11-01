// config/redis.js
const IORedis = require("ioredis");
require("dotenv").config();

const {
  REDIS_HOST = "127.0.0.1",
  REDIS_PORT = 6379,
  REDIS_PASSWORD = "",
  REDIS_TLS = "false",
} = process.env;

let redis;
function getRedis() {
  if (redis) return redis;
  redis = new IORedis({
    host: REDIS_HOST,
    port: Number(REDIS_PORT),
    password: REDIS_PASSWORD || undefined,
    tls: REDIS_TLS === "true" ? {} : undefined,
    retryStrategy(times) {
      return Math.min(times * 200, 2000);
    },
    reconnectOnError(err) {
      const msg = err?.message || "";
      return /READONLY|MOVED|CLUSTERDOWN/.test(msg);
    },
  });
  return redis;
}

module.exports = getRedis();
module.exports.getRedis = getRedis;
