import { createWorker, emailQueue, smsQueue, feeInvoiceQueue } from "../config/queue.js";
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
  const { phoneNumbers, message, schoolId } = job.data;
  // Delegates to the durable outbox: retries, backoff, delivery status. A failure is no longer swallowed
  // as "skipped" — the Notification row keeps the error and the dead-letter state.
  const { sendBulkSMS } = await import("../utils/smsSender.js");
  const rows = await sendBulkSMS(phoneNumbers || [], message, { schoolId });
  return { queued: rows.filter(Boolean).length, requested: phoneNumbers?.length || 0 };
});

// H29: the former "reports" worker only echoed its input (it generated nothing) and nothing ever enqueued to it,
// so it was removed instead of pretending to work. PDF/CSV reports are produced synchronously by their endpoints.

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

export default { emailWorker, smsWorker, feeInvoiceWorker, enqueueMonthlyInvoices, enqueueEmail, enqueueSms };
