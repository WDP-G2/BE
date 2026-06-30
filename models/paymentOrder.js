var mongoose = require("../db");
var Schema = mongoose.Schema;

var PaymentOrderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "VND" },
    provider: { type: String, enum: ["ZALOPAY"], default: "ZALOPAY" },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "CANCELLED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },
    depositTarget: {
      type: String,
      enum: ["USER_WALLET", "ADMIN_WALLET"],
      default: "USER_WALLET",
    },
    referenceCode: { type: String, required: true, unique: true, index: true },
    providerTransactionId: { type: String, unique: true, sparse: true },
    orderCode: { type: String, unique: true, sparse: true },
    paymentLinkId: { type: String, unique: true, sparse: true },
    checkoutUrl: { type: String, default: "" },
    qrCode: { type: String, default: "" },
    transferContent: { type: String, default: "" },
    note: { type: String, default: "" },
    metadata: { type: String, default: "" },
    paidAt: { type: Date },
    expiredAt: { type: Date },
    createdBy: { type: String, default: "SYSTEM" },
    updatedBy: { type: String, default: "SYSTEM" },
  },
  { timestamps: true },
);

function emptyToUndefined(value) {
  return value === "" || value === null ? undefined : value;
}

PaymentOrderSchema.path("providerTransactionId").set(emptyToUndefined);
PaymentOrderSchema.path("orderCode").set(emptyToUndefined);
PaymentOrderSchema.path("paymentLinkId").set(emptyToUndefined);

module.exports = mongoose.model("PaymentOrder", PaymentOrderSchema);
