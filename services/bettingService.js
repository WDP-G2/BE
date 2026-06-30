var BetMarket = require("../models/betMarket");
var Bet = require("../models/bet");
var Tournament = require("../models/tournament");
var authService = require("./authService");
var financeSettingsService = require("./financeSettingsService");
var walletService = require("./walletService");

function amount(value, field) {
  var parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    var err = new Error((field || "Amount") + " must be greater than zero");
    err.status = 400;
    throw err;
  }
  return Math.round(parsed * 100) / 100;
}

async function findRace(raceId) {
  var tournament = await Tournament.findOne({ "races._id": raceId }).exec();
  if (!tournament) return null;
  var race = tournament.races.id(raceId);
  return { tournament: tournament, race: race };
}

function raceClosedForBetting(race) {
  var status = String(race.status || "").toUpperCase();
  return status.indexOf("HOÀN") !== -1 || status.indexOf("CANCEL") !== -1 || status.indexOf("HỦY") !== -1;
}

function validateMarketPayload(payload) {
  var minStake = amount(payload.minStake, "Minimum stake");
  var maxStake = amount(payload.maxStake, "Maximum stake");
  if (minStake > maxStake) {
    var err = new Error("Minimum stake must not exceed maximum stake");
    err.status = 400;
    throw err;
  }
  return { minStake: minStake, maxStake: maxStake };
}

function mapMarket(market, raceInfo) {
  return {
    id: String(market._id),
    raceId: String(market.raceId),
    raceName: raceInfo && raceInfo.race ? raceInfo.race.name : "",
    tournamentId: market.tournamentId ? String(market.tournamentId) : "",
    tournamentName: raceInfo && raceInfo.tournament ? raceInfo.tournament.name : "",
    status: market.status,
    minStake: market.minStake,
    maxStake: market.maxStake,
    note: market.note || "",
    createdByAdminId: String(market.createdByAdminId),
    openedAt: market.openedAt || null,
    closedAt: market.closedAt || null,
    settledAt: market.settledAt || null,
    cancelledAt: market.cancelledAt || null,
    createdAt: market.createdAt,
    updatedAt: market.updatedAt,
    options: raceInfo ? optionsForRace(raceInfo.race, raceInfo.tournament) : [],
  };
}

function optionsForRace(race, tournament) {
  return (tournament.registrations || [])
    .filter(function (registration) {
      return String(registration.raceId || "") === String(race._id || "");
    })
    .map(function (registration) {
      return {
        participantId: String(registration._id),
        horseId: registration.horseId ? String(registration.horseId) : "",
        horseName: registration.horseName || "",
        jockeyId: registration.jockeyId ? String(registration.jockeyId) : "",
        jockeyUsername: registration.jockeyName || "",
        gateNumber: registration.gateNumber || null,
        status: registration.status || "",
      };
    });
}

function mapBet(bet, market, raceInfo) {
  return {
    id: String(bet._id),
    marketId: String(bet.marketId),
    raceId: String(bet.raceId),
    raceName: raceInfo && raceInfo.race ? raceInfo.race.name : "",
    participantId: String(bet.participantId),
    userId: String(bet.userId),
    stakeAmount: bet.stakeAmount,
    potentialPayoutAmount: bet.potentialPayoutAmount,
    winningTaxPercent: bet.winningTaxPercent || null,
    winningTaxAmount: bet.winningTaxAmount || null,
    grossProfitAmount: bet.grossProfitAmount || null,
    netProfitAmount: bet.netProfitAmount || null,
    status: bet.status,
    placedAt: bet.placedAt,
    lockedAt: bet.lockedAt || null,
    settledAt: bet.settledAt || null,
  };
}

async function createMarket(admin, raceId, payload) {
  await requireBettingEnabled();
  var stakes = validateMarketPayload(payload || {});
  var raceInfo = await findRace(raceId);
  if (!raceInfo) {
    var missing = new Error("Race not found");
    missing.status = 404;
    throw missing;
  }
  if (raceClosedForBetting(raceInfo.race)) {
    var closed = new Error("Race cannot create a bet market after result or cancellation");
    closed.status = 400;
    throw closed;
  }
  var existing = await BetMarket.findOne({
    raceId: raceId,
    status: { $in: ["DRAFT", "OPEN", "CLOSED"] },
  }).exec();
  if (existing) {
    var duplicate = new Error("Race already has an active bet market");
    duplicate.status = 400;
    throw duplicate;
  }
  var market = await BetMarket.create({
    raceId: raceId,
    tournamentId: raceInfo.tournament._id,
    createdByAdminId: admin._id,
    minStake: stakes.minStake,
    maxStake: stakes.maxStake,
    note: payload.note || "",
    status: "DRAFT",
  });
  return mapMarket(market, raceInfo);
}

async function openMarket(id) {
  await requireBettingEnabled();
  var market = await BetMarket.findById(id).exec();
  if (!market) return null;
  if (market.status !== "DRAFT" && market.status !== "CLOSED") {
    var err = new Error("Only draft or closed bet markets can be opened");
    err.status = 400;
    throw err;
  }
  var raceInfo = await findRace(market.raceId);
  if (!raceInfo || raceClosedForBetting(raceInfo.race)) {
    var closed = new Error("Bets can only be placed on active races");
    closed.status = 400;
    throw closed;
  }
  market.status = "OPEN";
  market.openedAt = new Date();
  await market.save();
  return mapMarket(market, raceInfo);
}

async function closeMarket(id) {
  var market = await BetMarket.findById(id).exec();
  if (!market) return null;
  if (market.status !== "OPEN") {
    var err = new Error("Only open bet markets can be closed");
    err.status = 400;
    throw err;
  }
  market.status = "CLOSED";
  market.closedAt = new Date();
  await market.save();
  return mapMarket(market, await findRace(market.raceId));
}

async function listMarkets() {
  var markets = await BetMarket.find({}).sort({ createdAt: -1 }).exec();
  var result = [];
  for (var i = 0; i < markets.length; i += 1) {
    result.push(mapMarket(markets[i], await findRace(markets[i].raceId)));
  }
  return result;
}

async function openMarketForRace(raceId) {
  await requireBettingEnabled();
  var market = await BetMarket.findOne({ raceId: raceId, status: "OPEN" }).exec();
  if (!market) return null;
  return mapMarket(market, await findRace(raceId));
}

async function bettableRaces() {
  await requireBettingEnabled();
  var markets = await BetMarket.find({ status: "OPEN" }).sort({ createdAt: -1 }).exec();
  var result = [];
  for (var i = 0; i < markets.length; i += 1) {
    result.push(mapMarket(markets[i], await findRace(markets[i].raceId)));
  }
  return result;
}

async function placeBet(user, raceId, payload) {
  await requireBettingEnabled();
  if (user.role !== "SPECTATOR" && user.role !== "USER") {
    var role = new Error("Only spectators can place bets");
    role.status = 403;
    throw role;
  }
  var stake = amount(payload.stakeAmount, "Stake amount");
  var market = await BetMarket.findOne({ raceId: raceId, status: "OPEN" }).exec();
  if (!market) {
    var missing = new Error("Open BetMarket not found");
    missing.status = 404;
    throw missing;
  }
  if (stake < market.minStake) {
    var low = new Error("Stake amount is below market minimum");
    low.status = 400;
    throw low;
  }
  if (stake > market.maxStake) {
    var high = new Error("Stake amount exceeds market maximum");
    high.status = 400;
    throw high;
  }
  var raceInfo = await findRace(raceId);
  if (!raceInfo || raceClosedForBetting(raceInfo.race)) {
    var closed = new Error("Bets can only be placed on active races");
    closed.status = 400;
    throw closed;
  }
  var optionIds = optionsForRace(raceInfo.race, raceInfo.tournament).map(function (item) {
    return String(item.participantId);
  });
  if (optionIds.length && optionIds.indexOf(String(payload.participantId)) === -1) {
    var participant = new Error("Participant does not belong to this race");
    participant.status = 400;
    throw participant;
  }
  var bet = await Bet.create({
    marketId: market._id,
    raceId: market.raceId,
    participantId: payload.participantId,
    userId: user._id,
    stakeAmount: stake,
    potentialPayoutAmount: stake * 2,
    status: "PLACED",
    placedAt: new Date(),
  });
  var holdKey = "bet:" + bet._id + ":stake-hold";
  await walletService.hold(
    user._id,
    stake,
    "BET",
    "BET",
    String(bet._id),
    holdKey,
    "",
    "Bet stake held",
  );
  bet.stakeHoldKey = holdKey;
  await bet.save();
  return mapBet(bet, market, raceInfo);
}

async function requireBettingEnabled() {
  var settings = await financeSettingsService.getSettings();
  if (!settings.bettingEnabled) {
    var err = new Error("Betting feature is disabled");
    err.status = 400;
    throw err;
  }
}

async function listMarketBets(marketId) {
  var market = await BetMarket.findById(marketId).exec();
  var bets = await Bet.find({ marketId: marketId }).sort({ placedAt: -1 }).exec();
  var raceInfo = market ? await findRace(market.raceId) : null;
  return bets.map(function (bet) {
    return mapBet(bet, market, raceInfo);
  });
}

async function listUserBets(userId) {
  var bets = await Bet.find({ userId: userId }).sort({ placedAt: -1 }).exec();
  var result = [];
  for (var i = 0; i < bets.length; i += 1) {
    var market = await BetMarket.findById(bets[i].marketId).exec();
    result.push(mapBet(bets[i], market, market ? await findRace(market.raceId) : null));
  }
  return result;
}

async function getUserBet(userId, betId) {
  var bet = await Bet.findOne({ _id: betId, userId: userId }).exec();
  if (!bet) return null;
  var market = await BetMarket.findById(bet.marketId).exec();
  return mapBet(bet, market, market ? await findRace(market.raceId) : null);
}

async function currentUser(req) {
  var user = await authService.currentUser(req);
  if (!user || !user._id) {
    var err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return user;
}

module.exports = {
  bettableRaces: bettableRaces,
  closeMarket: closeMarket,
  createMarket: createMarket,
  currentUser: currentUser,
  getUserBet: getUserBet,
  listMarketBets: listMarketBets,
  listMarkets: listMarkets,
  listUserBets: listUserBets,
  openMarket: openMarket,
  openMarketForRace: openMarketForRace,
  placeBet: placeBet,
};
