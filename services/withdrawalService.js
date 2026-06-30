var WithdrawalRequest = require("../models/withdrawalRequest");
var AdminWalletWithdrawal = require("../models/adminWalletWithdrawal");
var paymentService = require("./paymentService");
var walletService = require("./walletService");

function validateAmount(amount) {
  var value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    var err = new Error("Amount must be greater than zero");
    err.status = 400;
    throw err;
  }
  return value;
}

function requireBank(payload) {
  ["bankName", "bankAccountNumber", "bankAccountName"].forEach(function (field) {
    if (!payload[field]) {
      var err = new Error(field + " is required");
      err.status = 400;
      throw err;
    }
  });
}

function mapWithdrawal(item) {
  if (!item) return null;
  return {
    id: String(item._id),
    userId: String(item.userId),
    amount: item.amount,
    currency: item.currency,
    status: item.status,
    bankName: item.bankName,
    bankAccountNumber: item.bankAccountNumber,
    bankAccountName: item.bankAccountName,
    reason: item.reason || "",
    adminNote: item.adminNote || "",
    approvedBy: item.approvedBy ? String(item.approvedBy) : null,
    rejectedBy: item.rejectedBy ? String(item.rejectedBy) : null,
    paidBy: item.paidBy ? String(item.paidBy) : null,
    approvedAt: item.approvedAt || null,
    rejectedAt: item.rejectedAt || null,
    paidAt: item.paidAt || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapAdminWithdrawal(item) {
  if (!item) return null;
  return {
    id: String(item._id),
    adminId: String(item.adminId),
    amount: item.amount,
    currency: item.currency,
    status: item.status,
    bankName: item.bankName,
    bankAccountNumber: item.bankAccountNumber,
    bankAccountName: item.bankAccountName,
    reason: item.reason || "",
    paidAt: item.paidAt,
    createdAt: item.createdAt,
  };
}

async function createUserWithdrawal(user, payload) {
  var amount = validateAmount(payload.amount);
  requireBank(payload);
  var withdrawal = await WithdrawalRequest.create({
    userId: user._id,
    amount: amount,
    currency: "VND",
    status: "PENDING",
    bankName: payload.bankName,
    bankAccountNumber: payload.bankAccountNumber,
    bankAccountName: payload.bankAccountName,
    reason: payload.reason || "",
  });

  var referenceId = String(withdrawal._id);
  await walletService.hold(
    user._id,
    amount,
    "WITHDRAW",
    "USER_WITHDRAWAL",
    referenceId,
    "withdraw:user:hold:" + referenceId,
    "",
    "Withdrawal requested",
  );

  return mapWithdrawal(withdrawal);
}

async function listUserWithdrawals(userId) {
  var items = await WithdrawalRequest.find({ userId: userId }).sort({ createdAt: -1 }).exec();
  return items.map(mapWithdrawal);
}

async function getUserWithdrawal(userId, id) {
  return mapWithdrawal(await WithdrawalRequest.findOne({ _id: id, userId: userId }).exec());
}

async function listAdminWithdrawals(status) {
  var query = {};
  if (status) query.status = status;
  var items = await WithdrawalRequest.find(query).sort({ createdAt: -1 }).exec();
  return items.map(mapWithdrawal);
}

async function getAdminWithdrawal(id) {
  return mapWithdrawal(await WithdrawalRequest.findById(id).exec());
}

async function approve(id, admin, payload) {
  var item = await WithdrawalRequest.findById(id).exec();
  if (!item) return null;
  if (item.status !== "PENDING") {
    var err = new Error("Only pending withdrawals can be approved");
    err.status = 400;
    throw err;
  }
  item.status = "APPROVED";
  item.approvedBy = admin._id;
  item.approvedAt = new Date();
  item.adminNote = payload.note || "";
  await item.save();
  return mapWithdrawal(item);
}

async function reject(id, admin, payload) {
  var item = await WithdrawalRequest.findById(id).exec();
  if (!item) return null;
  if (item.status !== "PENDING" && item.status !== "APPROVED") {
    var err = new Error("Only pending or approved withdrawals can be rejected");
    err.status = 400;
    throw err;
  }
  var referenceId = String(item._id);
  await walletService.release(
    item.userId,
    item.amount,
    "REFUND",
    "USER_WITHDRAWAL",
    referenceId,
    "withdraw:user:release:" + referenceId,
    "",
    "Withdrawal rejected",
  );
  item.status = "REJECTED";
  item.rejectedBy = admin._id;
  item.rejectedAt = new Date();
  item.adminNote = payload.note || "";
  await item.save();
  return mapWithdrawal(item);
}

async function markPaid(id, admin, payload) {
  var item = await WithdrawalRequest.findById(id).exec();
  if (!item) return null;
  if (item.status !== "APPROVED") {
    var err = new Error("Only approved withdrawals can be marked paid");
    err.status = 400;
    throw err;
  }
  var referenceId = String(item._id);
  await walletService.capture(
    item.userId,
    item.amount,
    "WITHDRAW",
    "USER_WITHDRAWAL",
    referenceId,
    "withdraw:user:capture:" + referenceId,
    "",
    "Withdrawal paid",
  );
  await walletService.debitAdmin(
    item.amount,
    "WITHDRAW",
    "USER_WITHDRAWAL",
    referenceId,
    "withdraw:admin:debit:" + referenceId,
    "",
    "User withdrawal paid",
  );
  item.status = "PAID";
  item.paidBy = admin._id;
  item.paidAt = new Date();
  item.adminNote = payload.note || "";
  await item.save();
  return mapWithdrawal(item);
}

async function createAdminWithdrawal(admin, payload) {
  var amount = validateAmount(payload.amount);
  requireBank(payload);
  var item = await AdminWalletWithdrawal.create({
    adminId: admin._id,
    amount: amount,
    currency: "VND",
    status: "PAID",
    bankName: payload.bankName,
    bankAccountNumber: payload.bankAccountNumber,
    bankAccountName: payload.bankAccountName,
    reason: payload.reason || "",
    paidAt: new Date(),
  });

  await walletService.debitAdmin(
    amount,
    "ADMIN_WITHDRAW",
    "ADMIN_WALLET_WITHDRAWAL",
    String(item._id),
    "admin-withdraw:debit:" + item._id,
    "",
    "Admin wallet withdrawal",
  );

  return mapAdminWithdrawal(item);
}

async function listAdminWalletWithdrawals() {
  var items = await AdminWalletWithdrawal.find({}).sort({ createdAt: -1 }).exec();
  return items.map(mapAdminWithdrawal);
}

module.exports = {
  approve: approve,
  createAdminWithdrawal: createAdminWithdrawal,
  createUserWithdrawal: createUserWithdrawal,
  currentUserOrThrow: paymentService.currentUserOrThrow,
  getAdminWithdrawal: getAdminWithdrawal,
  getUserWithdrawal: getUserWithdrawal,
  listAdminWalletWithdrawals: listAdminWalletWithdrawals,
  listAdminWithdrawals: listAdminWithdrawals,
  listUserWithdrawals: listUserWithdrawals,
  markPaid: markPaid,
  reject: reject,
};
