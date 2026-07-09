var mongoose = require("../db");
var Schema = mongoose.Schema;

var WalletSchema = new Schema(
  {
    ownerType: {
      type: String,
      enum: ["USER", "SYSTEM"],
      default: "USER",
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    currency: { type: String, default: "VND" },
    availableBalance: { type: Number, default: 0 },
    holdBalance: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["ACTIVE", "FROZEN"],
      default: "ACTIVE",
    },
  },
  { timestamps: true },
);

WalletSchema.virtual("totalBalance").get(function () {
  return Number(this.availableBalance || 0) + Number(this.holdBalance || 0);
});

WalletSchema.set("toJSON", { virtuals: true });
WalletSchema.set("toObject", { virtuals: true });

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
        "BET_STAKE",
        "BET_PAYOUT",
        "BET_REFUND",
        "PRIZE",
        "FEE",
        "HOLD",
        "RELEASE",
        "REFEREE_FEE",
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, default: 0 },
    referenceType: { type: String, default: "" },
    referenceId: { type: String, default: "" },
    description: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

var DepositOrderSchema = new Schema(
  {
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "VND" },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "CANCELLED", "EXPIRED"],
      default: "PENDING",
    },
    provider: { type: String, default: "ZALOPAY" },
    paymentMethod: { type: String, default: "ZALOPAY" },
    paymentChannel: {
      type: String,
      enum: ["QR", "VISA", "WALLET"],
      default: "QR",
    },
    depositTarget: {
      type: String,
      enum: ["USER", "SYSTEM"],
      default: "USER",
      index: true,
    },
    orderCode: { type: Number, index: true },
    paymentLinkId: { type: String, default: "", index: true },
    providerTransactionId: { type: String, default: "" },
    externalOrderId: { type: String, default: "" },
    referenceCode: { type: String, default: "", index: true },
    transferContent: { type: String, default: "" },
    checkoutUrl: { type: String, default: "" },
    cashierOrderUrl: { type: String, default: "" },
    orderUrl: { type: String, default: "" },
    qrCode: { type: String, default: "" },
    metadata: { type: String, default: "" },
    paidAt: { type: Date },
    expiredAt: { type: Date },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

var WithdrawalSchema = new Schema(
  {
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "PAID"],
      default: "PENDING",
    },
    bankAccount: { type: String, default: "" },
    bankName: { type: String, default: "" },
    accountName: { type: String, default: "" },
    note: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);

module.exports = {
  Wallet: mongoose.model("Wallet", WalletSchema),
  WalletTransaction: mongoose.model("WalletTransaction", WalletTransactionSchema),
  DepositOrder: mongoose.model("DepositOrder", DepositOrderSchema),
  Withdrawal: mongoose.model("Withdrawal", WithdrawalSchema),
};
