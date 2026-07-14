var test = require("node:test");
var assert = require("node:assert/strict");
var engine = require("../services/raceSimulationEngine");

function participants() {
  return [
    { participantId: "a", horseWinRate: 0.8, jockeyWinRate: 0.7 },
    { participantId: "b", horseWinRate: 0.5, jockeyWinRate: 0.5 },
    { participantId: "c", horseWinRate: 0.25, jockeyWinRate: 0.3 },
  ];
}

test("same seed produces the same official result", function () {
  var first = engine.runSimulation(participants(), "fixed-seed", "1200m");
  var second = engine.runSimulation(participants(), "fixed-seed", "1200m");
  assert.deepEqual(first, second);
});

test("initial probabilities sum to one and ranks are unique", function () {
  var result = engine.runSimulation(participants(), "probability-seed", "1000m");
  var total = result.reduce(function (sum, row) { return sum + row.initialWinProbability; }, 0);
  assert.ok(Math.abs(total - 1) < 1e-10);
  assert.deepEqual(result.map(function (row) { return row.rank; }), [1, 2, 3]);
  assert.equal(new Set(result.map(function (row) { return row.participantId; })).size, 3);
});

test("finish times preserve rank and checkpoints reach the finish", function () {
  var result = engine.runSimulation(participants(), "timing-seed", "1.5km");
  for (var index = 1; index < result.length; index += 1) {
    assert.ok(result[index].finishTimeMillis > result[index - 1].finishTimeMillis);
  }
  result.forEach(function (row) {
    assert.equal(row.checkpoints[row.checkpoints.length - 1].progress, 1);
  });
});

test("invalid distance falls back to 1000 meters", function () {
  assert.equal(engine.parseDistanceMeters("unknown"), 1000);
  assert.equal(engine.parseDistanceMeters("1.2 km"), 1200);
});
