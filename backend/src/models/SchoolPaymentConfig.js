import mongoose from "mongoose";

// One row per school: everything the school customises about COLLECTING money.
// Gateway secret fields are stored ENCRYPTED (AES-256-GCM, see utils/secretBox.js)
// and are never returned to any client — reads expose only a masked preview.
const gatewaySchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    mode: { type: String, enum: ["SANDBOX", "LIVE"], default: "SANDBOX" },
    baseUrl: { type: String, trim: true, default: "" },
    // bKash
    appKey: { type: String, default: "" },
    appSecret: { type: String, default: "" },
    username: { type: String, default: "" },
    password: { type: String, default: "" },
    // SSLCommerz
    storeId: { type: String, default: "" },
    storePassword: { type: String, default: "" },
    // Nagad / other
    merchantId: { type: String, default: "" },
    extra: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const mobileAccountSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["BKASH", "NAGAD", "ROCKET"], default: "BKASH" },
    accountNumber: { type: String, trim: true, default: "" },
    accountType: { type: String, trim: true, default: "Merchant" },
  },
  { _id: false }
);

const schoolPaymentConfigSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, unique: true, index: true },

    gateways: {
      bkash: { type: gatewaySchema, default: () => ({}) },
      nagad: { type: gatewaySchema, default: () => ({}) },
      sslcommerz: { type: gatewaySchema, default: () => ({}) },
    },

    // Where guardians may send money manually (Send Money) + the instructions shown in the UI.
    manualMobileBanking: {
      enabled: { type: Boolean, default: false },
      instructions: { type: String, trim: true, maxlength: 600, default: "" },
      accounts: { type: [mobileAccountSchema], default: [] },
    },

    // Automatic late fine: applied when an invoice is generated after its due
    // date, or when a payment is collected after the due date.
    lateFine: {
      enabled: { type: Boolean, default: false },
      type: { type: String, enum: ["PERCENT", "FIXED"], default: "FIXED" },
      value: { type: Number, default: 0, min: 0 },
      graceDays: { type: Number, default: 0, min: 0 },
      perDay: { type: Boolean, default: false },
    },

    reminders: {
      smsEnabled: { type: Boolean, default: false },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("SchoolPaymentConfig", schoolPaymentConfigSchema);
