var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var spectatorController = require("../controllers/spectatorController");

router.use(authenticate, requireRole("SPECTATOR"));

router.get("/dashboard", asyncHandler(spectatorController.getDashboard));

module.exports = router;
