var mongoose = require("../db");
var Schema = mongoose.Schema;

var WithdrawalRequestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "VND" },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "PAID"],
      default: "PENDING",
      index: true,
    },
    bankName: { type: String, required: true },
    bankAccountNumber: { type: String, required: true },
    bankAccountName: { type: String, required: true },
    reason: { type: String, default: "" },
    adminNote: { type: String, default: "" },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rejectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    paidBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

module.exports = mongoose.model("WithdrawalRequest", WithdrawalRequestSchema);
