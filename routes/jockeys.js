var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var jockeysController = require("../controllers/jockeysController");

router.use(authenticate, requireRole("OWNER", "ADMIN"));

router.get("/available", asyncHandler(jockeysController.listAvailable));
router.get("/:id", asyncHandler(jockeysController.getById));

module.exports = router;
