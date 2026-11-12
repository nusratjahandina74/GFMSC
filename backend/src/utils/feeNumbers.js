import { nextSeq, reserveSeq } from "../models/Counter.js";

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const pad = (n, w) => String(n).padStart(w, "0");

// Document numbers are unique PER SCHOOL (see the unique {schoolId, ...} indexes
// on FeeInvoice/FeePayment), so the atomic counter is namespaced per school.
const stamp = (date) => `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}`;

export const reserveInvoiceNos = async (schoolId, count, date = new Date()) => {
  const first = await reserveSeq(`feeInvoice:${schoolId}`, count);
  const prefix = `INV-${stamp(date)}-`;
  return Array.from({ length: count }, (_, i) => `${prefix}${pad(first + i, 5)}`);
};

export const nextInvoiceNo = async (schoolId, date = new Date()) => (await reserveInvoiceNos(schoolId, 1, date))[0];

// Reserves `count` consecutive receipt numbers and returns the first one.
export const reserveReceiptNos = async (schoolId, count, date = new Date()) => {
  const first = await reserveSeq(`feeReceipt:${schoolId}`, count);
  const prefix = `RCPT-${stamp(date)}-`;
  return Array.from({ length: count }, (_, i) => `${prefix}${pad(first + i, 6)}`);
};

export const nextReceiptNo = async (schoolId, date = new Date()) => (await reserveReceiptNos(schoolId, 1, date))[0];

export const nextSaasInvoiceNo = async (schoolId, date = new Date()) =>
  `SAAS-${stamp(date)}-${pad(await nextSeq(`saasInvoice:${schoolId}`), 4)}`;

// "2026-01" style month key in Bangladesh time (matches the monthly cron).
export const monthKey = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE || "Asia/Dhaka", year: "numeric", month: "2-digit" })
    .format(date)
    .slice(0, 7);
