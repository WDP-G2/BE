var Wallet = require("../models/wallet");
var WalletTransaction = require("../models/walletTransaction");

function toAmount(value) {
  var amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    var err = new Error("Amount must be greater than zero");
    err.status = 400;
    throw err;
  }
  return Math.round(amount * 100) / 100;
}

function walletDto(wallet) {
  if (!wallet) return null;
  return {
    id: String(wallet._id),
    ownerType: wallet.ownerType,
    userId: wallet.userId ? String(wallet.userId) : null,
    currency: wallet.currency || "VND",
    availableBalance: wallet.availableBalance || 0,
    holdBalance: wallet.holdBalance || 0,
    totalBalance: (wallet.availableBalance || 0) + (wallet.holdBalance || 0),
    status: wallet.status || "ACTIVE",
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
}

function transactionDto(transaction) {
  if (!transaction) return null;
  return {
    id: String(transaction._id),
    walletId: String(transaction.walletId),
    userId: transaction.userId ? String(transaction.userId) : null,
    type: transaction.type,
    direction: transaction.direction,
    amount: transaction.amount,
    availableBefore: transaction.availableBefore,
    availableAfter: transaction.availableAfter,
    holdBefore: transaction.holdBefore,
    holdAfter: transaction.holdAfter,
    status: transaction.status,
    referenceType: transaction.referenceType,
    referenceId: transaction.referenceId,
    idempotencyKey: transaction.idempotencyKey,
    metadata: transaction.metadata,
    note: transaction.note,
    createdAt: transaction.createdAt,
  };
}

async function getOrCreateUserWallet(userId) {
  var wallet = await Wallet.findOne({ ownerType: "USER", userId: userId }).exec();
  if (wallet) return wallet;
  return Wallet.create({
    ownerType: "USER",
    userId: userId,
    currency: "VND",
    availableBalance: 0,
    holdBalance: 0,
    status: "ACTIVE",
  });
}

async function getOrCreateAdminWallet() {
  var wallet = await Wallet.findOne({ ownerType: "ADMIN" }).sort({ createdAt: 1 }).exec();
  if (wallet) return wallet;
  return Wallet.create({
    ownerType: "ADMIN",
    currency: "VND",
    availableBalance: 0,
    holdBalance: 0,
    status: "ACTIVE",
  });
}

async function getCurrentUserWallet(userId) {
  return walletDto(await getOrCreateUserWallet(userId));
}

async function getCurrentUserTransactions(userId) {
  var wallet = await getOrCreateUserWallet(userId);
  var transactions = await WalletTransaction.find({ walletId: wallet._id })
    .sort({ createdAt: -1 })
    .exec();
  return transactions.map(transactionDto);
}

async function getAdminWallet() {
  return walletDto(await getOrCreateAdminWallet());
}

async function getAdminWalletTransactions() {
  var wallet = await getOrCreateAdminWallet();
  var transactions = await WalletTransaction.find({ walletId: wallet._id })
    .sort({ createdAt: -1 })
    .exec();
  return transactions.map(transactionDto);
}

async function mutate(wallet, params) {
  var amount = toAmount(params.amount);
  if (params.idempotencyKey) {
    var existing = await WalletTransaction.findOne({
      idempotencyKey: params.idempotencyKey,
    }).exec();
    if (existing) return existing;
  }

  if (wallet.status !== "ACTIVE") {
    var inactive = new Error("Wallet is not active");
    inactive.status = 400;
    throw inactive;
  }

  var availableBefore = wallet.availableBalance || 0;
  var holdBefore = wallet.holdBalance || 0;
  var availableAfter = availableBefore;
  var holdAfter = holdBefore;

  if (params.direction === "CREDIT") {
    availableAfter += amount;
  } else if (params.direction === "DEBIT") {
    availableAfter -= amount;
  } else if (params.direction === "HOLD") {
    availableAfter -= amount;
    holdAfter += amount;
  } else if (params.direction === "RELEASE") {
    holdAfter -= amount;
    availableAfter += amount;
  } else if (params.direction === "CAPTURE") {
    holdAfter -= amount;
  }

  if (!params.allowNegativeAvailable && availableAfter < 0) {
    var insufficient = new Error("Wallet balance is insufficient");
    insufficient.status = 400;
    throw insufficient;
  }
  if (holdAfter < 0) {
    var holdInsufficient = new Error("Wallet hold balance is insufficient");
    holdInsufficient.status = 400;
    throw holdInsufficient;
  }

  wallet.availableBalance = Math.round(availableAfter * 100) / 100;
  wallet.holdBalance = Math.round(holdAfter * 100) / 100;
  await wallet.save();

  return WalletTransaction.create({
    walletId: wallet._id,
    userId: wallet.userId,
    type: params.type,
    direction: params.direction,
    amount: amount,
    availableBefore: availableBefore,
    availableAfter: wallet.availableBalance,
    holdBefore: holdBefore,
    holdAfter: wallet.holdBalance,
    referenceType: params.referenceType || "",
    referenceId: params.referenceId || "",
    idempotencyKey: params.idempotencyKey || undefined,
    metadata: params.metadata || "",
    note: params.note || "",
  });
}

async function mutateUser(userId, amount, type, direction, referenceType, referenceId, idempotencyKey, metadata, note, allowNegativeAvailable) {
  var wallet = await getOrCreateUserWallet(userId);
  return mutate(wallet, {
    amount: amount,
    type: type,
    direction: direction,
    referenceType: referenceType,
    referenceId: referenceId,
    idempotencyKey: idempotencyKey,
    metadata: metadata,
    note: note,
    allowNegativeAvailable: allowNegativeAvailable,
  });
}

async function mutateAdmin(amount, type, direction, referenceType, referenceId, idempotencyKey, metadata, note) {
  var wallet = await getOrCreateAdminWallet();
  return mutate(wallet, {
    amount: amount,
    type: type,
    direction: direction,
    referenceType: referenceType,
    referenceId: referenceId,
    idempotencyKey: idempotencyKey,
    metadata: metadata,
    note: note,
  });
}

module.exports = {
  capture: function (userId, amount, type, referenceType, referenceId, idempotencyKey, metadata, note) {
    return mutateUser(userId, amount, type, "CAPTURE", referenceType, referenceId, idempotencyKey, metadata, note);
  },
  captureAdmin: function (amount, type, referenceType, referenceId, idempotencyKey, metadata, note) {
    return mutateAdmin(amount, type, "CAPTURE", referenceType, referenceId, idempotencyKey, metadata, note);
  },
  credit: function (userId, amount, type, referenceType, referenceId, idempotencyKey, metadata, note) {
    return mutateUser(userId, amount, type, "CREDIT", referenceType, referenceId, idempotencyKey, metadata, note);
  },
  creditAdmin: function (amount, type, referenceType, referenceId, idempotencyKey, metadata, note) {
    return mutateAdmin(amount, type, "CREDIT", referenceType, referenceId, idempotencyKey, metadata, note);
  },
  debit: function (userId, amount, type, referenceType, referenceId, idempotencyKey, metadata, note) {
    return mutateUser(userId, amount, type, "DEBIT", referenceType, referenceId, idempotencyKey, metadata, note);
  },
  debitAdmin: function (amount, type, referenceType, referenceId, idempotencyKey, metadata, note) {
    return mutateAdmin(amount, type, "DEBIT", referenceType, referenceId, idempotencyKey, metadata, note);
  },
  getAdminWallet: getAdminWallet,
  getAdminWalletTransactions: getAdminWalletTransactions,
  getCurrentUserTransactions: getCurrentUserTransactions,
  getCurrentUserWallet: getCurrentUserWallet,
  getOrCreateAdminWallet: getOrCreateAdminWallet,
  getOrCreateUserWallet: getOrCreateUserWallet,
  holdAdmin: function (amount, type, referenceType, referenceId, idempotencyKey, metadata, note) {
    return mutateAdmin(amount, type, "HOLD", referenceType, referenceId, idempotencyKey, metadata, note);
  },
  hold: function (userId, amount, type, referenceType, referenceId, idempotencyKey, metadata, note) {
    return mutateUser(userId, amount, type, "HOLD", referenceType, referenceId, idempotencyKey, metadata, note);
  },
  releaseAdmin: function (amount, type, referenceType, referenceId, idempotencyKey, metadata, note) {
    return mutateAdmin(amount, type, "RELEASE", referenceType, referenceId, idempotencyKey, metadata, note);
  },
  release: function (userId, amount, type, referenceType, referenceId, idempotencyKey, metadata, note) {
    return mutateUser(userId, amount, type, "RELEASE", referenceType, referenceId, idempotencyKey, metadata, note);
  },
  transactionDto: transactionDto,
  walletDto: walletDto,
};
