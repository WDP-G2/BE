var test = require("node:test");
var assert = require("node:assert/strict");
var sync = require("../services/tournamentStatusSync");
var tm = require("../utils/tournamentMapper");

function tournament(status, raceCodes) {
  return {
    status: tm.TOURNAMENT_STATUS_LABELS[status],
    races: raceCodes.map(function (code) {
      return { status: tm.RACE_STATUS_LABELS[code], results: [] };
    }),
  };
}

test("scheduling a tournament moves only preparatory races to SCHEDULED", function () {
  var item = tournament("SCHEDULED", [
    "DRAFT",
    "PUBLISHED",
    "OPEN_REGISTRATION",
    "REGISTRATION_CLOSED",
    "RESULT_CONFIRMED",
    "CANCELLED",
  ]);

  assert.equal(sync.syncScheduledRaceStatuses(item), true);
  assert.deepEqual(item.races.map(function (race) {
    return tm.toRaceStatusCode(race.status);
  }), [
    "SCHEDULED",
    "SCHEDULED",
    "SCHEDULED",
    "SCHEDULED",
    "RESULT_CONFIRMED",
    "CANCELLED",
  ]);
});

test("an ONGOING tournament never starts or rewinds races", function () {
  var item = tournament("ONGOING", ["SCHEDULED", "ONGOING", "RESULT_CONFIRMED", "CANCELLED"]);
  var before = item.races.map(function (race) { return race.status; });

  assert.equal(sync.repairRacesForOngoingTournament(item), false);
  assert.equal(sync.syncTournamentRaceStatuses(item, "ONGOING"), false);
  assert.deepEqual(item.races.map(function (race) { return race.status; }), before);
});

test("start preparation does not mutate the selected race", function () {
  var item = tournament("ONGOING", ["ONGOING"]);
  assert.equal(sync.ensureRaceScheduledForStart(item, item.races[0]), "ONGOING");
  assert.equal(tm.toRaceStatusCode(item.races[0].status), "ONGOING");
});

test("legacy results infer their official participant status", function () {
  assert.equal(tm.mapResult({ _id: "legacy-finished", position: 1 }).status, "FINISHED");
  assert.equal(tm.mapResult({ _id: "legacy-dq", position: 0 }).status, "DISQUALIFIED");
});
