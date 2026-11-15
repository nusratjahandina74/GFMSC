import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Phone numbers — mirrors backend/src/utils/validation.js so the same rule
// runs on both sides. Optional leading "+" followed by 10–15 digits; accepts
// 01712345678 / +8801712345678 and any valid international number while
// rejecting junk such as letters or short strings.
// ---------------------------------------------------------------------------
export const PHONE_RE = /^\+?\d{10,15}$/;
export const PHONE_MESSAGE = "Please enter a valid phone number (10–15 digits, e.g. 01712345678 or +8801712345678).";
export const isValidPhone = (value) => typeof value === "string" && PHONE_RE.test(value.trim());

