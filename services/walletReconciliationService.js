var walletModels = require("../models/wallet");
var Wallet = walletModels.Wallet;
var WalletOperation = walletModels.WalletOperation;
var WalletTransaction = walletModels.WalletTransaction;
var DepositOrder = walletModels.DepositOrder;
var Withdrawal = walletModels.Withdrawal;
var TreasuryAlert = walletModels.TreasuryAlert;
var { Bet, BetMarket } = require("../models/betting");
var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");

function add(map, userId, amount) {
  var key = String(userId || "");
  if (!key) return;
  map[key] = Number(map[key] || 0) + Number(amount || 0);
}

async function reconcile() {
  var results = await Promise.all([
    Wallet.find({ status: { $in: ["ACTIVE", "FROZEN"] } }).lean().exec(),
    Bet.find({ status: { $in: ["PLACED", "LOCKED"] } }).lean().exec(),
    Withdrawal.find({ status: { $in: ["PENDING", "APPROVED"] } }).lean().exec(),
    JockeyInvitation.find({ rewardStatus: "HELD" }).lean().exec(),
    Tournament.find({ $or: [{ "registrations.depositStatus": "HELD" }, { "races.status": "Hoàn thành" }] }).lean().exec(),
    DepositOrder.countDocuments({ status: "PAID", operationId: null }),
    Bet.countDocuments({ status: { $in: ["WON", "LOST", "REFUNDED"] }, settlementOperationId: null }),
    WalletOperation.aggregate([
      { $match: { status: "COMPLETED" } },
      { $lookup: { from: WalletTransaction.collection.name, localField: "_id", foreignField: "operationId", as: "postings" } },
      { $match: { "postings.0": { $exists: false } } },
      { $count: "count" },
    ]),
    TreasuryAlert.countDocuments({ status: "OPEN" }),
  ]);

  var wallets = results[0];
  var expectedHold = {};
  results[1].forEach(function (bet) { add(expectedHold, bet.userId, bet.stakeAmount); });
  results[2].forEach(function (withdrawal) { add(expectedHold, withdrawal.userId, withdrawal.amount); });
  results[3].forEach(function (invitation) { add(expectedHold, invitation.ownerId, invitation.reward); });
  var racesMissingSettlement = 0;
  results[4].forEach(function (tournament) {
    (tournament.registrations || []).forEach(function (reg) {
      if (reg.depositStatus === "HELD") add(expectedHold, reg.ownerId, reg.depositAmount);
    });
    (tournament.races || []).forEach(function (race) {
      if (race.status === "Hoàn thành" && race.financialSettlementStatus !== "SETTLED") racesMissingSettlement += 1;
    });
  });

  var walletKeys = {};
  var duplicateWallets = 0;
  var negativeUserWallets = 0;
  var holdMismatches = [];
  var userLiability = 0;
  var treasuryBalance = 0;
  wallets.forEach(function (wallet) {
    var key = wallet.ownerType === "SYSTEM" ? "SYSTEM" : "USER:" + String(wallet.userId || "");
    walletKeys[key] = Number(walletKeys[key] || 0) + 1;
    if (walletKeys[key] === 2) duplicateWallets += 1;
    if (wallet.ownerType === "USER") {
      if (Number(wallet.availableBalance) < 0 || Number(wallet.holdBalance) < 0) negativeUserWallets += 1;
      userLiability += Number(wallet.availableBalance || 0) + Number(wallet.holdBalance || 0);
      var expected = Number(expectedHold[String(wallet.userId)] || 0);
      var actual = Number(wallet.holdBalance || 0);
      if (expected !== actual) holdMismatches.push({ userId: String(wallet.userId), expected: expected, actual: actual, difference: actual - expected });
      delete expectedHold[String(wallet.userId)];
    } else {
      treasuryBalance += Number(wallet.availableBalance || 0);
    }
  });
  Object.keys(expectedHold).forEach(function (userId) {
    if (expectedHold[userId] !== 0) holdMismatches.push({ userId: userId, expected: expectedHold[userId], actual: 0, difference: -expectedHold[userId] });
  });

  var badMarkets = await BetMarket.countDocuments({ status: "SETTLED", _id: { $in: await Bet.distinct("marketId", { status: { $in: ["PLACED", "LOCKED"] } }) } });
  return {
    generatedAt: new Date(),
    balances: { treasuryAsset: treasuryBalance, userLiability: userLiability },
    issues: {
      duplicateWallets: duplicateWallets,
      negativeUserWallets: negativeUserWallets,
      holdMismatches: { count: holdMismatches.length, totalAbsoluteDifference: holdMismatches.reduce(function (sum, row) { return sum + Math.abs(row.difference); }, 0), rows: holdMismatches.slice(0, 100) },
      paidOrdersMissingOperation: results[5],
      terminalBetsMissingSettlement: results[6],
      completedOperationsMissingPostings: results[7][0] ? results[7][0].count : 0,
      racesMissingFinancialSettlement: racesMissingSettlement,
      settledMarketsWithOpenBets: badMarkets,
      openTreasuryAlerts: results[8],
    },
  };
}

module.exports = { reconcile: reconcile };
