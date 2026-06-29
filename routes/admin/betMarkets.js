var express = require("express");
var router = express.Router();
var { BetMarket, Bet } = require("../../models/betting");
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var { apiSuccess, apiError } = require("../../utils/apiResponse");

router.use(authenticate, requireRole("ADMIN"));

function mapMarket(market) {
  return {
    id: String(market._id),
    raceId: String(market.raceId),
    tournamentId: market.tournamentId ? String(market.tournamentId) : null,
    raceName: market.raceName,
    tournamentName: market.tournamentName,
    status: market.status,
    minStake: Number(market.minStake || 0),
    maxStake: Number(market.maxStake || 0),
    note: market.note || "",
    options: market.options || [],
    openedAt: market.openedAt,
    closedAt: market.closedAt,
    settledAt: market.settledAt,
    createdAt: market.createdAt,
    updatedAt: market.updatedAt,
  };
}

function mapBet(bet) {
  return {
    id: String(bet._id),
    marketId: String(bet.marketId),
    raceId: String(bet.raceId),
    userId: String(bet.userId),
    username: bet.username,
    participantId: bet.participantId,
    horseId: bet.horseId,
    horseName: bet.horseName,
    stakeAmount: Number(bet.stakeAmount || 0),
    status: bet.status,
    placedAt: bet.placedAt,
  };
}

router.get(
  "/",
  asyncHandler(async function (req, res) {
    var markets = await BetMarket.find({}).sort({ updatedAt: -1 }).exec();
    res.json(apiSuccess(markets.map(mapMarket)));
  }),
);

router.put(
  "/:id/open",
  asyncHandler(async function (req, res) {
    var market = await BetMarket.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "OPEN", openedAt: new Date() } },
      { new: true },
    ).exec();
    if (!market) throw apiError("Không tìm thấy bet market", 404);
    res.json(apiSuccess(mapMarket(market), "Mở cược thành công"));
  }),
);

router.put(
  "/:id/close",
  asyncHandler(async function (req, res) {
    var market = await BetMarket.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "CLOSED", closedAt: new Date() } },
      { new: true },
    ).exec();
    if (!market) throw apiError("Không tìm thấy bet market", 404);
    res.json(apiSuccess(mapMarket(market), "Đóng cược thành công"));
  }),
);

router.get(
  "/:id/bets",
  asyncHandler(async function (req, res) {
    var bets = await Bet.find({ marketId: req.params.id }).sort({ placedAt: -1 }).exec();
    res.json(apiSuccess(bets.map(mapBet)));
  }),
);

module.exports = router;
