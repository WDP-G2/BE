var express = require("express");
var walletController = require("../../controllers/walletController");
var withdrawalController = require("../../controllers/withdrawalController");

var router = express.Router();

router.get("/wallets/me", walletController.currentWallet);
router.get("/wallets/me/transactions", walletController.currentTransactions);
router.get("/admin/wallet", walletController.adminWallet);
router.get("/admin/wallet/transactions", walletController.adminTransactions);

router.post("/wallets/me/withdrawals", withdrawalController.createUserWithdrawal);
router.get("/wallets/me/withdrawals", withdrawalController.listUserWithdrawals);
router.get("/wallets/me/withdrawals/:id", withdrawalController.getUserWithdrawal);
router.get("/admin/withdrawals", withdrawalController.listAdminWithdrawals);
router.get("/admin/withdrawals/:id", withdrawalController.getAdminWithdrawal);
router.put("/admin/withdrawals/:id/approve", withdrawalController.approve);
router.put("/admin/withdrawals/:id/reject", withdrawalController.reject);
router.put("/admin/withdrawals/:id/mark-paid", withdrawalController.markPaid);
router.post("/admin/wallet/withdrawals", withdrawalController.createAdminWithdrawal);
router.get("/admin/wallet/withdrawals", withdrawalController.listAdminWalletWithdrawals);

module.exports = router;
