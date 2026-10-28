import crypto from "node:crypto";

const COMMON = new Set(["password", "12345678", "123456789", "1234567890", "qwerty123", "password1", "iloveyou", "admin1234", "abcd1234", "11111111", "00000000", "gfmsc1234"]);

// Returns null when OK, otherwise a human-readable reason (safe to show to the user).
export const validatePassword = (pw) => {
  if (typeof pw !== "string") return "Password is required.";
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (pw.length > 128) return "Password must be at most 128 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must contain at least one letter and one number.";
  if (COMMON.has(pw.toLowerCase())) return "This password is too common. Choose a different one.";
  return null;
};

// Random temporary password for accounts created by an admin (replaces the old
// predictable default "123456" — H22). Unambiguous characters, always has a
// letter AND a digit so it satisfies validatePassword().
export const generateTempPassword = (len = 10) => {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(letters), pick(digits)];
  while (chars.length < len) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};
