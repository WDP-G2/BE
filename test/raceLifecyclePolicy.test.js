var test = require("node:test");
var assert = require("node:assert/strict");
var tm = require("../utils/tournamentMapper");
var raceService = require("../services/raceLifecyclePolicy");

function registration(id, raceId, overrides) {
  return Object.assign({
    _id: id,
    raceId: raceId,
    status: "Đã duyệt",
    participantStatus: "REGISTERED",
    checkInStatus: "PENDING",
    gateNumber: 1,
    horseName: "Horse " + id,
    notes: "",
  }, overrides || {});
}

function context(overrides) {
  var race = Object.assign({
    _id: "race-1",
    status: tm.RACE_STATUS_LABELS.SCHEDULED,
    refereeId: "referee-1",
    minHorses: 1,
    results: [],
    resultFinalizedAt: null,
  }, overrides && overrides.race || {});
  var tournament = Object.assign({
    status: tm.TOURNAMENT_STATUS_LABELS.ONGOING,
    registrations: [registration("p1", race._id, {
      checkInStatus: "CHECKED_IN",
      participantStatus: "CHECKED_IN",
    })],
  }, overrides && overrides.tournament || {});
  return { tournament: tournament, race: race };
}

test("race start policy requires assignment, tournament and scheduled race", function () {
  var ready = context();
  assert.doesNotThrow(function () {
    raceService.assertRaceCanStart(ready.tournament, ready.race, "referee-1");
  });

  var unassigned = context();
  assert.throws(function () {
    raceService.assertRaceCanStart(unassigned.tournament, unassigned.race, "referee-2");
  }, function (err) { return err.status === 403; });

  var tournamentNotStarted = context({ tournament: { status: tm.TOURNAMENT_STATUS_LABELS.SCHEDULED } });
  assert.throws(function () {
    raceService.assertRaceCanStart(tournamentNotStarted.tournament, tournamentNotStarted.race, "referee-1");
  }, function (err) { return err.status === 400; });

  var alreadyStarted = context({ race: { status: tm.RACE_STATUS_LABELS.ONGOING } });
  assert.throws(function () {
    raceService.assertRaceCanStart(alreadyStarted.tournament, alreadyStarted.race, "referee-1");
  }, function (err) { return err.status === 400; });
});

test("race start policy validates positive unique gates and minimum check-in", function () {
  var invalidGate = context();
  invalidGate.tournament.registrations[0].gateNumber = 1.5;
  assert.throws(function () {
    raceService.assertRaceCanStart(invalidGate.tournament, invalidGate.race, "referee-1");
  }, /Gate number/);

  var duplicateGate = context();
  duplicateGate.race.minHorses = 2;
  duplicateGate.tournament.registrations.push(registration("p2", "race-1", {
    checkInStatus: "CHECKED_IN",
    participantStatus: "CHECKED_IN",
    gateNumber: 1,
  }));
  assert.throws(function () {
    raceService.assertRaceCanStart(duplicateGate.tournament, duplicateGate.race, "referee-1");
  }, /already exists/);

  var insufficient = context();
  insufficient.race.minHorses = 2;
  assert.throws(function () {
    raceService.assertRaceCanStart(insufficient.tournament, insufficient.race, "referee-1");
  }, /enough checked-in/);
});

test("starting one race marks checked-in horses racing and remaining horses absent", function () {
  var item = context();
  item.tournament.registrations.push(registration("p2", "race-1", { gateNumber: 2 }));
  item.tournament.registrations.push(registration("other", "race-2", { gateNumber: 1 }));

  raceService.applyRaceStartedState(item.tournament, item.race);

  assert.equal(tm.toRaceStatusCode(item.race.status), "ONGOING");
  assert.equal(item.tournament.registrations[0].participantStatus, "RACING");
  assert.equal(item.tournament.registrations[1].participantStatus, "ABSENT");
  assert.equal(item.tournament.registrations[1].checkInStatus, "ABSENT");
  assert.equal(item.tournament.registrations[2].participantStatus, "REGISTERED");
});

test("official results require every racing participant once with valid result data", function () {
  var item = context({ race: { status: tm.RACE_STATUS_LABELS.ONGOING } });
  item.tournament.registrations[0].participantStatus = "RACING";
  item.tournament.registrations.push(registration("p2", "race-1", {
    gateNumber: 2,
    checkInStatus: "CHECKED_IN",
    participantStatus: "RACING",
  }));

  var prepared = raceService.prepareOfficialRaceResults(item.tournament, item.race, [
    { participantId: "p1", rank: 1, finishTimeMillis: 61230, status: "FINISHED" },
    { participantId: "p2", status: "DISQUALIFIED", note: "False start" },
  ]);
  assert.equal(prepared.savedResults.length, 2);
  assert.equal(prepared.savedResults[0].position, 1);
  assert.equal(prepared.savedResults[1].status, "DISQUALIFIED");

  assert.throws(function () {
    raceService.prepareOfficialRaceResults(item.tournament, item.race, [
      { participantId: "p1", rank: 1, finishTimeMillis: 61230, status: "FINISHED" },
    ]);
  }, /mọi ngựa/);

  assert.throws(function () {
    raceService.prepareOfficialRaceResults(item.tournament, item.race, [
      { participantId: "p1", rank: 1, finishTimeMillis: 61230, status: "FINISHED" },
      { participantId: "p2", status: "DISQUALIFIED" },
    ]);
  }, /lý do/);
});
