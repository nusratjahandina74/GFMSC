// Test harness: real Express app + real MongoDB (TEST_MONGO_URI, default local).
import crypto from "node:crypto";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET_TEST || crypto.randomBytes(48).toString("hex");
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString("hex");
process.env.BOOTSTRAP_SECRET = "test-bootstrap-secret-value-123456";

const { default: mongoose } = await import("mongoose");
const { default: app } = await import("../../src/app.js");
const request = (await import("supertest")).default;
export { mongoose, app, request };

const base = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/gfmsc_test";
export const connect = async () => {
  // One database per test process; works with URIs that carry options (?replicaSet=rs0&directConnection=true).
  const u = new URL(base);
  u.pathname = `${u.pathname === "/" ? "/gfmsc_test" : u.pathname}_${process.pid}`;
  await mongoose.connect(u.toString(), { serverSelectionTimeoutMS: 8000 });
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
};
export const disconnect = async () => {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
};

export const PW = "Passw0rd-Test1";
const models = async () => ({
  School: (await import("../../src/models/School.js")).default,
  User: (await import("../../src/models/User.js")).default,
  Student: (await import("../../src/models/Student.js")).default,
  Guardian: (await import("../../src/models/Guardian.js")).default,
});

export const makeSchool = async (name) => {
  const { School } = await models();
  return School.create({ name, email: `${name.replace(/\W/g, "").toLowerCase()}@school.test` });
};
export const makeUser = async (role, schoolId, email, password = PW) => {
  const { User } = await models();
  return User.create({ name: `${role} ${email}`, email, password, role, schoolId: role === "superAdmin" ? undefined : schoolId, emailVerified: true });
};
export const login = async (email, password = PW) => {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return { res, token: res.body.token, cookie: (res.headers["set-cookie"] || []).find((c) => c.startsWith("refreshToken=")) };
};
export const auth = (token) => ({ Authorization: `Bearer ${token}` });
export const makeStudent = async (schoolId, over = {}) => {
  const { Student } = await models();
  return Student.create({
    studentName: "Stu " + crypto.randomBytes(3).toString("hex"), className: "Class 8", section: "A",
    classRoll: Math.floor(Math.random() * 9000) + 1, sessionYear: "2026",
    fathersName: "F", fathersPhone: "01711111111", mothersName: "M", mothersPhone: "01811111111",
    password: PW, schoolId, ...over,
  });
};

// Some MongoDB-compatible engines (e.g. FerretDB used in the offline sandbox) do not make findOneAndUpdate
// atomic under concurrency. Tests that REQUIRE true atomicity call this and skip on such engines; they run
// for real on MongoDB/Atlas (CI should use a real mongod).
export const engineIsAtomic = async () => {
  const C = mongoose.connection.collection("__atomic_probe");
  let ok = true;
  for (let i = 0; i < 8 && ok; i++) {
    const { insertedId } = await C.insertOne({ n: 1 });
    const rs = await Promise.all([1, 2, 3, 4].map(() => C.findOneAndUpdate({ _id: insertedId, n: { $gte: 1 } }, { $inc: { n: -1 } })));
    if (rs.filter(Boolean).length > 1) ok = false;
  }
  await C.drop().catch(() => {});
  return ok;
};
