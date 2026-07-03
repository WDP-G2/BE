var express = require("express");
var router = express.Router();
var { authenticate } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var walletsController = require("../controllers/walletsController");

router.use(authenticate);

router.get("/me", asyncHandler(walletsController.getMyWallet));
router.get("/me/transactions", asyncHandler(walletsController.listMyTransactions));
router.post("/me/deposit-orders", asyncHandler(walletsController.createDepositOrder));
router.get("/me/deposit-orders", asyncHandler(walletsController.listMyDepositOrders));
router.get("/me/deposit-orders/:id", asyncHandler(walletsController.getMyDepositOrder));
router.post("/me/withdrawals", asyncHandler(walletsController.createWithdrawal));
router.get("/me/withdrawals", asyncHandler(walletsController.listMyWithdrawals));

module.exports = router;
