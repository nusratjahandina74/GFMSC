import { createWorker, emailQueue, reportQueue, smsQueue, feeInvoiceQueue } from "../config/queue.js";
import { sendEmail } from "../utils/mailer.js";
import Student from "../models/Student.js";
import Invoice from "../models/Invoice.js";

const emailWorker = createWorker("emails", async (job) => {
  const { to, subject, html, text } = job.data;
  console.log(`[Email Worker] Processing email job ${job.id} -> ${to}`);
  try {
    await sendEmail({ to, subject, html, text });
    return { sent: true, to };
  } catch (err) {
    console.error(`[Email Worker] Job ${job.id} failed:`, err.message);
    throw err;
  }
});

const smsWorker = createWorker("sms", async (job) => {
  const { phoneNumbers, message } = job.data;
  console.log(`[SMS Worker] Processing SMS job ${job.id} -> ${phoneNumbers?.length || 0} recipients`);
  try {
    const smsSender = await import("../utils/smsSender.js");
    if (smsSender && typeof smsSender.sendBulkSms === "function") {
      await smsSender.sendBulkSms(phoneNumbers, message);
    }
    return { queued: true, count: phoneNumbers?.length || 0 };
  } catch (err) {
    console.warn(`[SMS Worker] Job ${job.id} failed:`, err.message);
    return { skipped: true, reason: err.message };
  }
});

const reportWorker = createWorker("reports", async (job) => {
  const { type, params } = job.data;
  console.log(`[Report Worker] Processing report job ${job.id} -> ${type}`);
  return { type, generatedAt: new Date().toISOString(), params };
});

const feeInvoiceWorker = createWorker("fee-invoices", async (job) => {
  const { schoolId, month, year, className, section } = job.data;
  console.log(`[Fee Invoice Worker] Processing job ${job.id} -> ${month}/${year} for ${className || "all"}`);
  try {
    const filter = { schoolId, isActive: true };
    if (className) filter.className = className;
    if (section) filter.section = section;
    const students = await Student.find(filter).lean();
    const invoices = [];
    for (const stu of students) {
      const existing = await Invoice.findOne({
        schoolId,
        studentId: stu._id,
        month,
        year,
      });
      if (!existing) {
        const inv = await Invoice.create({
          schoolId,
          studentId: stu._id,
          amount: stu.monthlyFee || 0,
          month,
          year,
          status: "unpaid",
          items: [{ description: `Monthly Tuition - ${month} ${year}`, amount: stu.monthlyFee || 0 }],
          dueDate: new Date(year, new Date(`${month} 1`).getMonth() + 1, 10),
        });
        invoices.push(inv._id);
      }
    }
    return { created: invoices.length, month, year };
  } catch (err) {
    console.error(`[Fee Invoice Worker] Job ${job.id} failed:`, err.message);
    throw err;
  }
});

export const enqueueMonthlyInvoices = async (data) => {
  const job = await feeInvoiceQueue.add("generate-monthly", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
  return job;
};

export const enqueueEmail = async (data) => {
  const job = await emailQueue.add("send", data, { attempts: 3 });
  return job;
};

export const enqueueSms = async (data) => {
  const job = await smsQueue.add("send", data, { attempts: 2 });
  return job;
};

export const enqueueReport = async (data) => {
  const job = await reportQueue.add("generate", data, { attempts: 2 });
  return job;
};

export default { emailWorker, smsWorker, reportWorker, feeInvoiceWorker, enqueueMonthlyInvoices, enqueueEmail, enqueueSms, enqueueReport };
