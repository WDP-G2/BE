var { BetMarket, Bet } = require("../models/betting");
var User = require("../models/user");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var { findRaceContext, prizeAmountForRank } = require("../services/tournamentRaceService");
var { executeOperation, requirePositiveInteger } = require("../services/walletLedger");
var { mapMarket, mapBet } = require("../utils/bettingMapper");
var systemSettingsService = require("../services/systemSettingsService");
var raceSimulationService = require("../services/raceSimulationService");
var featureFlags = require("../services/financialFeatureFlags");

async function getPublicMarket(req, res) {
  var market = await BetMarket.findOne({ raceId: req.params.raceId, status: "OPEN" }).exec();
  if (!market) return res.json(apiSuccess(null));
  res.json(apiSuccess(mapMarket(market)));
}

async function getRaceResults(req, res) {
  var ctx = await findRaceContext(req.params.raceId);
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  var rows = (ctx.race.results || []).map(function (r, index) {
    var finishTimeMillis = 0;
    if (r.time && r.time !== "—") {
      var parsed = Number(r.time);
      finishTimeMillis = Number.isFinite(parsed) ? parsed : 0;
    }
    return {
      id: String(r._id || index + 1),
      participantId: r.participantId ? String(r.participantId) : null,
      horseName: r.horseName,
      ownerUsername: "",
      jockeyUsername: r.jockeyName || "",
      rank: r.position,
      finishTimeMillis: finishTimeMillis,
      status: r.position ? "FINISHED" : "DISQUALIFIED",
      prizeAmount: prizeAmountForRank(ctx.race, r.position),
      note: r.notes || "",
      source: r.source || "MANUAL",
      simulationRunId: r.simulationRunId || null,
    };
  });
  res.json(apiSuccess(rows));
}

async function getRaceSimulation(req, res) {
  var simulation = await raceSimulationService.get(req.params.raceId);
  res.json(apiSuccess(simulation));
}

async function getBettableRaces(req, res) {
  if (req.user.role !== "SPECTATOR" && req.user.role !== "USER") {
    return res.status(403).json({ success: false, message: "Forbidden", data: null });
  }
  var markets = await BetMarket.find({ status: "OPEN" }).sort({ openedAt: -1 }).exec();
  res.json(apiSuccess(markets.map(mapMarket)));
}

async function getMyBets(req, res) {
  var bets = await Bet.find({ userId: req.user.id }).sort({ placedAt: -1 }).exec();
  res.json(apiSuccess(bets.map(mapBet)));
}

async function placeBet(req, res) {
  featureFlags.assertEnabled("BETTING");
  var settings = await systemSettingsService.getSettingsDoc();
  if (settings.bettingEnabled === false) {
    throw apiError("Tính năng đặt cược hiện đang tắt", 403);
  }

  var market = await BetMarket.findOne({ raceId: req.params.raceId, status: "OPEN" }).exec();
  if (!market) throw apiError("Market cược chưa mở", 400);

  var participantId = String(req.body.participantId || "");
  var stakeAmount = requirePositiveInteger(req.body.stakeAmount, "Tiền cược");
  var idempotencyKey = String(req.get("Idempotency-Key") || "").trim();
  if (!idempotencyKey) throw apiError("Thiếu Idempotency-Key", 400);
  if (!participantId || stakeAmount <= 0) throw apiError("Dữ liệu cược không hợp lệ", 400);
  if (stakeAmount < market.minStake || stakeAmount > market.maxStake) {
    throw apiError("Số tiền cược nằm ngoài giới hạn", 400);
  }

  var option = (market.options || []).find(function (o) {
    return String(o.participantId) === participantId;
  });
  if (!option) throw apiError("Ngựa cược không hợp lệ", 400);

  var user = await User.findById(req.user.id).exec();
  var result = await executeOperation({
    idempotencyKey: "bet:place:" + req.user.id + ":" + idempotencyKey,
    type: "BET_PLACE",
    referenceType: "BET_MARKET",
    referenceId: String(market._id),
    actorId: req.user.id,
    postings: [{ ownerType: "USER", userId: req.user.id, transactionType: "BET_STAKE", availableDelta: -stakeAmount, holdDelta: stakeAmount, description: "Giữ tiền cược " + (option.horseName || "") }],
    mutateDomain: async function (session, operation) {
      var stillOpen = await BetMarket.exists({ _id: market._id, status: "OPEN" }).session(session);
      if (!stillOpen) throw apiError("Market cược đã đóng", 409);
      await Bet.create([{
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
        idempotencyKey: idempotencyKey,
        placementOperationId: operation._id,
      }], { session: session });
    },
  });
  var bet = await Bet.findOne({ placementOperationId: result.operation._id }).exec();

  res.status(201).json(apiSuccess(mapBet(bet), "Đặt cược thành công"));
}

module.exports = {
  getPublicMarket: getPublicMarket,
  getRaceResults: getRaceResults,
  getRaceSimulation: getRaceSimulation,
  getBettableRaces: getBettableRaces,
  getMyBets: getMyBets,
  placeBet: placeBet,
};
