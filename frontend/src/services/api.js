// This file used to create its own separate axios instance with its own
// interceptors, which meant it could silently drift from api/client.js
// (different baseURL handling, different 401 handling, etc). Login,
// Register, ForgotPassword, ResetPassword, VerifyEmail, and ProfileSettings
// all imported this file, while every dashboard/admin page imported
// api/client.js directly — two clients pointed at two different resolved
// URLs depending on env config, which is why accounts could be created on
// one "side" of the app and then fail to log in / fail to be found on the
// other. There is now exactly one axios client, defined in api/client.js.
import api from "../api/client";

export default api;
