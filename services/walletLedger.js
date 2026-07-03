var { Wallet, WalletTransaction } = require("../models/wallet");
var { apiError } = require("../utils/apiResponse");

function mapWallet(wallet) {
  if (!wallet) return null;
  var available = Number(wallet.availableBalance || 0);
  var hold = Number(wallet.holdBalance || 0);
  return {
    id: String(wallet._id),
    ownerType: wallet.ownerType,
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
  var amount = Number(tx.amount || 0);
  return {
    id: String(tx._id),
    walletId: String(tx.walletId),
    userId: tx.userId ? String(tx.userId) : null,
    type: tx.type,
    direction: amount < 0 ? "DEBIT" : "CREDIT",
    amount: Math.abs(amount),
    balanceAfter: Number(tx.balanceAfter || 0),
    availableAfter: Number(tx.balanceAfter || 0),
    status: "SUCCESS",
    referenceType: tx.referenceType || "",
    referenceId: tx.referenceId || "",
    description: tx.description || "",
    note: tx.description || "",
    createdAt: tx.createdAt,
  };
}

async function getOrCreateWallet(query, defaults) {
  var wallet = await Wallet.findOne(query).exec();
  if (wallet) return wallet;
  wallet = new Wallet(Object.assign({}, defaults, query));
  await wallet.save();
  return wallet;
}

async function getUserWallet(userId) {
  return getOrCreateWallet({ ownerType: "USER", userId: userId }, {
    ownerType: "USER",
    userId: userId,
    availableBalance: 0,
    holdBalance: 0,
  });
}

async function getSystemWallet() {
  return getOrCreateWallet({ ownerType: "SYSTEM" }, {
    ownerType: "SYSTEM",
    availableBalance: 0,
    holdBalance: 0,
  });
}

async function recordTransaction(wallet, payload) {
  wallet.availableBalance = Number(wallet.availableBalance || 0) + Number(payload.amount || 0);
  if (wallet.availableBalance < 0) {
    throw apiError("Số dư không đủ", 400);
  }
  await wallet.save();

  var tx = await WalletTransaction.create({
    walletId: wallet._id,
    userId: payload.userId || wallet.userId,
    type: payload.type,
    amount: payload.amount,
    balanceAfter: wallet.availableBalance,
    referenceType: payload.referenceType || "",
    referenceId: payload.referenceId || "",
    description: payload.description || "",
  });

  return { wallet: wallet, transaction: tx };
}

async function holdStake(userId, amount, reference) {
  var wallet = await getUserWallet(userId);
  if (Number(wallet.availableBalance || 0) < amount) {
    throw apiError("Số dư ví không đủ để đặt cược", 400);
  }
  wallet.availableBalance -= amount;
  wallet.holdBalance = Number(wallet.holdBalance || 0) + amount;
  await wallet.save();

  await WalletTransaction.create({
    walletId: wallet._id,
    userId: userId,
    type: "BET_STAKE",
    amount: -amount,
    balanceAfter: wallet.availableBalance,
    referenceType: reference.referenceType || "BET",
    referenceId: reference.referenceId || "",
    description: reference.description || "Tiền cược",
  });

  return wallet;
}

module.exports = {
  mapWallet: mapWallet,
  mapTransaction: mapTransaction,
  getUserWallet: getUserWallet,
  getSystemWallet: getSystemWallet,
  recordTransaction: recordTransaction,
  holdStake: holdStake,
};
