var mongoose = require("../db");
var Schema = mongoose.Schema;

var WalletTransactionSchema = new Schema(
  {
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    type: {
      type: String,
      enum: [
        "DEPOSIT",
        "WITHDRAW",
        "ADMIN_WITHDRAW",
        "BET",
        "PAYOUT",
        "REFUND",
        "ENTRY_FEE",
        "PRIZE",
        "ADJUSTMENT",
      ],
      required: true,
    },
    direction: {
      type: String,
      enum: ["CREDIT", "DEBIT", "HOLD", "RELEASE", "CAPTURE"],
      required: true,
    },
    amount: { type: Number, required: true },
    availableBefore: { type: Number, required: true },
    availableAfter: { type: Number, required: true },
    holdBefore: { type: Number, required: true },
    holdAfter: { type: Number, required: true },
    status: { type: String, enum: ["SUCCESS", "FAILED"], default: "SUCCESS" },
    referenceType: { type: String, default: "" },
    referenceId: { type: String, default: "" },
    idempotencyKey: { type: String, unique: true, sparse: true },
    metadata: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

WalletTransactionSchema.index({ referenceType: 1, referenceId: 1 });

module.exports = mongoose.model("WalletTransaction", WalletTransactionSchema);
