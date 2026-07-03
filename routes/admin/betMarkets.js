var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var betMarketsController = require("../../controllers/admin/betMarketsController");

router.use(authenticate, requireRole("ADMIN"));

router.get("/", asyncHandler(betMarketsController.list));
router.put("/:id/open", asyncHandler(betMarketsController.open));
router.put("/:id/close", asyncHandler(betMarketsController.close));
router.get("/:id/bets", asyncHandler(betMarketsController.listBets));

module.exports = router;
