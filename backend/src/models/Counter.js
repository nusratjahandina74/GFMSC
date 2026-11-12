import mongoose from "mongoose";

// Atomic named counters (e.g. school numbers). `nextSeq` is race-free ($inc + upsert).
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model("Counter", counterSchema);
export const nextSeq = async (name) => (await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true })).seq;
// Reserves `count` consecutive numbers and returns the FIRST one, in a single
// atomic round-trip — used when issuing a batch of receipts/invoices at once
// (avoids N sequential $inc calls for a whole class).
export const reserveSeq = async (name, count = 1) => {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: n } }, { upsert: true, new: true });
  return doc.seq - n + 1;
};
export default Counter;
