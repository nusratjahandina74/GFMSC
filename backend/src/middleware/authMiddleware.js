import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Guardian from "../models/Guardian.js";
import Student from "../models/Student.js";

// Must match the fallback used when SIGNING tokens in authController.js /
// schoolController.js, or every token minted with the fallback secret will
// fail verification here whenever JWT_SECRET isn't set in the environment.
const JWT_MASTER_SECRET =
  process.env.JWT_SECRET || "gfmsc_ultra_secure_secret_key_2026_prod";

export const authMiddleware = (roles = []) => {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, JWT_MASTER_SECRET);
      
      // Fetch the latest account data from DB
      let account = null;
      let role = decoded.role;

      if (role === "student") {
        account = await Student.findById(decoded.userId);
      } else if (role === "guardian") {
        account = await Guardian.findById(decoded.userId);
      } else {
        account = await User.findById(decoded.userId);
      }
      
      if (!account) {
        return res.status(401).json({ message: "Account not found" });
      }

      if (account.isSuspended) {
        return res.status(403).json({ message: "Account suspended" });
      }

      if (role !== "student" && role !== "guardian" && !account.emailVerified) {
        return res.status(403).json({ message: "Email not verified" });
      }

      req.user = {
        userId: account._id,
        role,
        schoolId: account.schoolId,
        name: role === "student" ? account.studentName : account.name,
      };

      if (role === "student") {
        req.user.studentId = account.studentId;
        req.user.className = account.className;
        req.user.section = account.section;
      }

      // Role check
      if (roles.length && !roles.includes(role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      next();
    } catch (error) {
      console.error("Auth middleware error:", error);
      res.status(401).json({ message: "Invalid token" });
    }
  };
};