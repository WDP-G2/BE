var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var walletController = require("../../controllers/admin/walletController");

router.use(authenticate, requireRole("ADMIN"));

router.get("/", asyncHandler(walletController.getWallet));
router.get("/transactions", asyncHandler(walletController.listTransactions));
router.post("/deposit-orders", asyncHandler(walletController.createDepositOrder));
router.post("/deposit-orders/:id/pay-with-card", asyncHandler(walletController.payDepositOrderWithCard));
router.get("/deposit-orders/:id", asyncHandler(walletController.getDepositOrder));
router.get("/withdrawals", asyncHandler(walletController.listWithdrawals));
router.post("/withdrawals", asyncHandler(walletController.createWithdrawal));

module.exports = router;
