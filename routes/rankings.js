var express = require("express");
var router = express.Router();
var asyncHandler = require("../utils/asyncHandler");
var rankingsController = require("../controllers/rankingsController");

router.get("/", asyncHandler(rankingsController.getRankings));

module.exports = router;
