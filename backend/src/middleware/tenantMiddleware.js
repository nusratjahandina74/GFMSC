import School from "../models/School.js";

// NOTE ON SCOPE: this app's primary tenant-isolation mechanism is (and
// stays) the schoolId embedded in each user's JWT, checked in every
// controller — that is what actually prevents School A's data from
// leaking to School B, and it does not depend on DNS/hosting setup at all.
//
// This middleware is an ADDITIVE convenience layer for subdomain-based
// *branding/routing* (e.g. so `gfmsc.com/apply` on a school's public
// admission page can resolve which school it belongs to just from the
// hostname, without the visitor needing to type a schoolId). It attaches
// `req.tenantSchool` when a matching subdomain is found; it does not
// replace or override `req.user.schoolId` anywhere. Wire it in only on
// routes that need hostname-based resolution (e.g. the public admission
// apply page), not globally — most of the API is reached by an
// already-logged-in user whose JWT already carries the correct schoolId.
export const resolveTenantFromSubdomain = async (req, res, next) => {
  try {
    const host = req.headers.host || "";
    const subdomain = host.split(".")[0]?.toLowerCase();

    if (!subdomain || subdomain === "www" || subdomain === "gfmsc" || subdomain === "localhost") {
      req.tenantSchool = null;
      return next();
    }

    const school = await School.findOne({ subdomain, isActive: true }).select("_id name plan subscriptionExpiresAt");
    req.tenantSchool = school || null;
    next();
  } catch (error) {
    console.error("[Tenant Middleware Error]:", error);
    req.tenantSchool = null;
    next();
  }
};
