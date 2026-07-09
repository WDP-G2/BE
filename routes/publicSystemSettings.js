var express = require("express");
var router = express.Router();
var asyncHandler = require("../utils/asyncHandler");
var settingsController = require("../controllers/admin/settingsController");

router.get("/violation-types", asyncHandler(settingsController.getPublicViolationTypes));

module.exports = router;
