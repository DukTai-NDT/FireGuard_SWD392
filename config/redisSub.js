// config/redisSub.js
const IORedis = require("ioredis");
require("dotenv").config();

const {
  REDIS_HOST = "127.0.0.1",
  REDIS_PORT = 6379,
  REDIS_PASSWORD = "",
  REDIS_TLS = "false",
} = process.env;

let redisSub;
function getRedisSub() {
  if (redisSub) return redisSub;
  redisSub = new IORedis({
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
  return redisSub;
}

module.exports = getRedisSub();
module.exports.getRedisSub = getRedisSub;
