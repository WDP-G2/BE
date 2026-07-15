var Notification = require("../models/notification");
var { BetMarket, Bet } = require("../models/betting");
var { settleMarket } = require("./bettingSettlementService");

function raceRegistrations(tournament, raceId) {
  return (tournament.registrations || []).filter(function (registration) {
    return String(registration.raceId || "") === String(raceId);
  });
}

function notificationUserIds(tournament, raceId) {
  var ids = new Set();
  raceRegistrations(tournament, raceId).forEach(function (registration) {
    if (registration.ownerId) ids.add(String(registration.ownerId));
    if (registration.jockeyId) ids.add(String(registration.jockeyId));
  });
  return Array.from(ids);
}

async function lockBetting(raceId) {
  var markets = await BetMarket.find({ raceId: raceId, status: "OPEN" }).select("_id").exec();
  if (!markets.length) return;
  var ids = markets.map(function (market) { return market._id; });
  var now = new Date();
  await BetMarket.updateMany(
    { _id: { $in: ids }, status: "OPEN" },
    { $set: { status: "CLOSED", closedAt: now } },
  ).exec();
  await Bet.updateMany(
    { marketId: { $in: ids }, status: "PLACED" },
    { $set: { status: "LOCKED", lockedAt: now } },
  ).exec();
}

async function settleBetting(raceId) {
  await lockBetting(raceId);
  var markets = await BetMarket.find({ raceId: raceId, status: "CLOSED" }).select("_id").exec();
  for (var index = 0; index < markets.length; index += 1) {
    await settleMarket(markets[index]._id);
  }
}

async function publishNotification(tournament, race, type, title, message) {
  var userIds = notificationUserIds(tournament, race._id);
  if (!userIds.length) return;
  await Notification.insertMany(userIds.map(function (userId) {
    return {
      userId: userId,
      type: type,
      title: title,
      message: message,
      metadata: {
        event: type,
        tournamentId: String(tournament._id),
        raceId: String(race._id),
      },
    };
  }));
}

async function publishRaceStarted(tournament, race) {
  return publishNotification(tournament, race, "RACE_STARTED", "Cuộc đua đã bắt đầu", (race.name || "Cuộc đua") + " đang diễn ra.");
}

async function publishRaceResult(tournament, race) {
  return publishNotification(tournament, race, "RACE_RESULT_CONFIRMED", "Kết quả cuộc đua đã được xác nhận", (race.name || "Cuộc đua") + " đã có kết quả chính thức.");
}

module.exports = {
  lockBetting: lockBetting,
  settleBetting: settleBetting,
  publishRaceStarted: publishRaceStarted,
  publishRaceResult: publishRaceResult,
};
