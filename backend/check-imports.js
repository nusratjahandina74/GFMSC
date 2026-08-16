// Lightweight import/syntax check: loads app.js without starting the
// HTTP server or connecting to MongoDB, so we can catch syntax / import
// errors in CI/CD before deploying.
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://localhost/test";

async function main() {
  try {
    const app = await import("./src/app.js");
    console.log("[Import Check] app.js imported successfully, routes registered:", !!app.default);

    const db = await import("./src/config/db.js");
    console.log("[Import Check] db.js imported:", !!db.default);

    const q = await import("./src/config/queue.js");
    console.log("[Import Check] queue.js imported, mode:", q.queueConfig.mode);

    const workers = await import("./src/workers/index.js");
    console.log("[Import Check] workers/index.js imported:", Object.keys(workers).length, "exports");

    const pg = await import("./src/utils/paymentGateway.js");
    console.log("[Import Check] paymentGateway.js imported, mode:", pg.paymentConfig.mode);

    const pdf = await import("./src/controllers/pdfController.js");
    console.log("[Import Check] pdfController.js imported, bangla:", pdf.pdfFontConfig.banglaEnabled);

    console.log("\n✅ All backend module imports PASS — no syntax or import errors found.");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Backend import check FAILED:");
    console.error(err.stack || err.message);
    process.exit(1);
  }
}

main();
