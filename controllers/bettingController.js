var api = require("../utils/apiResponse");
var service = require("../services/bettingService");

async function createMarket(req, res, next) {
  try {
    var user = await service.currentUser(req);
    return api.ok(
      res,
      await service.createMarket(user, req.params.raceId, req.body || {}),
      "Bet market created",
    );
  } catch (err) {
    next(err);
  }
}

async function openMarket(req, res, next) {
  try {
    var market = await service.openMarket(req.params.id);
    return market ? api.ok(res, market, "Bet market opened") : api.fail(res, 404, "Bet market not found");
  } catch (err) {
    next(err);
  }
}

async function closeMarket(req, res, next) {
  try {
    var market = await service.closeMarket(req.params.id);
    return market ? api.ok(res, market, "Bet market closed") : api.fail(res, 404, "Bet market not found");
  } catch (err) {
    next(err);
  }
}

async function listMarkets(req, res, next) {
  try {
    return api.ok(res, await service.listMarkets());
  } catch (err) {
    next(err);
  }
}

async function listMarketBets(req, res, next) {
  try {
    return api.ok(res, await service.listMarketBets(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function publicMarket(req, res, next) {
  try {
    var market = await service.openMarketForRace(req.params.raceId);
    return market ? api.ok(res, market) : api.fail(res, 404, "Open BetMarket not found");
  } catch (err) {
    next(err);
  }
}

async function bettableRaces(req, res, next) {
  try {
    return api.ok(res, await service.bettableRaces());
  } catch (err) {
    next(err);
  }
}

async function placeBet(req, res, next) {
  try {
    var user = await service.currentUser(req);
    return api.ok(
      res,
      await service.placeBet(user, req.params.raceId, req.body || {}),
      "Bet placed",
    );
  } catch (err) {
    next(err);
  }
}

async function userBets(req, res, next) {
  try {
    var user = await service.currentUser(req);
    return api.ok(res, await service.listUserBets(user._id));
  } catch (err) {
    next(err);
  }
}

async function userBet(req, res, next) {
  try {
    var user = await service.currentUser(req);
    var bet = await service.getUserBet(user._id, req.params.id);
    return bet ? api.ok(res, bet) : api.fail(res, 404, "Bet not found");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  bettableRaces: bettableRaces,
  closeMarket: closeMarket,
  createMarket: createMarket,
  listMarketBets: listMarketBets,
  listMarkets: listMarkets,
  openMarket: openMarket,
  placeBet: placeBet,
  publicMarket: publicMarket,
  userBet: userBet,
  userBets: userBets,
};
