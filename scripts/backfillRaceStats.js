var mongoose = require("../db");
var Tournament = require("../models/tournament");
var Horse = require("../models/horse");
var tm = require("../utils/tournamentMapper");

async function run() {
  await mongoose.connectPromise;
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MONGODB_URI is required for race stats backfill");
  }

  var apply = process.argv.indexOf("--apply") !== -1;
  var tournaments = await Tournament.find({}).exec();
  var stats = {};
  var changedTournaments = [];
  var backfilledResultIds = 0;
  var finalizedResults = 0;

  tournaments.forEach(function (tournament) {
    var registrations = {};
    (tournament.registrations || []).forEach(function (registration) {
      registrations[String(registration._id)] = registration;
    });
    var changed = false;
    (tournament.races || []).forEach(function (race) {
      var finalized = Boolean(race.resultFinalizedAt) || tm.toRaceStatusCode(race.status) === "RESULT_CONFIRMED";
      if (!finalized) return;
      (race.results || []).forEach(function (result) {
        var registration = registrations[String(result.participantId || "")];
        if (!result.horseId && registration && registration.horseId) {
          result.horseId = registration.horseId;
          changed = true;
          backfilledResultIds += 1;
        }
        if (!result.horseId || Number(result.position || 0) <= 0) return;
        finalizedResults += 1;
        var horseId = String(result.horseId);
        stats[horseId] = stats[horseId] || { races: 0, wins: 0 };
        stats[horseId].races += 1;
        if (Number(result.position) === 1) stats[horseId].wins += 1;
      });
    });
    if (changed) changedTournaments.push(tournament);
  });

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    tournamentCount: tournaments.length,
    tournamentsToUpdate: changedTournaments.length,
    resultHorseIdsToBackfill: backfilledResultIds,
    finalizedResults: finalizedResults,
    horsesToRecalculate: Object.keys(stats).length,
  }, null, 2));

  if (apply) {
    for (var index = 0; index < changedTournaments.length; index += 1) {
      await changedTournaments[index].save();
    }
    var horseIds = Object.keys(stats);
    if (horseIds.length) {
      await Horse.bulkWrite(horseIds.map(function (horseId) {
        return {
          updateOne: {
            filter: { _id: horseId },
            update: { $set: { races: stats[horseId].races, wins: stats[horseId].wins } },
          },
        };
      }));
    }
    console.log("Backfill applied successfully");
  } else {
    console.log("Dry-run only. Re-run with --apply to write changes.");
  }
}

run()
  .catch(function (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(function () {
    return mongoose.disconnect();
  });
