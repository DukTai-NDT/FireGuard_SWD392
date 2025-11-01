// src/queues/index.js
const { Queue, Worker } = require("bullmq");
const redis = require("./redisConfig"); // dùng lại client
const prefix = process.env.BULL_PREFIX || "fileguard";

function createQueue(name) {
  return new Queue(name, { connection: redis, prefix });
}
function createWorker(name, processor, opts = {}) {
  return new Worker(name, processor, {
    connection: redis,
    prefix,
    concurrency: opts.concurrency || 1,
  });
}
module.exports = { createQueue, createWorker };
