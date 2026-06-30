var express = require("express");
var controller = require("../../controllers/paymentController");

var router = express.Router();

router.post("/wallets/me/deposit-orders", controller.createUserDeposit);
router.get("/wallets/me/deposit-orders", controller.listUserDeposits);
router.get("/wallets/me/deposit-orders/:id", controller.getUserDeposit);
router.post("/admin/wallet/deposit-orders", controller.createAdminDeposit);
router.get("/admin/wallet/deposit-orders", controller.listAdminWalletDeposits);
router.get("/admin/wallet/deposit-orders/:id", controller.getAdminWalletDeposit);
router.post("/payment-callbacks/deposits", controller.callback);
router.get("/admin/payment-orders", controller.listAdminOrders);
router.get("/admin/payment-orders/:id", controller.getAdminOrder);
router.get("/admin/payment-callback-logs", controller.listCallbackLogs);

module.exports = router;
