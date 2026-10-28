// H28: the ACCESS token lives only in this module's memory — never in localStorage/sessionStorage — so an XSS
// payload cannot copy a reusable credential out of storage. Long-lived auth is the httpOnly refresh cookie (JS can't read it).
// After a page reload memory is empty; the first API call transparently obtains a new access token from the cookie.
let accessToken = null;
let inflight = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => { accessToken = token || null; };
export const clearAccessToken = () => { accessToken = null; inflight = null; };

// SINGLE-FLIGHT refresh. The server rotates the refresh token on every use and treats a replayed one as theft
// (it ends the whole session), so two parallel refreshes would log the user out. Every caller — the eager
// "no token yet" path and the 401-retry path — shares this one promise.
export const refreshAccessToken = (doRefresh) => {
  if (!inflight) {
    inflight = Promise.resolve()
      .then(doRefresh)
      .then((token) => {
        if (!token) throw new Error("refresh returned no token");
        accessToken = token;
        return token;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
};
