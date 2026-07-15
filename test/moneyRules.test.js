var test = require("node:test");
var assert = require("node:assert/strict");
var { assertVndInteger, splitPrize } = require("../services/moneyRules");

test("VND amounts must be safe integers", function () {
  assert.equal(assertVndInteger(10000), 10000);
  assert.throws(function () { assertVndInteger(1.5); }, /integer VND/);
  assert.throws(function () { assertVndInteger(Number.MAX_SAFE_INTEGER + 1); }, /integer VND/);
});

test("prize split floors jockey and gives owner the exact remainder", function () {
  var result = splitPrize(10001, 55, true);
  assert.deepEqual(result, { ownerAmount: 4501, jockeyAmount: 5500 });
  assert.equal(result.ownerAmount + result.jockeyAmount, 10001);
});

test("owner receives 100 percent when race result has no jockey", function () {
  assert.deepEqual(splitPrize(750000, 60, false), { ownerAmount: 750000, jockeyAmount: 0 });
});

test("prize percentage is bounded", function () {
  assert.throws(function () { splitPrize(1000, 101, true); }, /between 0 and 100/);
});
