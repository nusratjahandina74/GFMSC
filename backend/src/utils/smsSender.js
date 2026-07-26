import axios from "axios";

// SMS Queue
let smsQueue = [];
let isProcessing = false;

// Configuration (use environment variables in production)
const SMS_GATEWAY_URL = process.env.SMS_GATEWAY_URL || "https://api.greenweb.com.bd/api.php";
const SMS_API_KEY = process.env.SMS_API_KEY || "";
const SMS_MASKING = process.env.SMS_MASKING || "GFMSC";

/**
 * Add SMS to queue for async processing
 */
export const sendSMS = (phoneNumber, message) => {
  if (!phoneNumber || !message) {
    console.error("Phone number and message are required for SMS");
    return;
  }
  smsQueue.push({ phoneNumber, message });
  if (!isProcessing) {
    processQueue();
  }
};

/**
 * Bulk send SMS to multiple recipients
 */
export const sendBulkSMS = (recipients, message) => {
  if (!Array.isArray(recipients) || !message) {
    console.error("Recipients array and message are required");
    return;
  }
  recipients.forEach((phone) => {
    if (phone) sendSMS(phone, message);
  });
};

/**
 * Send SMS using GreenWeb API
 */
const sendSingleSMS = async (phoneNumber, message) => {
  try {
    // Example GreenWeb API call - replace with real API integration
    // const response = await axios.get(SMS_GATEWAY_URL, {
    //   params: {
    //     token: SMS_API_KEY,
    //     to: phoneNumber,
    //     message,
    //     from: SMS_MASKING,
    //   },
    // });
    console.log(`SMS sent to ${phoneNumber}: ${message}`);
    // For now, just log - in production, implement real API
    return { success: true };
  } catch (err) {
    console.error("Failed to send SMS:", err);
    return { success: false, error: err };
  }
};

/**
 * Process the SMS queue in batches using setImmediate
 */
const processQueue = async () => {
  if (isProcessing || smsQueue.length === 0) return;
  isProcessing = true;

  while (smsQueue.length > 0) {
    const { phoneNumber, message } = smsQueue.shift();
    await sendSingleSMS(phoneNumber, message);
    // Use setImmediate to prevent blocking event loop
    await new Promise((resolve) => setImmediate(resolve));
  }

  isProcessing = false;
};
