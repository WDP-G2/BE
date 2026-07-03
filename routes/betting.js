var express = require("express");
var router = express.Router();
var Tournament = require("../models/tournament");
var { BetMarket, Bet } = require("../models/betting");
var User = require("../models/user");
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var {
  findRaceContext,
  listAllRaces,
  mapRaceSummary,
  getApprovedParticipants,
  mapParticipant,
} = require("../services/tournamentRaceService");
var { holdStake } = require("../services/walletLedger");

function mapMarket(market) {
  return {
    id: String(market._id),
    raceId: String(market.raceId),
    raceName: market.raceName,
    tournamentId: market.tournamentId ? String(market.tournamentId) : null,
    tournamentName: market.tournamentName,
    status: market.status,
    minStake: Number(market.minStake || 0),
    maxStake: Number(market.maxStake || 0),
    note: market.note || "",
    options: market.options || [],
    openedAt: market.openedAt,
    closedAt: market.closedAt,
  };
}

function mapBet(bet) {
  return {
    id: String(bet._id),
    marketId: String(bet.marketId),
    raceId: String(bet.raceId),
    raceName: bet.raceName || "",
    tournamentId: bet.tournamentId ? String(bet.tournamentId) : null,
    tournamentName: bet.tournamentName || "",
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
    lockedAt: bet.lockedAt || null,
    settledAt: bet.settledAt || null,
  };
}

router.get(
  "/:raceId/bet-market",
  asyncHandler(async function (req, res) {
    var market = await BetMarket.findOne({ raceId: req.params.raceId, status: "OPEN" }).exec();
    if (!market) return res.json(apiSuccess(null));
    res.json(apiSuccess(mapMarket(market)));
  }),
);

router.get(
  "/:raceId/results",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
    var rows = (ctx.race.results || []).map(function (r, index) {
      return {
        id: String(r._id || index + 1),
        participantId: null,
        horseName: r.horseName,
        ownerUsername: "",
        jockeyUsername: r.jockeyName || "",
        rank: r.position,
        finishTimeMillis: null,
        status: "FINISHED",
        prizeAmount: 0,
        note: r.notes || "",
      };
    });
    res.json(apiSuccess(rows));
  }),
);

var userRouter = express.Router();
userRouter.use(authenticate);

userRouter.get(
  "/me/bettable-races",
  asyncHandler(async function (req, res) {
    if (req.user.role !== "SPECTATOR" && req.user.role !== "USER") {
      return res.status(403).json({ success: false, message: "Forbidden", data: null });
    }
    var markets = await BetMarket.find({ status: "OPEN" }).sort({ openedAt: -1 }).exec();
    res.json(apiSuccess(markets.map(mapMarket)));
  }),
);

userRouter.get(
  "/me/bets",
  asyncHandler(async function (req, res) {
    var bets = await Bet.find({ userId: req.user.id }).sort({ placedAt: -1 }).exec();
    res.json(apiSuccess(bets.map(mapBet)));
  }),
);

router.post(
  "/:raceId/bets",
  authenticate,
  requireRole("SPECTATOR"),
  asyncHandler(async function (req, res) {
    var market = await BetMarket.findOne({ raceId: req.params.raceId, status: "OPEN" }).exec();
    if (!market) throw apiError("Market cược chưa mở", 400);

    var participantId = String(req.body.participantId || "");
    var stakeAmount = Number(req.body.stakeAmount || 0);
    if (!participantId || stakeAmount <= 0) throw apiError("Dữ liệu cược không hợp lệ", 400);
    if (stakeAmount < market.minStake || stakeAmount > market.maxStake) {
      throw apiError("Số tiền cược nằm ngoài giới hạn", 400);
    }

    var option = (market.options || []).find(function (o) {
      return String(o.participantId) === participantId;
    });
    if (!option) throw apiError("Ngựa cược không hợp lệ", 400);

    await holdStake(req.user.id, stakeAmount, {
      referenceType: "BET",
      referenceId: String(market._id),
      description: "Đặt cược " + (option.horseName || ""),
    });

    var user = await User.findById(req.user.id).exec();
    var bet = await Bet.create({
      marketId: market._id,
      raceId: market.raceId,
      raceName: market.raceName || "",
      tournamentId: market.tournamentId || null,
      tournamentName: market.tournamentName || "",
      userId: req.user.id,
      username: user?.username || user?.fullName || "",
      participantId: participantId,
      horseId: option.horseId,
      horseName: option.horseName,
      stakeAmount: stakeAmount,
      potentialPayoutAmount: stakeAmount * 2,
      status: "PLACED",
    });

    res.status(201).json(apiSuccess(mapBet(bet), "Đặt cược thành công"));
  }),
);

module.exports = { racesRouter: router, usersBettingRouter: userRouter };
