var express = require("express");
var router = express.Router();
var { authenticate } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var betsController = require("../controllers/betsController");

router.get("/:id", authenticate, asyncHandler(betsController.getById));

module.exports = router;
