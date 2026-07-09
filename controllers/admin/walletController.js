var { DepositOrder, Withdrawal, WalletTransaction } = require("../../models/wallet");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var {
  getSystemWallet,
  mapWallet,
  mapTransaction,
  recordTransaction,
} = require("../../services/walletLedger");
var depositOrderService = require("../../services/depositOrderService");

function mapWithdrawal(item) {
  return {
    id: String(item._id),
    userId: item.userId ? String(item.userId) : null,
    amount: Number(item.amount || 0),
    status: item.status,
    bankAccount: item.bankAccount,
    bankName: item.bankName,
    accountName: item.accountName,
    note: item.note,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function getWallet(req, res) {
  var wallet = await getSystemWallet();
  res.json(apiSuccess(mapWallet(wallet)));
}

async function listTransactions(req, res) {
  var wallet = await getSystemWallet();
  var txs = await WalletTransaction.find({ walletId: wallet._id }).sort({ createdAt: -1 }).limit(200).exec();
  res.json(apiSuccess(txs.map(mapTransaction)));
}

async function createDepositOrder(req, res) {
  var wallet = await getSystemWallet();
  var order = await depositOrderService.createZaloPayDepositOrder({
    amount: req.body.amount,
    body: req.body,
    wallet: wallet,
    userId: req.user.id,
    appUser: req.user.username || req.user.email || "admin",
    depositTarget: "SYSTEM",
  });
  res.status(201).json(apiSuccess(order, "Tạo lệnh nạp thành công"));
}

async function getDepositOrder(req, res) {
  var order = await DepositOrder.findById(req.params.id).exec();
  if (!order) throw apiError("Không tìm thấy lệnh nạp", 404);
  if (order.depositTarget !== "SYSTEM") throw apiError("Không tìm thấy lệnh nạp", 404);

  order = await depositOrderService.syncPendingOrder(order);
  res.json(apiSuccess(depositOrderService.mapDepositOrder(order)));
}

async function listWithdrawals(req, res) {
  var rows = await Withdrawal.find({}).sort({ createdAt: -1 }).limit(200).exec();
  res.json(apiSuccess(rows.map(mapWithdrawal)));
}

async function createWithdrawal(req, res) {
  var amount = Number(req.body.amount || 0);
  if (amount <= 0) throw apiError("Số tiền không hợp lệ", 400);

  var wallet = await getSystemWallet();
  var item = await Withdrawal.create({
    walletId: wallet._id,
    userId: req.user.id,
    amount: amount,
    status: "PAID",
    bankAccount: req.body.bankAccount || "",
    bankName: req.body.bankName || "",
    accountName: req.body.accountName || "",
    note: req.body.note || "Admin rút quỹ hệ thống",
  });

  await recordTransaction(wallet, {
    userId: req.user.id,
    type: "ADMIN_WITHDRAW",
    amount: -amount,
    referenceType: "WITHDRAWAL",
    referenceId: String(item._id),
    description: "Rút quỹ hệ thống",
  });

  res.status(201).json(apiSuccess(mapWithdrawal(item), "Rút quỹ thành công"));
}

async function payDepositOrderWithCard(req, res) {
  var order = await depositOrderService.confirmCardDepositOrder(req.params.id, req.body, {
    depositTarget: "SYSTEM",
  });
  res.json(apiSuccess(order, "Thanh toán thẻ thành công"));
}

module.exports = {
  getWallet: getWallet,
  listTransactions: listTransactions,
  createDepositOrder: createDepositOrder,
  getDepositOrder: getDepositOrder,
  payDepositOrderWithCard: payDepositOrderWithCard,
  listWithdrawals: listWithdrawals,
  createWithdrawal: createWithdrawal,
};
