require("dotenv").config();
process.env.MONGOOSE_AUTO_INDEX = "false";
var mongoose = require("../db");
var walletModels = require("../models/wallet");
var Wallet = walletModels.Wallet;
var WalletTransaction = walletModels.WalletTransaction;
var Withdrawal = walletModels.Withdrawal;
var { Bet } = require("../models/betting");
var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");
var { executeOperation } = require("../services/walletLedger");
var raceFinancialSettlementService = require("../services/raceFinancialSettlementService");

var apply = process.argv.indexOf("--apply") >= 0;
var confirmedBackup = process.argv.indexOf("--confirm-backup") >= 0;

function walletGroupKey(wallet) {
  return wallet.ownerType === "SYSTEM" ? "SYSTEM" : "USER:" + String(wallet.userId || "");
}

async function mergeDuplicateWallets(wallets) {
  var groups = {};
  wallets.forEach(function (wallet) {
    var key = walletGroupKey(wallet);
    groups[key] = groups[key] || [];
    groups[key].push(wallet);
  });
  var duplicateGroups = Object.values(groups).filter(function (rows) { return rows.length > 1; });
  if (!apply) return duplicateGroups.length;

  for (var i = 0; i < duplicateGroups.length; i += 1) {
    var rows = duplicateGroups[i].sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    await mongoose.connection.transaction(async function (session) {
      var canonical = rows[0];
      var extras = rows.slice(1);
      var available = extras.reduce(function (sum, row) { return sum + Number(row.availableBalance || 0); }, 0);
      var hold = extras.reduce(function (sum, row) { return sum + Number(row.holdBalance || 0); }, 0);
      await Wallet.updateOne({ _id: canonical._id }, { $inc: { availableBalance: available, holdBalance: hold } }, { session: session });
      for (var j = 0; j < extras.length; j += 1) {
        await WalletTransaction.updateMany({ walletId: extras[j]._id }, { $set: { walletId: canonical._id } }, { session: session });
        await Wallet.updateOne({ _id: extras[j]._id }, { $set: { status: "MERGED", mergedInto: canonical._id, availableBalance: 0, holdBalance: 0 } }, { session: session });
      }
    });
  }
  return duplicateGroups.length;
}

async function createOpeningOperations() {
  var wallets = await Wallet.find({ status: { $in: ["ACTIVE", "FROZEN"] } }).exec();
  var created = 0;
  for (var i = 0; i < wallets.length; i += 1) {
    var result = await executeOperation({
      idempotencyKey: "migration:opening-balance:" + wallets[i]._id,
      type: "OPENING_BALANCE",
      referenceType: "WALLET",
      referenceId: String(wallets[i]._id),
      metadata: { availableBalance: wallets[i].availableBalance, holdBalance: wallets[i].holdBalance },
      postings: [{ walletId: wallets[i]._id, transactionType: "OPENING_BALANCE", availableDelta: 0, holdDelta: 0, amount: 0, description: "Số dư đầu kỳ khi chuyển sang ledger" }],
    });
    if (!result.idempotent) created += 1;
  }
  return created;
}

async function importLegacyHolds() {
  var bets = await Bet.find({ status: { $in: ["PLACED", "LOCKED"] }, placementOperationId: null }).exec();
  var withdrawals = await Withdrawal.find({ status: { $in: ["PENDING", "APPROVED"] }, requestOperationId: null }).exec();
  var imported = 0;
  for (var i = 0; i < bets.length; i += 1) {
    var bet = bets[i];
    var betResult = await executeOperation({
      idempotencyKey: "migration:legacy-bet:" + bet._id,
      type: "LEGACY_IMPORTED",
      referenceType: "BET",
      referenceId: String(bet._id),
      metadata: { expectedHold: bet.stakeAmount },
      postings: [{ ownerType: "USER", userId: bet.userId, transactionType: "LEGACY_IMPORTED", availableDelta: 0, holdDelta: 0, amount: 0, description: "Import hold cược cũ" }],
      mutateDomain: function (session, operation) { return Bet.updateOne({ _id: bet._id, placementOperationId: null }, { $set: { placementOperationId: operation._id } }, { session: session }); },
    });
    if (!betResult.idempotent) imported += 1;
  }
  for (var j = 0; j < withdrawals.length; j += 1) {
    var withdrawal = withdrawals[j];
    var withdrawalResult = await executeOperation({
      idempotencyKey: "migration:legacy-withdrawal:" + withdrawal._id,
      type: "LEGACY_IMPORTED",
      referenceType: "WITHDRAWAL",
      referenceId: String(withdrawal._id),
      metadata: { expectedHold: withdrawal.amount },
      postings: [{ walletId: withdrawal.walletId, transactionType: "LEGACY_IMPORTED", availableDelta: 0, holdDelta: 0, amount: 0, description: "Import hold rút tiền cũ" }],
      mutateDomain: function (session, operation) { return Withdrawal.updateOne({ _id: withdrawal._id, requestOperationId: null }, { $set: { requestOperationId: operation._id } }, { session: session }); },
    });
    if (!withdrawalResult.idempotent) imported += 1;
  }
  return imported;
}

async function markLegacyRegistrations() {
  return Tournament.updateMany(
    { "registrations.status": { $in: ["Đã duyệt", "Đang chạy", "Hoàn thành"] }, "registrations.paymentStatus": "UNCHARGED" },
    { $set: { "registrations.$[reg].paymentStatus": "LEGACY_NO_CHARGE" } },
    { arrayFilters: [{ "reg.status": { $in: ["Đã duyệt", "Đang chạy", "Hoàn thành"] }, "reg.paymentStatus": "UNCHARGED" }] },
  ).exec();
}

async function settleLegacyRaces() {
  var tournaments = await Tournament.find({ "races.status": "Hoàn thành", "races.financialSettlementStatus": { $ne: "SETTLED" } }).exec();
  var settled = 0;
  for (var i = 0; i < tournaments.length; i += 1) {
    var tournament = tournaments[i];
    for (var j = 0; j < tournament.races.length; j += 1) {
      var race = tournament.races[j];
      if (race.status !== "Hoàn thành" || race.financialSettlementStatus === "SETTLED" || !(race.results || []).length) continue;
      await raceFinancialSettlementService.finalizeRace({ tournament: tournament, race: race }, null);
      settled += 1;
    }
  }
  return settled;
}

async function findLegacyJockeyRewards() {
  var invitations = await JockeyInvitation.find({ status: "Đã chấp nhận", rewardStatus: { $in: ["NONE", null] }, reward: { $gt: 0 } }).exec();
  var valid = [];
  for (var i = 0; i < invitations.length; i += 1) {
    var tournament = await Tournament.findOne({ _id: invitations[i].tournamentId, "races._id": invitations[i].raceId }).exec();
    if (!tournament) continue;
    var race = tournament.races.id(invitations[i].raceId);
    var participated = (race.results || []).some(function (result) {
      return String(result.jockeyId || "") === String(invitations[i].jockeyId) && String(result.horseId || "") === String(invitations[i].horseId);
    });
    if (race.status === "Hoàn thành" && participated) valid.push(invitations[i]);
  }
  return valid;
}

async function settleLegacyJockeyRewards(invitations) {
  var settled = 0;
  for (var i = 0; i < invitations.length; i += 1) {
    var invitation = invitations[i];
    var result = await executeOperation({
      idempotencyKey: "migration:legacy-jockey-reward:" + invitation._id,
      type: "JOCKEY_REWARD_PAYOUT",
      referenceType: "JOCKEY_INVITATION",
      referenceId: String(invitation._id),
      postings: [
        { ownerType: "USER", userId: invitation.ownerId, transactionType: "JOCKEY_REWARD", availableDelta: -Number(invitation.reward), holdDelta: 0, description: "Thanh toán thù lao jockey cũ" },
        { ownerType: "USER", userId: invitation.jockeyId, transactionType: "JOCKEY_REWARD", availableDelta: Number(invitation.reward), holdDelta: 0, description: "Nhận thù lao jockey cũ" },
      ],
      mutateDomain: function (session, operation) {
        return JockeyInvitation.updateOne({ _id: invitation._id, rewardStatus: { $in: ["NONE", null] } }, { $set: { rewardStatus: "PAID", rewardSettlementOperationId: operation._id } }, { session: session });
      },
    });
    if (!result.idempotent) settled += 1;
  }
  return settled;
}

async function createIndexes() {
  await Wallet.collection.createIndex(
    { ownerType: 1, userId: 1 },
    { unique: true, partialFilterExpression: { ownerType: "USER", status: { $in: ["ACTIVE", "FROZEN"] } }, name: "uniq_active_user_wallet" },
  );
  await Wallet.collection.createIndex(
    { ownerType: 1 },
    { unique: true, partialFilterExpression: { ownerType: "SYSTEM", status: { $in: ["ACTIVE", "FROZEN"] } }, name: "uniq_active_treasury_wallet" },
  );
}

async function main() {
  await mongoose.connectPromise;
  if (apply && !confirmedBackup) throw new Error("--apply yêu cầu --confirm-backup sau khi đã backup database");
  var wallets = await Wallet.find({ status: { $in: ["ACTIVE", "FROZEN"] } }).sort({ createdAt: 1 }).exec();
  var duplicateGroups = await mergeDuplicateWallets(wallets);
  var pendingLegacyRaces = await Tournament.countDocuments({ "races.status": "Hoàn thành", "races.financialSettlementStatus": { $ne: "SETTLED" } });
  var pendingLegacyRegistrations = await Tournament.countDocuments({ "registrations.status": { $in: ["Đã duyệt", "Đang chạy", "Hoàn thành"] }, "registrations.paymentStatus": "UNCHARGED" });
  var legacyJockeyRewards = await findLegacyJockeyRewards();
  var report = { mode: apply ? "APPLY" : "DRY_RUN", duplicateWalletGroups: duplicateGroups, legacyRacesToSettle: pendingLegacyRaces, tournamentsWithLegacyRegistrations: pendingLegacyRegistrations, legacyJockeyRewardsToSettle: legacyJockeyRewards.length, legacyJockeyRewardsAmount: legacyJockeyRewards.reduce(function (sum, item) { return sum + Number(item.reward || 0); }, 0) };
  if (apply) {
    report.openingOperationsCreated = await createOpeningOperations();
    report.legacyHoldsImported = await importLegacyHolds();
    report.legacyRegistrationUpdates = (await markLegacyRegistrations()).modifiedCount;
    report.legacyJockeyRewardsSettled = await settleLegacyJockeyRewards(legacyJockeyRewards);
    report.legacyRacesSettled = await settleLegacyRaces();
    await createIndexes();
    report.indexesCreated = true;
  }
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async function (err) {
  console.error(err && err.stack ? err.stack : err);
  await mongoose.disconnect().catch(function () {});
  process.exitCode = 1;
});
