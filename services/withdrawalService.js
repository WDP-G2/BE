var { Withdrawal } = require("../models/wallet");
var { executeOperation, requirePositiveInteger } = require("./walletLedger");
var { apiError } = require("../utils/apiResponse");
var featureFlags = require("./financialFeatureFlags");

function requireKey(value) {
  var key = String(value || "").trim();
  if (!key) throw apiError("Thiếu Idempotency-Key", 400);
  if (key.length > 200) throw apiError("Idempotency-Key quá dài", 400);
  return key;
}

function mapWithdrawal(item) {
  return {
    id: String(item._id),
    userId: item.userId ? String(item.userId) : null,
    amount: Number(item.amount || 0),
    status: item.status,
    bankAccount: item.bankAccount || "",
    bankName: item.bankName || "",
    accountName: item.accountName || "",
    note: item.note || "",
    reviewedBy: item.reviewedBy ? String(item.reviewedBy) : null,
    reviewedAt: item.reviewedAt || null,
    approvedAt: item.approvedAt || null,
    rejectedAt: item.rejectedAt || null,
    paidAt: item.paidAt || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function createUserWithdrawal(input) {
  featureFlags.assertEnabled("WITHDRAWAL");
  var amount = requirePositiveInteger(input.amount, "Số tiền rút");
  var key = requireKey(input.idempotencyKey);
  var result = await executeOperation({
    idempotencyKey: "withdrawal:request:" + input.userId + ":" + key,
    type: "WITHDRAWAL_REQUEST",
    referenceType: "WITHDRAWAL",
    referenceId: key,
    actorId: input.userId,
    postings: [{
      ownerType: "USER",
      userId: input.userId,
      transactionType: "WITHDRAWAL_HOLD",
      availableDelta: -amount,
      holdDelta: amount,
      description: "Giữ tiền chờ duyệt rút",
    }],
    mutateDomain: async function (session, operation, postings) {
      await Withdrawal.create([{
        walletId: postings[0].wallet._id,
        userId: input.userId,
        amount: amount,
        status: "PENDING",
        bankAccount: input.bankAccount || "",
        bankName: input.bankName || "",
        accountName: input.accountName || "",
        note: input.note || "",
        requestOperationId: operation._id,
      }], { session: session });
    },
  });
  return Withdrawal.findOne({ requestOperationId: result.operation._id }).exec();
}

async function approveWithdrawal(id, adminId, idempotencyKey) {
  var key = requireKey(idempotencyKey);
  var current = await Withdrawal.findById(id).exec();
  if (!current) throw apiError("Không tìm thấy yêu cầu rút tiền", 404);
  if (current.status === "APPROVED" && current.approveIdempotencyKey === key) return current;
  if (current.status !== "PENDING") throw apiError("Chỉ yêu cầu PENDING mới được duyệt", 409);
  var updated = await Withdrawal.findOneAndUpdate(
    { _id: id, status: "PENDING" },
    { $set: { status: "APPROVED", reviewedBy: adminId, reviewedAt: new Date(), approvedAt: new Date(), approveIdempotencyKey: key } },
    { new: true },
  ).exec();
  if (!updated) throw apiError("Yêu cầu rút tiền đã được xử lý", 409);
  return updated;
}

async function rejectWithdrawal(id, adminId, idempotencyKey, note) {
  featureFlags.assertEnabled("WITHDRAWAL");
  var item = await Withdrawal.findById(id).exec();
  if (!item) throw apiError("Không tìm thấy yêu cầu rút tiền", 404);
  if (item.status === "REJECTED" && item.transitionOperationId) return item;
  if (item.status !== "PENDING") throw apiError("Chỉ yêu cầu PENDING mới được từ chối", 409);
  var amount = requirePositiveInteger(item.amount, "Số tiền rút");
  var result = await executeOperation({
    idempotencyKey: "withdrawal:reject:" + id + ":" + requireKey(idempotencyKey),
    type: "WITHDRAWAL_REJECT",
    referenceType: "WITHDRAWAL",
    referenceId: String(id),
    actorId: adminId,
    postings: [{ ownerType: "USER", userId: item.userId, transactionType: "WITHDRAWAL_RELEASE", availableDelta: amount, holdDelta: -amount, description: "Hoàn tiền rút bị từ chối" }],
    mutateDomain: async function (session, operation) {
      var updated = await Withdrawal.findOneAndUpdate(
        { _id: id, status: "PENDING" },
        { $set: { status: "REJECTED", note: note || item.note, reviewedBy: adminId, reviewedAt: new Date(), rejectedAt: new Date(), transitionOperationId: operation._id } },
        { new: true, session: session },
      ).exec();
      if (!updated) throw apiError("Yêu cầu rút tiền đã được xử lý", 409);
    },
  });
  return Withdrawal.findOne({ _id: id, transitionOperationId: result.operation._id }).exec();
}

async function markWithdrawalPaid(id, adminId, idempotencyKey) {
  featureFlags.assertEnabled("WITHDRAWAL");
  var item = await Withdrawal.findById(id).exec();
  if (!item) throw apiError("Không tìm thấy yêu cầu rút tiền", 404);
  if (item.status === "PAID" && item.transitionOperationId) return item;
  if (item.status !== "APPROVED") throw apiError("Yêu cầu phải được duyệt trước khi xác nhận đã trả", 409);
  var amount = requirePositiveInteger(item.amount, "Số tiền rút");
  var result = await executeOperation({
    idempotencyKey: "withdrawal:paid:" + id + ":" + requireKey(idempotencyKey),
    type: "WITHDRAWAL_PAID",
    referenceType: "WITHDRAWAL",
    referenceId: String(id),
    actorId: adminId,
    postings: [
      { ownerType: "USER", userId: item.userId, transactionType: "WITHDRAW", availableDelta: 0, holdDelta: -amount, description: "Đã chi tiền rút cho người dùng" },
      { ownerType: "SYSTEM", transactionType: "WITHDRAW", availableDelta: -amount, holdDelta: 0, description: "Tiền thực trả cho người dùng" },
    ],
    mutateDomain: async function (session, operation) {
      var updated = await Withdrawal.findOneAndUpdate(
        { _id: id, status: "APPROVED" },
        { $set: { status: "PAID", paidAt: new Date(), reviewedBy: adminId, reviewedAt: new Date(), transitionOperationId: operation._id } },
        { new: true, session: session },
      ).exec();
      if (!updated) throw apiError("Yêu cầu rút tiền đã được xử lý", 409);
    },
  });
  return Withdrawal.findOne({ _id: id, transitionOperationId: result.operation._id }).exec();
}

async function createTreasuryWithdrawal(input) {
  featureFlags.assertEnabled("WITHDRAWAL");
  var amount = requirePositiveInteger(input.amount, "Số tiền rút");
  var result = await executeOperation({
    idempotencyKey: "treasury:withdraw:" + input.adminId + ":" + requireKey(input.idempotencyKey),
    type: "TREASURY_WITHDRAWAL",
    referenceType: "WITHDRAWAL",
    referenceId: input.idempotencyKey,
    actorId: input.adminId,
    postings: [{ ownerType: "SYSTEM", transactionType: "ADMIN_WITHDRAW", availableDelta: -amount, holdDelta: 0, description: "Admin rút quỹ hệ thống" }],
    mutateDomain: async function (session, operation, postings) {
      await Withdrawal.create([{
        walletId: postings[0].wallet._id,
        userId: input.adminId,
        amount: amount,
        status: "PAID",
        bankAccount: input.bankAccount || "",
        bankName: input.bankName || "",
        accountName: input.accountName || "",
        note: input.note || "Admin rút quỹ hệ thống",
        paidAt: new Date(),
        requestOperationId: operation._id,
        transitionOperationId: operation._id,
      }], { session: session });
    },
  });
  return Withdrawal.findOne({ requestOperationId: result.operation._id }).exec();
}

module.exports = {
  requireKey: requireKey,
  mapWithdrawal: mapWithdrawal,
  createUserWithdrawal: createUserWithdrawal,
  approveWithdrawal: approveWithdrawal,
  rejectWithdrawal: rejectWithdrawal,
  markWithdrawalPaid: markWithdrawalPaid,
  createTreasuryWithdrawal: createTreasuryWithdrawal,
};
