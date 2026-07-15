var { BetMarket, Bet } = require("../../models/betting");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var { settleMarket } = require("../../services/bettingSettlementService");

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

async function list(req, res) {
  var markets = await BetMarket.find({}).sort({ updatedAt: -1 }).exec();
  res.json(apiSuccess(markets.map(mapMarket)));
}

async function open(req, res) {
  var market = await BetMarket.findByIdAndUpdate(
    req.params.id,
    { $set: { status: "OPEN", openedAt: new Date() } },
    { new: true },
  ).exec();
  if (!market) throw apiError("Không tìm thấy bet market", 404);
  res.json(apiSuccess(mapMarket(market), "Mở cược thành công"));
}

async function close(req, res) {
  var market = await BetMarket.findByIdAndUpdate(
    req.params.id,
    { $set: { status: "CLOSED", closedAt: new Date() } },
    { new: true },
  ).exec();
  if (!market) throw apiError("Không tìm thấy bet market", 404);
  res.json(apiSuccess(mapMarket(market), "Đóng cược thành công"));
}

async function listBets(req, res) {
  var bets = await Bet.find({ marketId: req.params.id }).sort({ placedAt: -1 }).exec();
  res.json(apiSuccess(bets.map(mapBet)));
}

async function settle(req, res) {
  if (!req.get("Idempotency-Key")) throw apiError("Thiếu Idempotency-Key", 400);
  var market = await settleMarket(req.params.id);
  res.json(apiSuccess(mapMarket(market), "Đã chốt kết quả cược"));
}

module.exports = {
  list: list,
  open: open,
  close: close,
  listBets: listBets,
  settle: settle,
};
