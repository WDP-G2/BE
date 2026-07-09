var Tournament = require("../models/tournament");
var { prizeAmountForRank } = require("./tournamentRaceService");

function findOwnerRegistration(registrations, result, raceId) {
  var ownerRegs = registrations || [];
  if (result.participantId) {
    var byParticipant = ownerRegs.find(function (reg) {
      return String(reg._id) === String(result.participantId);
    });
    if (byParticipant) return byParticipant;
  }

  return ownerRegs.find(function (reg) {
    if (String(reg.raceId || "") !== String(raceId || "")) return false;
    if (result.horseName && reg.horseName && String(reg.horseName) === String(result.horseName)) {
      return true;
    }
    if (result.jockeyId && reg.jockeyId && String(reg.jockeyId) === String(result.jockeyId)) {
      return true;
    }
    return false;
  });
}

async function buildOwnerResultsPayload(ownerId) {
  var tournaments = await Tournament.find({ "registrations.ownerId": ownerId })
    .lean()
    .exec();

  var rows = [];
  var horseStats = {};

  tournaments.forEach(function (tournament) {
    var ownerRegs = (tournament.registrations || []).filter(function (reg) {
      return String(reg.ownerId || "") === String(ownerId);
    });

    (tournament.races || []).forEach(function (race) {
      (race.results || []).forEach(function (result) {
        var position = Number(result.position || 0);
        if (!position) return;

        var registration = findOwnerRegistration(ownerRegs, result, race._id);
        if (!registration) return;

        var horseName = result.horseName || registration.horseName || "";
        var prizeAmount = prizeAmountForRank(race, position);
        var finishTimeMillis =
          result.time && result.time !== "—" ? Number(result.time) : 0;

        rows.push({
          id: String(result._id),
          tournamentId: String(tournament._id),
          tournamentName: tournament.name || "",
          raceId: String(race._id),
          raceName: race.name || "",
          horseName: horseName,
          jockeyName: result.jockeyName || registration.jockeyName || "",
          position: position,
          prizeAmount: prizeAmount,
          finishTimeMillis: Number.isFinite(finishTimeMillis) ? finishTimeMillis : 0,
          date: race.resultFinalizedAt || race.scheduledAt || race.updatedAt || tournament.updatedAt,
        });

        if (!horseStats[horseName]) {
          horseStats[horseName] = {
            name: horseName,
            wins: 0,
            races: 0,
            totalPrize: 0,
          };
        }
        horseStats[horseName].races += 1;
        horseStats[horseName].totalPrize += prizeAmount;
        if (position === 1) horseStats[horseName].wins += 1;
      });
    });
  });

  rows.sort(function (a, b) {
    var aTime = a.date ? new Date(a.date).getTime() : 0;
    var bTime = b.date ? new Date(b.date).getTime() : 0;
    return bTime - aTime;
  });

  var bestHorse = Object.values(horseStats).sort(function (a, b) {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.totalPrize !== a.totalPrize) return b.totalPrize - a.totalPrize;
    return b.races - a.races;
  })[0];

  var totalWins = rows.filter(function (row) {
    return row.position === 1;
  }).length;
  var totalPrize = rows.reduce(function (sum, row) {
    return sum + Number(row.prizeAmount || 0);
  }, 0);

  return {
    summary: {
      totalWins: totalWins,
      totalRaces: rows.length,
      totalPrize: totalPrize,
      bestHorseName: bestHorse ? bestHorse.name : "",
    },
    results: rows,
  };
}

module.exports = {
  buildOwnerResultsPayload: buildOwnerResultsPayload,
};
