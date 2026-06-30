var express = require("express");
var controller = require("../../controllers/financeSettingsController");
var adminController = require("../../controllers/adminController");

var router = express.Router();

router.get("/admin/finance-settings", controller.getSettings);
router.put("/admin/finance-settings", controller.updateSettings);
router.get("/admin/finance-settings/race-prize-shares", controller.getPrizeShares);
router.put("/admin/finance-settings/race-prize-shares", controller.updatePrizeShares);
router.get("/admin/payout-debts", adminController.payoutDebts);
router.get("/admin/audit-logs", adminController.auditLogs);

module.exports = router;
