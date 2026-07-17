var mongoose = require("../db");
var models = require("../models/wallet");
var Wallet = models.Wallet;
var WalletOperation = models.WalletOperation;
var WalletTransaction = models.WalletTransaction;
var TreasuryAlert = models.TreasuryAlert;
var { apiError } = require("../utils/apiResponse");

function asInteger(value, field) {
  var number = Number(value || 0);
  if (!Number.isSafeInteger(number)) {
    throw apiError((field || "Số tiền") + " phải là số nguyên VND", 400);
  }
  return number;
}

function requirePositiveInteger(value, field) {
  var number = asInteger(value, field);
  if (number <= 0) throw apiError((field || "Số tiền") + " phải lớn hơn 0", 400);
  return number;
}

function mapWallet(wallet) {
  if (!wallet) return null;
  var available = Number(wallet.availableBalance || 0);
  var hold = Number(wallet.holdBalance || 0);
  return {
    id: String(wallet._id),
    ownerType: wallet.ownerType,
    accountClass: wallet.accountClass || (wallet.ownerType === "SYSTEM" ? "TREASURY_ASSET" : "USER_LIABILITY"),
    userId: wallet.userId ? String(wallet.userId) : null,
    currency: wallet.currency || "VND",
    availableBalance: available,
    holdBalance: hold,
    totalBalance: available + hold,
    status: wallet.status || "ACTIVE",
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}

function mapTransaction(tx) {
  var availableDelta = Number(tx.availableDelta != null ? tx.availableDelta : tx.amount || 0);
  var holdDelta = Number(tx.holdDelta || 0);
  var legacyAmount = Number(tx.amount || 0);
  return {
    id: String(tx._id),
    operationId: tx.operationId ? String(tx.operationId) : null,
    postingIndex: Number(tx.postingIndex || 0),
    walletId: String(tx.walletId),
    userId: tx.userId ? String(tx.userId) : null,
    type: tx.type,
    operationType: tx.operationType || tx.type,
    direction: availableDelta < 0 || (availableDelta === 0 && holdDelta < 0) ? "DEBIT" : "CREDIT",
    amount: Math.abs(legacyAmount),
    availableDelta: availableDelta,
    holdDelta: holdDelta,
    balanceAfter: Number(tx.balanceAfter || 0),
    availableAfter: Number(tx.availableAfter != null ? tx.availableAfter : tx.balanceAfter || 0),
    holdAfter: Number(tx.holdAfter || 0),
    status: "SUCCESS",
    referenceType: tx.referenceType || "",
    referenceId: tx.referenceId || "",
    description: tx.description || "",
    note: tx.description || "",
    createdAt: tx.createdAt,
  };
}

function walletDefaults(ownerType, userId) {
  return {
    ownerType: ownerType,
    userId: userId || null,
    accountClass: ownerType === "SYSTEM" ? "TREASURY_ASSET" : "USER_LIABILITY",
    availableBalance: 0,
    holdBalance: 0,
    status: "ACTIVE",
  };
}

async function getOrCreateWallet(query, defaults, session) {
  var options = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (session) options.session = session;
  return Wallet.findOneAndUpdate(
    Object.assign({ status: { $in: ["ACTIVE", "FROZEN"] } }, query),
    { $setOnInsert: Object.assign({}, defaults, query) },
    options,
  ).exec();
}

async function getUserWallet(userId, session) {
  if (!userId) throw apiError("Thiếu userId của ví", 400);
  return getOrCreateWallet(
    { ownerType: "USER", userId: userId },
    walletDefaults("USER", userId),
    session,
  );
}

async function getSystemWallet(session) {
  return getOrCreateWallet(
    { ownerType: "SYSTEM" },
    walletDefaults("SYSTEM", null),
    session,
  );
}

function validateOperation(payload) {
  if (!payload || !String(payload.idempotencyKey || "").trim()) {
    throw apiError("Thiếu Idempotency-Key", 400);
  }
  if (!payload.type) throw apiError("Thiếu loại nghiệp vụ ví", 400);
  if (!Array.isArray(payload.postings) || !payload.postings.length) {
    throw apiError("Nghiệp vụ ví phải có ít nhất một posting", 400);
  }
  payload.postings.forEach(function (posting, index) {
    var availableDelta = asInteger(posting.availableDelta, "availableDelta posting " + index);
    var holdDelta = asInteger(posting.holdDelta, "holdDelta posting " + index);
    if (availableDelta === 0 && holdDelta === 0 && ["OPENING_BALANCE", "LEGACY_IMPORTED"].indexOf(payload.type) === -1) {
      throw apiError("Posting phải làm thay đổi số dư", 400);
    }
    if (!posting.walletId && !posting.ownerType) {
      throw apiError("Posting thiếu walletId hoặc ownerType", 400);
    }
    if (posting.ownerType === "USER" && !posting.userId) {
      throw apiError("Posting USER thiếu userId", 400);
    }
  });
}

async function resolvePostingWallet(posting, session) {
  if (posting.walletId) {
    var wallet = await Wallet.findById(posting.walletId).session(session).exec();
    if (!wallet) throw apiError("Không tìm thấy ví", 404);
    return wallet;
  }
  if (posting.ownerType === "SYSTEM") return getSystemWallet(session);
  return getUserWallet(posting.userId, session);
}

async function applyPosting(operation, payload, posting, index, session) {
  var wallet = await resolvePostingWallet(posting, session);
  var availableDelta = asInteger(posting.availableDelta, "availableDelta");
  var holdDelta = asInteger(posting.holdDelta, "holdDelta");
  var filter = { _id: wallet._id };

  if (wallet.ownerType === "USER") {
    if (availableDelta < 0) filter.availableBalance = { $gte: Math.abs(availableDelta) };
    if (holdDelta < 0) filter.holdBalance = { $gte: Math.abs(holdDelta) };
  }

  var updated = await Wallet.findOneAndUpdate(
    filter,
    { $inc: { availableBalance: availableDelta, holdBalance: holdDelta } },
    { new: true, session: session },
  ).exec();

  if (!updated) throw apiError("Số dư available/hold không đủ", 400);

  var legacyAmount = posting.amount;
  if (legacyAmount == null) legacyAmount = availableDelta !== 0 ? availableDelta : holdDelta;
  legacyAmount = asInteger(legacyAmount, "amount");

  var docs = await WalletTransaction.create(
    [
      {
        walletId: updated._id,
        userId: posting.userId || updated.userId,
        operationId: operation._id,
        postingIndex: index,
        type: posting.transactionType || payload.transactionType || "FEE",
        operationType: payload.type,
        amount: legacyAmount,
        balanceAfter: updated.availableBalance,
        availableDelta: availableDelta,
        holdDelta: holdDelta,
        availableAfter: updated.availableBalance,
        holdAfter: updated.holdBalance,
        referenceType: payload.referenceType || "",
        referenceId: payload.referenceId || "",
        description: posting.description || payload.description || "",
      },
    ],
    { session: session },
  );
  if (updated.ownerType === "SYSTEM" && Number(updated.availableBalance) < 0 && availableDelta < 0) {
    await TreasuryAlert.create([{
      operationId: operation._id,
      postingIndex: index,
      balance: updated.availableBalance,
      delta: availableDelta,
      message: "Treasury âm hoặc giảm sâu hơn sau " + payload.type,
    }], { session: session });
  }
  return { wallet: updated, transaction: docs[0] };
}

async function executeInSession(payload, session) {
  validateOperation(payload);
  var key = String(payload.idempotencyKey).trim();
  var existing = await WalletOperation.findOne({ idempotencyKey: key }).session(session).exec();
  if (existing && existing.status === "COMPLETED") {
    var previous = await WalletTransaction.find({ operationId: existing._id })
      .sort({ postingIndex: 1 })
      .session(session)
      .exec();
    return { operation: existing, postings: previous, idempotent: true };
  }
  if (existing) throw apiError("Nghiệp vụ ví đang được xử lý", 409);

  var operations = await WalletOperation.create(
    [
      {
        idempotencyKey: key,
        type: payload.type,
        status: "PROCESSING",
        referenceType: payload.referenceType || "",
        referenceId: payload.referenceId || "",
        actorId: payload.actorId || null,
        metadata: payload.metadata || {},
      },
    ],
    { session: session },
  );
  var operation = operations[0];
  var results = [];
  for (var i = 0; i < payload.postings.length; i += 1) {
    results.push(await applyPosting(operation, payload, payload.postings[i], i, session));
  }

  if (typeof payload.mutateDomain === "function") {
    await payload.mutateDomain(session, operation, results);
  }

  operation.status = "COMPLETED";
  operation.completedAt = new Date();
  await operation.save({ session: session });
  return {
    operation: operation,
    postings: results.map(function (item) { return item.transaction; }),
    wallets: results.map(function (item) { return item.wallet; }),
    idempotent: false,
  };
}

async function executeOperation(payload, options) {
  options = options || {};
  if (options.session) return executeInSession(payload, options.session);
  try {
    // `session.withTransaction()` resolves with the raw commit ack, not the
    // callback's return value, so the result must be captured via closure.
    var captured;
    await mongoose.connection.transaction(async function (session) {
      captured = await executeInSession(payload, session);
      return captured;
    });
    return captured;
  } catch (err) {
    if (err && err.code === 11000) {
      var existing = await WalletOperation.findOne({ idempotencyKey: String(payload.idempotencyKey || "").trim() }).exec();
      if (existing && existing.status === "COMPLETED") {
        var previous = await WalletTransaction.find({ operationId: existing._id }).sort({ postingIndex: 1 }).exec();
        return { operation: existing, postings: previous, idempotent: true };
      }
    }
    throw err;
  }
}

async function recordTransaction(wallet, payload) {
  var key = payload.idempotencyKey || ["legacy", payload.type, payload.referenceType || "", payload.referenceId || "", wallet._id].join(":");
  var result = await executeOperation({
    idempotencyKey: key,
    type: payload.operationType || payload.type,
    referenceType: payload.referenceType,
    referenceId: payload.referenceId,
    description: payload.description,
    postings: [{
      walletId: wallet._id,
      userId: payload.userId || wallet.userId,
      transactionType: payload.type,
      availableDelta: asInteger(payload.amount, "amount"),
      holdDelta: 0,
    }],
  });
  return { wallet: result.wallets && result.wallets[0], transaction: result.postings[0], operation: result.operation };
}

async function holdStake(userId, amount, reference) {
  amount = requirePositiveInteger(amount, "Tiền cược");
  var result = await executeOperation({
    idempotencyKey: reference.idempotencyKey || "bet:place:" + reference.referenceId,
    type: "BET_PLACE",
    referenceType: reference.referenceType || "BET",
    referenceId: reference.referenceId || "",
    actorId: userId,
    postings: [{ ownerType: "USER", userId: userId, transactionType: "BET_STAKE", availableDelta: -amount, holdDelta: amount, description: reference.description || "Giữ tiền cược" }],
    mutateDomain: reference.mutateDomain,
  });
  return result.wallets && result.wallets[0];
}

async function payReferee(refereeId, amount, reference) {
  amount = Number(amount || 0);
  if (!refereeId || amount <= 0) return null;
  requirePositiveInteger(amount, "Thù lao trọng tài");
  return executeOperation({
    idempotencyKey: reference.idempotencyKey || "race:referee:" + reference.referenceId + ":" + refereeId,
    type: "REFEREE_PAYOUT",
    referenceType: reference.referenceType || "RACE",
    referenceId: reference.referenceId || "",
    postings: [
      { ownerType: "USER", userId: refereeId, transactionType: "REFEREE_FEE", availableDelta: amount, holdDelta: 0, description: reference.description || "Thù lao trọng tài" },
      { ownerType: "SYSTEM", transactionType: "REFEREE_FEE", availableDelta: -amount, holdDelta: 0, description: "Chi trả thù lao trọng tài" },
    ],
  });
}

async function settleBetWin(userId, stakeAmount, payoutAmount, reference) {
  stakeAmount = requirePositiveInteger(stakeAmount, "Tiền cược");
  payoutAmount = requirePositiveInteger(payoutAmount, "Tiền trả cược");
  var profit = payoutAmount - stakeAmount;
  var postings = [{ ownerType: "USER", userId: userId, transactionType: "BET_PAYOUT", availableDelta: payoutAmount, holdDelta: -stakeAmount, description: reference.description || "Thắng cược" }];
  if (profit > 0) postings.push({ ownerType: "SYSTEM", transactionType: "BET_PAYOUT", availableDelta: -profit, holdDelta: 0, description: "Chi trả lợi nhuận cược" });
  return executeOperation({ idempotencyKey: reference.idempotencyKey || "bet:settle:win:" + reference.referenceId, type: "BET_WIN", referenceType: reference.referenceType || "BET", referenceId: reference.referenceId || "", postings: postings, mutateDomain: reference.mutateDomain });
}

async function settleBetLoss(userId, stakeAmount, reference) {
  stakeAmount = requirePositiveInteger(stakeAmount, "Tiền cược");
  return executeOperation({
    idempotencyKey: reference.idempotencyKey || "bet:settle:loss:" + reference.referenceId,
    type: "BET_LOSS",
    referenceType: reference.referenceType || "BET",
    referenceId: reference.referenceId || "",
    postings: [
      { ownerType: "USER", userId: userId, transactionType: "BET_STAKE", availableDelta: 0, holdDelta: -stakeAmount, description: reference.description || "Thua cược" },
      { ownerType: "SYSTEM", transactionType: "BET_STAKE", availableDelta: stakeAmount, holdDelta: 0, description: "Thu tiền cược thua" },
    ],
    mutateDomain: reference.mutateDomain,
  });
}

async function refundStake(userId, stakeAmount, reference) {
  stakeAmount = requirePositiveInteger(stakeAmount, "Tiền cược");
  return executeOperation({
    idempotencyKey: reference.idempotencyKey || "bet:settle:refund:" + reference.referenceId,
    type: "BET_REFUND",
    referenceType: reference.referenceType || "BET",
    referenceId: reference.referenceId || "",
    postings: [{ ownerType: "USER", userId: userId, transactionType: "BET_REFUND", availableDelta: stakeAmount, holdDelta: -stakeAmount, description: reference.description || "Hoàn tiền cược" }],
    mutateDomain: reference.mutateDomain,
  });
}

module.exports = {
  asInteger: asInteger,
  requirePositiveInteger: requirePositiveInteger,
  validateOperation: validateOperation,
  mapWallet: mapWallet,
  mapTransaction: mapTransaction,
  getUserWallet: getUserWallet,
  getSystemWallet: getSystemWallet,
  executeOperation: executeOperation,
  executeInSession: executeInSession,
  recordTransaction: recordTransaction,
  holdStake: holdStake,
  payReferee: payReferee,
  settleBetWin: settleBetWin,
  settleBetLoss: settleBetLoss,
  refundStake: refundStake,
};
