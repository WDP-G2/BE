var test = require("node:test");
var assert = require("node:assert/strict");

var testUri = process.env.MONGODB_TEST_URI || "";
var skipReason = testUri ? false : "Set MONGODB_TEST_URI to a MongoDB replica-set test database";

test("wallet ledger transaction, concurrency and idempotency", { skip: skipReason }, async function () {
  if (!/test/i.test(testUri)) throw new Error("MONGODB_TEST_URI database name must contain 'test'");
  process.env.MONGODB_URI = testUri;
  var mongoose = require("../db");
  await mongoose.connectPromise;
  var models = require("../models/wallet");
  var ledger = require("../services/walletLedger");
  var userId = new mongoose.Types.ObjectId();
  var prefix = "integration:" + userId;
  var wallet = await models.Wallet.create({ ownerType: "USER", userId: userId, accountClass: "USER_LIABILITY", availableBalance: 10000, holdBalance: 0 });

  try {
    var payload = {
      idempotencyKey: prefix + ":same",
      type: "BET_PLACE",
      referenceType: "TEST",
      referenceId: prefix,
      postings: [{ walletId: wallet._id, userId: userId, transactionType: "BET_STAKE", availableDelta: -1000, holdDelta: 1000 }],
    };
    var sameResults = await Promise.all([ledger.executeOperation(payload), ledger.executeOperation(payload)]);
    assert.equal(sameResults.filter(function (result) { return result.idempotent; }).length, 1);
    assert.equal(await models.WalletOperation.countDocuments({ idempotencyKey: prefix + ":same" }), 1);
    wallet = await models.Wallet.findById(wallet._id);
    assert.equal(wallet.availableBalance, 9000);
    assert.equal(wallet.holdBalance, 1000);

    await assert.rejects(ledger.executeOperation({
      idempotencyKey: prefix + ":rollback",
      type: "TEST_ROLLBACK",
      postings: [{ walletId: wallet._id, userId: userId, transactionType: "FEE", availableDelta: -500, holdDelta: 0 }],
      mutateDomain: async function () { throw new Error("injected failure"); },
    }), /injected failure/);
    wallet = await models.Wallet.findById(wallet._id);
    assert.equal(wallet.availableBalance, 9000);
    assert.equal(await models.WalletOperation.countDocuments({ idempotencyKey: prefix + ":rollback" }), 0);

    var overspend = await Promise.allSettled([
      ledger.executeOperation({ idempotencyKey: prefix + ":spend-a", type: "TEST_SPEND", postings: [{ walletId: wallet._id, userId: userId, transactionType: "FEE", availableDelta: -8000, holdDelta: 0 }] }),
      ledger.executeOperation({ idempotencyKey: prefix + ":spend-b", type: "TEST_SPEND", postings: [{ walletId: wallet._id, userId: userId, transactionType: "FEE", availableDelta: -8000, holdDelta: 0 }] }),
    ]);
    assert.equal(overspend.filter(function (result) { return result.status === "fulfilled"; }).length, 1);
    wallet = await models.Wallet.findById(wallet._id);
    assert.equal(wallet.availableBalance, 1000);
  } finally {
    var operations = await models.WalletOperation.find({ idempotencyKey: { $regex: "^" + prefix } }).select("_id");
    await models.WalletTransaction.deleteMany({ operationId: { $in: operations.map(function (row) { return row._id; }) } });
    await models.TreasuryAlert.deleteMany({ operationId: { $in: operations.map(function (row) { return row._id; }) } });
    await models.WalletOperation.deleteMany({ _id: { $in: operations.map(function (row) { return row._id; }) } });
    await models.Wallet.deleteOne({ _id: wallet._id });
    await mongoose.disconnect();
  }
});
