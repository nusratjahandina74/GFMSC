import { AsyncLocalStorage } from "node:async_hooks";

// Per-request tenant context. Populated by authMiddleware for every
// authenticated, non-superAdmin request and consumed by the global Mongoose
// tenant plugin (config/tenantPlugin.js), so tenant isolation is enforced in
// ONE place instead of being re-implemented (and forgotten) in 150+ queries.
export const tenantStorage = new AsyncLocalStorage();

export const getTenantContext = () => tenantStorage.getStore() || null;
export const runWithTenant = (ctx, fn) => tenantStorage.run(ctx, fn);
