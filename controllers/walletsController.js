var { DepositOrder, Withdrawal, WalletTransaction } = require("../models/wallet");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var {
  getUserWallet,
  mapWallet,
  mapTransaction,
} = require("../services/walletLedger");
var depositOrderService = require("../services/depositOrderService");
var withdrawalService = require("../services/withdrawalService");

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
  var wallet = await getUserWallet(req.user.id);
  var order = await depositOrderService.createZaloPayDepositOrder({
    amount: req.body.amount,
    body: req.body,
    wallet: wallet,
    userId: req.user.id,
    appUser: req.user.username || req.user.email || "user",
    depositTarget: "USER",
  });
  res.status(201).json(apiSuccess(order, "Tạo lệnh nạp thành công"));
}

async function listMyDepositOrders(req, res) {
  var rows = await DepositOrder.find({ userId: req.user.id }).sort({ createdAt: -1 }).exec();
  res.json(
    apiSuccess(
      rows.map(function (order) {
        return depositOrderService.mapDepositOrder(order);
      }),
    ),
  );
}

async function getMyDepositOrder(req, res) {
  var order = await DepositOrder.findOne({ _id: req.params.id, userId: req.user.id }).exec();
  if (!order) throw apiError("Không tìm thấy lệnh nạp", 404);

  order = await depositOrderService.syncPendingOrder(order);
  res.json(apiSuccess(depositOrderService.mapDepositOrder(order)));
}

async function createWithdrawal(req, res) {
  var item = await withdrawalService.createUserWithdrawal({
    userId: req.user.id,
    amount: req.body.amount,
    idempotencyKey: req.get("Idempotency-Key"),
    bankAccount: req.body.bankAccountNumber || req.body.bankAccount || "",
    bankName: req.body.bankName || "",
    accountName: req.body.bankAccountName || req.body.accountName || "",
    note: req.body.reason || "",
  });
  res.status(201).json(
    apiSuccess(withdrawalService.mapWithdrawal(item), "Tạo yêu cầu rút tiền thành công"),
  );
}

async function listMyWithdrawals(req, res) {
  var rows = await Withdrawal.find({ userId: req.user.id }).sort({ createdAt: -1 }).exec();
  res.json(
    apiSuccess(
      rows.map(function (w) {
        return withdrawalService.mapWithdrawal(w);
      }),
    ),
  );
}

async function payMyDepositOrderWithCard(req, res) {
  var order = await depositOrderService.confirmCardDepositOrder(req.params.id, req.body, {
    userId: req.user.id,
    depositTarget: "USER",
  });
  res.json(apiSuccess(order, "Thanh toán thẻ thành công"));
}

module.exports = {
  getMyWallet: getMyWallet,
  listMyTransactions: listMyTransactions,
  createDepositOrder: createDepositOrder,
  listMyDepositOrders: listMyDepositOrders,
  getMyDepositOrder: getMyDepositOrder,
  payMyDepositOrderWithCard: payMyDepositOrderWithCard,
  createWithdrawal: createWithdrawal,
  listMyWithdrawals: listMyWithdrawals,
};
