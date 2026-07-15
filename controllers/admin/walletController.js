var { DepositOrder, Withdrawal, WalletTransaction } = require("../../models/wallet");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var {
  getSystemWallet,
  mapWallet,
  mapTransaction,
} = require("../../services/walletLedger");
var depositOrderService = require("../../services/depositOrderService");
var withdrawalService = require("../../services/withdrawalService");
var walletReconciliationService = require("../../services/walletReconciliationService");

function mapWithdrawal(item) {
  return withdrawalService.mapWithdrawal(item);
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
  var item = await withdrawalService.createTreasuryWithdrawal({
    adminId: req.user.id,
    amount: req.body.amount,
    idempotencyKey: req.get("Idempotency-Key"),
    bankAccount: req.body.bankAccount || "",
    bankName: req.body.bankName || "",
    accountName: req.body.accountName || "",
    note: req.body.note || "Admin rút quỹ hệ thống",
  });
  res.status(201).json(apiSuccess(mapWithdrawal(item), "Rút quỹ thành công"));
}

async function approveWithdrawal(req, res) {
  var item = await withdrawalService.approveWithdrawal(req.params.id, req.user.id, req.get("Idempotency-Key"));
  res.json(apiSuccess(mapWithdrawal(item), "Đã duyệt yêu cầu rút tiền"));
}

async function rejectWithdrawal(req, res) {
  var item = await withdrawalService.rejectWithdrawal(req.params.id, req.user.id, req.get("Idempotency-Key"), req.body.note);
  res.json(apiSuccess(mapWithdrawal(item), "Đã từ chối và hoàn số dư"));
}

async function markWithdrawalPaid(req, res) {
  var item = await withdrawalService.markWithdrawalPaid(req.params.id, req.user.id, req.get("Idempotency-Key"));
  res.json(apiSuccess(mapWithdrawal(item), "Đã xác nhận chi tiền"));
}

async function getReconciliation(req, res) {
  var report = await walletReconciliationService.reconcile();
  res.json(apiSuccess(report));
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
  approveWithdrawal: approveWithdrawal,
  rejectWithdrawal: rejectWithdrawal,
  markWithdrawalPaid: markWithdrawalPaid,
  getReconciliation: getReconciliation,
};
