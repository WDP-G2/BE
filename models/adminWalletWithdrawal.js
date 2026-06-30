var mongoose = require("../db");
var Schema = mongoose.Schema;

var AdminWalletWithdrawalSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "VND" },
    status: { type: String, enum: ["PAID"], default: "PAID" },
    bankName: { type: String, required: true },
    bankAccountNumber: { type: String, required: true },
    bankAccountName: { type: String, required: true },
    reason: { type: String, default: "" },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AdminWalletWithdrawal", AdminWalletWithdrawalSchema);
