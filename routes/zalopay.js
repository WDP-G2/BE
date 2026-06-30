var express = require("express");
var paymentService = require("../services/paymentService");

var router = express.Router();

router.get("/return", async function (req, res, next) {
  try {
    return res.json(await paymentService.handleZaloPayReturn(req.query || {}));
  } catch (err) {
    next(err);
  }
});

router.post("/callback", async function (req, res, next) {
  try {
    return res.json(await paymentService.handleZaloPayCallback(req.body || {}));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
