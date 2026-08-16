import dotenv from "dotenv";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { scheduleMonthlyFeeCron } from "./src/jobs/monthlyFeeCron.js";

dotenv.config();

connectDB();

scheduleMonthlyFeeCron();

(async () => {
  try {
    const workers = await import("./src/workers/index.js");
    console.log("[GFMSC Engine] Background workers initialized:", {
      emailWorker: !!workers.emailWorker,
      smsWorker: !!workers.smsWorker,
      reportWorker: !!workers.reportWorker,
      feeInvoiceWorker: !!workers.feeInvoiceWorker,
    });
  } catch (err) {
    console.warn("[GFMSC Engine] Background workers skipped (non-fatal):", err.message);
  }
})();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[GFMSC Production Engine]: Server running successfully on port ${PORT}`);
  console.log(`[GFMSC Engine] Health endpoint: http://localhost:${PORT}/api/health/status`);
});
