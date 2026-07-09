var express = require("express");
var router = express.Router();
var zaloPayController = require("../controllers/zaloPayController");

router.get("/return", zaloPayController.handleReturn);
router.post("/callback", zaloPayController.handleCallback);

module.exports = router;
