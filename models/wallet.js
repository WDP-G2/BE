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
    accountClass: {
      type: String,
      enum: ["USER_LIABILITY", "TREASURY_ASSET"],
      default: function () {
        return this.ownerType === "SYSTEM" ? "TREASURY_ASSET" : "USER_LIABILITY";
      },
      index: true,
    },
    availableBalance: { type: Number, default: 0 },
    holdBalance: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["ACTIVE", "FROZEN", "MERGED", "CLOSED"],
      default: "ACTIVE",
    },
    mergedInto: { type: Schema.Types.ObjectId, ref: "Wallet", default: null },
  },
  { timestamps: true },
);

WalletSchema.virtual("totalBalance").get(function () {
  return Number(this.availableBalance || 0) + Number(this.holdBalance || 0);
});

WalletSchema.set("toJSON", { virtuals: true });
WalletSchema.set("toObject", { virtuals: true });

// Production creates these indexes only after the duplicate-wallet migration.
WalletSchema.index(
  { ownerType: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerType: "USER", status: { $in: ["ACTIVE", "FROZEN"] } },
    name: "uniq_active_user_wallet",
  },
);
WalletSchema.index(
  { ownerType: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerType: "SYSTEM", status: { $in: ["ACTIVE", "FROZEN"] } },
    name: "uniq_active_treasury_wallet",
  },
);

var WalletOperationSchema = new Schema(
  {
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["PROCESSING", "COMPLETED", "FAILED"],
      default: "PROCESSING",
      index: true,
    },
    referenceType: { type: String, default: "", index: true },
    referenceId: { type: String, default: "", index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

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
        "ENTRY_FEE",
        "REGISTRATION_DEPOSIT",
        "JOCKEY_REWARD",
        "PRIZE_PAYOUT",
        "WITHDRAWAL_HOLD",
        "WITHDRAWAL_RELEASE",
        "OPENING_BALANCE",
        "LEGACY_IMPORTED",
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, default: 0 },
    operationId: { type: Schema.Types.ObjectId, ref: "WalletOperation", index: true },
    postingIndex: { type: Number, default: 0 },
    availableDelta: { type: Number, default: 0 },
    holdDelta: { type: Number, default: 0 },
    availableAfter: { type: Number, default: 0 },
    holdAfter: { type: Number, default: 0 },
    operationType: { type: String, default: "", index: true },
    referenceType: { type: String, default: "" },
    referenceId: { type: String, default: "" },
    description: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

WalletTransactionSchema.index(
  { operationId: 1, postingIndex: 1 },
  { unique: true, partialFilterExpression: { operationId: { $type: "objectId" } } },
);

var TreasuryAlertSchema = new Schema(
  {
    operationId: { type: Schema.Types.ObjectId, ref: "WalletOperation", required: true },
    postingIndex: { type: Number, required: true },
    balance: { type: Number, required: true },
    delta: { type: Number, required: true },
    status: { type: String, enum: ["OPEN", "ACKNOWLEDGED"], default: "OPEN", index: true },
    message: { type: String, default: "Treasury balance is negative" },
  },
  { timestamps: true },
);
TreasuryAlertSchema.index({ operationId: 1, postingIndex: 1 }, { unique: true });

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
    operationId: { type: Schema.Types.ObjectId, ref: "WalletOperation", default: null },
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
    approvedAt: { type: Date },
    paidAt: { type: Date },
    rejectedAt: { type: Date },
    requestOperationId: { type: Schema.Types.ObjectId, ref: "WalletOperation" },
    transitionOperationId: { type: Schema.Types.ObjectId, ref: "WalletOperation" },
    approveIdempotencyKey: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = {
  Wallet: mongoose.model("Wallet", WalletSchema),
  WalletOperation: mongoose.model("WalletOperation", WalletOperationSchema),
  WalletTransaction: mongoose.model("WalletTransaction", WalletTransactionSchema),
  TreasuryAlert: mongoose.model("TreasuryAlert", TreasuryAlertSchema),
  DepositOrder: mongoose.model("DepositOrder", DepositOrderSchema),
  Withdrawal: mongoose.model("Withdrawal", WithdrawalSchema),
};
