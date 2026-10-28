// M06: user text used in $regex must be (a) a plain string (never an object like ?q[$ne]=x) and
// (b) escaped, otherwise `.*.*.*(x)+` style input can freeze the DB (ReDoS) or change the query.
export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const safeRegex = (input, { max = 80, flags = "i", anchored = false } = {}) => {
  if (typeof input !== "string") return null;       // arrays/objects from ?q[]=... are ignored
  const s = input.trim().slice(0, max);
  if (!s) return null;
  return new RegExp(anchored ? `^${escapeRegex(s)}` : escapeRegex(s), flags);
};
