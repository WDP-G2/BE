var express = require("express");
var router = express.Router();
var { Bet } = require("../models/betting");
var { authenticate } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");

router.get(
  "/:id",
  authenticate,
  asyncHandler(async function (req, res) {
    var bet = await Bet.findById(req.params.id).exec();
    if (!bet) throw apiError("Không tìm thấy cược", 404);
    if (String(bet.userId) !== String(req.user.id) && req.user.role !== "ADMIN") {
      throw apiError("Bạn không có quyền xem cược này", 403);
    }
    res.json(apiSuccess({
      id: String(bet._id),
      marketId: String(bet.marketId),
      raceId: String(bet.raceId),
      userId: String(bet.userId),
      username: bet.username,
      participantId: bet.participantId,
      horseId: bet.horseId,
      horseName: bet.horseName,
      stakeAmount: Number(bet.stakeAmount || 0),
      potentialPayoutAmount: Number(bet.potentialPayoutAmount || 0),
      winningTaxAmount: Number(bet.winningTaxAmount || 0),
      grossProfitAmount: Number(bet.grossProfitAmount || 0),
      netProfitAmount: Number(bet.netProfitAmount || 0),
      status: bet.status,
      placedAt: bet.placedAt,
      settledAt: bet.settledAt,
    }));
  }),
);

module.exports = router;
