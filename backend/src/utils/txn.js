import mongoose from "mongoose";

// Runs `fn(session)` inside a MongoDB transaction.
// * Atlas / any replica set / mongos: a REAL multi-document transaction (auto-retried on transient errors).
// * Standalone mongod (typical local dev) or a non-transactional engine: support is detected UP FRONT
//   (hello -> setName/isdbgrid) and `fn(null)` runs once, WITHOUT a session, with a one-time warning.
//   We never run `fn` first and "retry without a transaction" afterwards — that could apply writes twice.
// * REQUIRE_TRANSACTIONS=true (set it in production) turns the no-transaction case into a hard error
//   instead of silently losing atomicity.
// `fn` must pass `{ session }` to every query/write when session is non-null.
let supported; // cached per process (reset on reconnect via resetTxnSupport)
export const resetTxnSupport = () => { supported = undefined; };

const detect = async () => {
  try {
    const h = await mongoose.connection.db.admin().command({ hello: 1 });
    return Boolean(h.setName || h.msg === "isdbgrid");
  } catch {
    return false;
  }
};

let warned = false;
export const withTxn = async (fn) => {
  if (supported === undefined) supported = await detect();
  if (!supported) {
    if (process.env.REQUIRE_TRANSACTIONS === "true") throw new Error("MongoDB deployment does not support transactions but REQUIRE_TRANSACTIONS=true");
    if (!warned && process.env.NODE_ENV !== "test") { warned = true; console.warn("[txn] No transaction support (standalone MongoDB): running WITHOUT atomicity. Use a replica set / Atlas and set REQUIRE_TRANSACTIONS=true in production."); }
    return fn(null);
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await fn(session); });
    return result;
  } finally {
    await session.endSession().catch(() => {});
  }
};

export const sess = (session) => (session ? { session } : {});
