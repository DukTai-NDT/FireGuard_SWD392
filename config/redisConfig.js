// config/redis.js
// COMMENTED OUT - Not needed for UC12 + UC13
// const IORedis = require("ioredis");
require("dotenv").config();

const {
  REDIS_HOST = "127.0.0.1",
  REDIS_PORT = 6379,
  REDIS_PASSWORD = "",
  REDIS_TLS = "false",
} = process.env;

let redis;
function getRedis() {
  // if (redis) return redis;
  // redis = new IORedis({
  //   host: REDIS_HOST,
  //   port: Number(REDIS_PORT),
  //   password: REDIS_PASSWORD || undefined,
  //   tls: REDIS_TLS === "true" ? {} : undefined,
  //   retryStrategy(times) {
  //     return Math.min(times * 200, 2000);
  //   },
  //   reconnectOnError(err) {
  //     const msg = err?.message || "";
  //     return /READONLY|MOVED|CLUSTERDOWN/.test(msg);
  //   },
  // });
  // return redis;
  return null; // Redis disabled for UC12 + UC13
}

// module.exports = getRedis();
// module.exports.getRedis = getRedis;
module.exports = null; // Redis disabled for UC12 + UC13
