import mongoose from 'mongoose';

export const isValidId = (id) => {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id);
};

// ---------------------------------------------------------------------------
// Phone numbers — one rule for the whole platform.
//
// Accepted: an optional leading "+" followed by 10–15 digits. That covers a
// Bangladeshi mobile (e.g. 01712345678 / +8801712345678) and any other valid
// international number, while rejecting junk like letters, "abc", "123".
// ---------------------------------------------------------------------------
export const PHONE_RE = /^\+?\d{10,15}$/;
export const PHONE_MESSAGE = "Please enter a valid phone number (10–15 digits, e.g. 01712345678 or +8801712345678).";
export const isValidPhone = (value) => typeof value === "string" && PHONE_RE.test(value.trim());
