var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var dashboardController = require("../../controllers/admin/dashboardController");

router.use(authenticate, requireRole("ADMIN"));

router.get("/summary", asyncHandler(dashboardController.getSummary));
router.get("/tournament-registrations", asyncHandler(dashboardController.getTournamentRegistrations));
router.get("/revenue", asyncHandler(dashboardController.getRevenue));
router.get("/top-horses", asyncHandler(dashboardController.getTopHorses));

module.exports = router;
