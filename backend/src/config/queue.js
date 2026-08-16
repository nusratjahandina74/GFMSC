import { EventEmitter } from "events";

const REDIS_URL = process.env.REDIS_URL || "";
const REDIS_ENABLED = Boolean(REDIS_URL);

let QueueClass = null;
let WorkerClass = null;
let QueueEventsClass = null;
let bullmqAvailable = false;

try {
  const bullmq = await import("bullmq");
  QueueClass = bullmq.Queue;
  WorkerClass = bullmq.Worker;
  QueueEventsClass = bullmq.QueueEvents;
  bullmqAvailable = true;
} catch {
  bullmqAvailable = false;
}

const MEMORY_QUEUES = new Map();
class MemoryQueue extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.jobs = [];
    this.handlers = new Map();
  }
  async add(name, data, opts) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = { id, name, data, opts: opts || {}, status: "waiting", createdAt: new Date() };
    this.jobs.push(job);
    setImmediate(async () => {
      const handler = this.handlers.get(name) || this.handlers.get("__default__");
      if (handler) {
        try {
          job.status = "active";
          const result = await handler({ id, name, data });
          job.status = "completed";
          job.result = result;
          this.emit("completed", { jobId: id, returnvalue: result });
        } catch (err) {
          job.status = "failed";
          job.failedReason = err.message;
          this.emit("failed", { jobId: id, failedReason: err.message });
        }
      } else {
        job.status = "completed";
      }
    });
    return { id };
  }
  process(handlerOrName, handler) {
    if (typeof handlerOrName === "function") {
      this.handlers.set("__default__", handlerOrName);
    } else {
      this.handlers.set(handlerOrName, handler);
    }
  }
  async getJobs() {
    return this.jobs;
  }
}

function getMemoryQueue(name) {
  if (!MEMORY_QUEUES.has(name)) {
    MEMORY_QUEUES.set(name, new MemoryQueue(name));
  }
  return MEMORY_QUEUES.get(name);
}

export function createQueue(name) {
  if (bullmqAvailable && REDIS_ENABLED) {
    try {
      const connection = REDIS_URL
        ? undefined
        : { host: process.env.REDIS_HOST || "127.0.0.1", port: Number(process.env.REDIS_PORT || 6379) };
      const queue = new QueueClass(name, REDIS_URL ? { connection: new URL(REDIS_URL) } : { connection });
      console.log(`[Queue] BullMQ queue "${name}" initialized via Redis`);
      return queue;
    } catch (err) {
      console.warn(`[Queue] BullMQ Redis init failed for "${name}", falling back to memory queue:`, err.message);
      return getMemoryQueue(name);
    }
  }
  console.warn(`[Queue] BullMQ/Redis not configured — using in-memory queue "${name}" (jobs will NOT persist across restarts)`);
  return getMemoryQueue(name);
}

export function createWorker(name, handler, opts = {}) {
  if (bullmqAvailable && REDIS_ENABLED) {
    try {
      const connection = REDIS_URL
        ? undefined
        : { host: process.env.REDIS_HOST || "127.0.0.1", port: Number(process.env.REDIS_PORT || 6379) };
      const worker = new WorkerClass(name, handler, REDIS_URL ? { connection: new URL(REDIS_URL), ...opts } : { connection, ...opts });
      console.log(`[Queue] BullMQ worker "${name}" started`);
      return worker;
    } catch (err) {
      console.warn(`[Queue] BullMQ worker init failed for "${name}", falling back to memory:`, err.message);
      const q = getMemoryQueue(name);
      q.process(handler);
      return q;
    }
  }
  const q = getMemoryQueue(name);
  q.process(handler);
  return q;
}

export function createQueueEvents(name) {
  if (bullmqAvailable && REDIS_ENABLED) {
    try {
      const connection = REDIS_URL
        ? undefined
        : { host: process.env.REDIS_HOST || "127.0.0.1", port: Number(process.env.REDIS_PORT || 6379) };
      return new QueueEventsClass(name, REDIS_URL ? { connection: new URL(REDIS_URL) } : { connection });
    } catch {
      return getMemoryQueue(name);
    }
  }
  return getMemoryQueue(name);
}

export const emailQueue = createQueue("emails");
export const reportQueue = createQueue("reports");
export const smsQueue = createQueue("sms");
export const feeInvoiceQueue = createQueue("fee-invoices");

export const queueConfig = {
  bullmqAvailable,
  redisEnabled: REDIS_ENABLED,
  redisUrl: REDIS_URL ? "set" : "not set",
  mode: bullmqAvailable && REDIS_ENABLED ? "bullmq-redis" : "memory",
};

export default { createQueue, createWorker, createQueueEvents, emailQueue, reportQueue, smsQueue, feeInvoiceQueue, queueConfig };
