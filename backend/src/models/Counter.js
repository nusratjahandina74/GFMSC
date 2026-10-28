import mongoose from "mongoose";

// Atomic named counters (e.g. school numbers). `nextSeq` is race-free ($inc + upsert).
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model("Counter", counterSchema);
export const nextSeq = async (name) => (await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true })).seq;
export default Counter;
