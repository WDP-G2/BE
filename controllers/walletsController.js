var { DepositOrder, Withdrawal, WalletTransaction } = require("../models/wallet");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var {
  getUserWallet,
  mapWallet,
  mapTransaction,
  recordTransaction,
} = require("../services/walletLedger");

function mapDepositOrder(order) {
  return {
    id: String(order._id),
    amount: order.amount,
    status: order.status,
    referenceCode: order.referenceCode || "",
    transferContent: order.transferContent || "",
    expiredAt: order.expiredAt || null,
    createdAt: order.createdAt,
  };
}

async function getMyWallet(req, res) {
  var wallet = await getUserWallet(req.user.id);
  res.json(apiSuccess(mapWallet(wallet)));
}

async function listMyTransactions(req, res) {
  var wallet = await getUserWallet(req.user.id);
  var txs = await WalletTransaction.find({ walletId: wallet._id }).sort({ createdAt: -1 }).limit(100).exec();
  res.json(apiSuccess(txs.map(mapTransaction)));
}

async function createDepositOrder(req, res) {
  var amount = Number(req.body.amount || 0);
  if (amount <= 0) throw apiError("Số tiền không hợp lệ", 400);
  var wallet = await getUserWallet(req.user.id);
  var referenceCode = "NAP" + Date.now().toString(36).toUpperCase();
  var order = await DepositOrder.create({
    walletId: wallet._id,
    userId: req.user.id,
    amount: amount,
    status: "PAID",
    paymentMethod: req.body.paymentMethod || req.body.provider || "MANUAL",
    referenceCode: referenceCode,
    transferContent: referenceCode + " " + req.user.id,
    expiredAt: new Date(Date.now() + 15 * 60 * 1000),
    note: req.body.note || "Nạp tiền thủ công",
  });
  await recordTransaction(wallet, {
    userId: req.user.id,
    type: "DEPOSIT",
    amount: amount,
    referenceType: "DEPOSIT_ORDER",
    referenceId: String(order._id),
    description: "Nạp tiền vào ví",
  });
  res.status(201).json(apiSuccess(mapDepositOrder(order), "Nạp tiền thành công"));
}

async function listMyDepositOrders(req, res) {
  var rows = await DepositOrder.find({ userId: req.user.id }).sort({ createdAt: -1 }).exec();
  res.json(apiSuccess(rows.map(function (o) {
    return { id: String(o._id), amount: o.amount, status: o.status, createdAt: o.createdAt };
  })));
}

async function getMyDepositOrder(req, res) {
  var order = await DepositOrder.findOne({ _id: req.params.id, userId: req.user.id }).exec();
  if (!order) throw apiError("Không tìm thấy lệnh nạp", 404);
  res.json(apiSuccess(mapDepositOrder(order)));
}

async function createWithdrawal(req, res) {
  var amount = Number(req.body.amount || 0);
  if (amount <= 0) throw apiError("Số tiền không hợp lệ", 400);
  var wallet = await getUserWallet(req.user.id);
  if (Number(wallet.availableBalance || 0) < amount) throw apiError("Số dư không đủ", 400);

  var item = await Withdrawal.create({
    walletId: wallet._id,
    userId: req.user.id,
    amount: amount,
    status: "PENDING",
    bankAccount: req.body.bankAccountNumber || req.body.bankAccount || "",
    bankName: req.body.bankName || "",
    accountName: req.body.bankAccountName || req.body.accountName || "",
    note: req.body.reason || "",
  });

  wallet.availableBalance -= amount;
  wallet.holdBalance = Number(wallet.holdBalance || 0) + amount;
  await wallet.save();

  res.status(201).json(apiSuccess({ id: String(item._id), amount: item.amount, status: item.status }, "Tạo yêu cầu rút tiền thành công"));
}

async function listMyWithdrawals(req, res) {
  var rows = await Withdrawal.find({ userId: req.user.id }).sort({ createdAt: -1 }).exec();
  res.json(apiSuccess(rows.map(function (w) {
    return { id: String(w._id), amount: w.amount, status: w.status, createdAt: w.createdAt };
  })));
}

module.exports = {
  getMyWallet: getMyWallet,
  listMyTransactions: listMyTransactions,
  createDepositOrder: createDepositOrder,
  listMyDepositOrders: listMyDepositOrders,
  getMyDepositOrder: getMyDepositOrder,
  createWithdrawal: createWithdrawal,
  listMyWithdrawals: listMyWithdrawals,
};
