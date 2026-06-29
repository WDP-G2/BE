var express = require("express");
var router = express.Router();
var { DepositOrder, Withdrawal, WalletTransaction } = require("../../models/wallet");
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var {
  getSystemWallet,
  mapWallet,
  mapTransaction,
  recordTransaction,
} = require("../../services/walletLedger");

router.use(authenticate, requireRole("ADMIN"));

function mapDeposit(order) {
  return {
    id: String(order._id),
    userId: order.userId ? String(order.userId) : null,
    amount: Number(order.amount || 0),
    status: order.status,
    paymentMethod: order.paymentMethod,
    note: order.note,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

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

router.get(
  "/",
  asyncHandler(async function (req, res) {
    var wallet = await getSystemWallet();
    res.json(apiSuccess(mapWallet(wallet)));
  }),
);

router.get(
  "/transactions",
  asyncHandler(async function (req, res) {
    var wallet = await getSystemWallet();
    var txs = await WalletTransaction.find({ walletId: wallet._id }).sort({ createdAt: -1 }).limit(200).exec();
    res.json(apiSuccess(txs.map(mapTransaction)));
  }),
);

router.post(
  "/deposit-orders",
  asyncHandler(async function (req, res) {
    var amount = Number(req.body.amount || 0);
    if (amount <= 0) throw apiError("Số tiền không hợp lệ", 400);

    var wallet = await getSystemWallet();
    var order = await DepositOrder.create({
      walletId: wallet._id,
      userId: req.user.id,
      amount: amount,
      status: "PAID",
      paymentMethod: req.body.paymentMethod || "MANUAL",
      note: req.body.note || "Admin nạp quỹ hệ thống",
    });

    await recordTransaction(wallet, {
      userId: req.user.id,
      type: "DEPOSIT",
      amount: amount,
      referenceType: "DEPOSIT_ORDER",
      referenceId: String(order._id),
      description: "Nạp quỹ hệ thống",
    });

    res.status(201).json(apiSuccess(mapDeposit(order), "Tạo lệnh nạp thành công"));
  }),
);

router.get(
  "/deposit-orders/:id",
  asyncHandler(async function (req, res) {
    var order = await DepositOrder.findById(req.params.id).exec();
    if (!order) throw apiError("Không tìm thấy lệnh nạp", 404);
    res.json(apiSuccess(mapDeposit(order)));
  }),
);

router.get(
  "/withdrawals",
  asyncHandler(async function (req, res) {
    var rows = await Withdrawal.find({}).sort({ createdAt: -1 }).limit(200).exec();
    res.json(apiSuccess(rows.map(mapWithdrawal)));
  }),
);

router.post(
  "/withdrawals",
  asyncHandler(async function (req, res) {
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
  }),
);

module.exports = router;
