var Tournament = require("../models/tournament");
var tm = require("../utils/tournamentMapper");

function emptyStats() {
  return { starts: 0, wins: 0, winRate: 0.5 };
}

function calculateRate(stats) {
  stats.winRate = (stats.wins + 1) / (stats.starts + 2);
  return stats;
}

async function getPerformanceMaps(excludedRaceId) {
  var tournaments = await Tournament.find({})
    .select("races registrations")
    .lean()
    .exec();
  var horses = {};
  var jockeys = {};

  tournaments.forEach(function (tournament) {
    var registrations = {};
    (tournament.registrations || []).forEach(function (registration) {
      registrations[String(registration._id)] = registration;
    });
    (tournament.races || []).forEach(function (race) {
      if (String(race._id) === String(excludedRaceId || "")) return;
      var isFinalized = Boolean(race.resultFinalizedAt) || tm.toRaceStatusCode(race.status) === "RESULT_CONFIRMED";
      if (!isFinalized) return;
      (race.results || []).forEach(function (result) {
        if (Number(result.position || 0) <= 0) return;
        var registration = registrations[String(result.participantId || "")] || {};
        var horseId = String(result.horseId || registration.horseId || "");
        var jockeyId = String(result.jockeyId || registration.jockeyId || "");
        if (horseId) {
          horses[horseId] = horses[horseId] || emptyStats();
          horses[horseId].starts += 1;
          if (Number(result.position) === 1) horses[horseId].wins += 1;
        }
        if (jockeyId) {
          jockeys[jockeyId] = jockeys[jockeyId] || emptyStats();
          jockeys[jockeyId].starts += 1;
          if (Number(result.position) === 1) jockeys[jockeyId].wins += 1;
        }
      });
    });
  });

  Object.keys(horses).forEach(function (id) { calculateRate(horses[id]); });
  Object.keys(jockeys).forEach(function (id) { calculateRate(jockeys[id]); });
  return { horses: horses, jockeys: jockeys };
}

module.exports = { getPerformanceMaps: getPerformanceMaps, emptyStats: emptyStats };
