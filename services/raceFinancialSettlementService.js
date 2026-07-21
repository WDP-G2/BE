var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");
var systemSettingsService = require("./systemSettingsService");
var financeSettings = require("../utils/financeSettingsMapper");
var { prizeAmountForRank } = require("./tournamentRaceService");
var { executeOperation, asInteger } = require("./walletLedger");
var { apiError } = require("../utils/apiResponse");
var { splitPrize } = require("./moneyRules");
var featureFlags = require("./financialFeatureFlags");

function prizeShareForRank(shares, rank) {
  var found = (shares || []).find(function (item) { return Number(item.rank) === Number(rank); });
  return found ? Number(found.jockeyPercent || 0) : 50;
}

function participantKey(value) {
  return String(value || "");
}

async function finalizeRace(ctx, actorId) {
  featureFlags.assertEnabled("RACE_SETTLEMENT");
  var race = ctx.race;
  var raceId = String(race._id);
  if (race.financialSettlementStatus === "SETTLED") {
    return { tournament: ctx.tournament, race: race, idempotent: true };
  }

  var settingsDoc = await systemSettingsService.getSettingsDoc();
  var shares = financeSettings.readRacePrizeShares(settingsDoc);
  var invitations = await JockeyInvitation.find({ raceId: race._id, rewardStatus: "HELD" }).exec();
  var resultByParticipant = {};
  (race.results || []).forEach(function (result) {
    resultByParticipant[participantKey(result.participantId)] = result;
  });

  var postings = [];
  var registrationUpdates = [];
  var invitationUpdates = [];
  var snapshot = { deposits: [], jockeyRewards: [], prizes: [], referee: null };
  var registrations = (ctx.tournament.registrations || []).filter(function (reg) {
    return String(reg.raceId || "") === raceId;
  });

  registrations.forEach(function (reg) {
    var result = resultByParticipant[participantKey(reg._id)];
    var participated = Boolean(result);
    var participantStatus = participated
      ? (Number(result.position || 0) > 0 ? "FINISHED" : "DISQUALIFIED")
      : "ABSENT";
    var update = { id: String(reg._id), participantStatus: participantStatus, status: participated && participantStatus === "FINISHED" ? "Hoàn thành" : reg.status };

    var deposit = asInteger(reg.depositAmount || 0, "Tiền cọc đăng ký");
    if (reg.paymentStatus === "CHARGED" && reg.depositStatus === "HELD" && deposit > 0) {
      if (participantStatus === "FINISHED") {
        postings.push({ ownerType: "USER", userId: reg.ownerId, transactionType: "REGISTRATION_DEPOSIT", availableDelta: deposit, holdDelta: -deposit, description: "Hoàn cọc sau cuộc đua" });
        update.depositStatus = "REFUNDED";
        snapshot.deposits.push({ registrationId: String(reg._id), amount: deposit, outcome: "REFUNDED" });
      } else {
        postings.push({ ownerType: "USER", userId: reg.ownerId, transactionType: "REGISTRATION_DEPOSIT", availableDelta: 0, holdDelta: -deposit, description: "Tịch thu cọc do vắng mặt/loại" });
        postings.push({ ownerType: "SYSTEM", transactionType: "REGISTRATION_DEPOSIT", availableDelta: deposit, holdDelta: 0, description: "Thu cọc bị tịch thu" });
        update.depositStatus = "FORFEITED";
        update.paymentStatus = "FORFEITED";
        snapshot.deposits.push({ registrationId: String(reg._id), amount: deposit, outcome: "FORFEITED" });
      }
    }
    registrationUpdates.push(update);

    if (participated && Number(result.position || 0) > 0) {
      var prize = asInteger(prizeAmountForRank(race, result.position), "Tiền thưởng race");
      if (prize > 0 && reg.ownerId) {
        var jockeyPercent = result.jockeyId ? prizeShareForRank(shares, result.position) : 0;
        var prizeSplit = splitPrize(prize, jockeyPercent, Boolean(result.jockeyId));
        var jockeyAmount = prizeSplit.jockeyAmount;
        var ownerAmount = prizeSplit.ownerAmount;
        if (ownerAmount > 0) postings.push({ ownerType: "USER", userId: reg.ownerId, transactionType: "PRIZE_PAYOUT", availableDelta: ownerAmount, holdDelta: 0, description: "Thưởng race cho chủ ngựa" });
        if (jockeyAmount > 0) postings.push({ ownerType: "USER", userId: result.jockeyId, transactionType: "PRIZE_PAYOUT", availableDelta: jockeyAmount, holdDelta: 0, description: "Thưởng race cho jockey" });
        postings.push({ ownerType: "SYSTEM", transactionType: "PRIZE_PAYOUT", availableDelta: -prize, holdDelta: 0, description: "Chi thưởng race" });
        snapshot.prizes.push({ registrationId: String(reg._id), rank: Number(result.position), total: prize, ownerAmount: ownerAmount, jockeyAmount: jockeyAmount });
      }
    }
  });

  invitations.forEach(function (invitation) {
    var reg = registrations.find(function (item) {
      return String(item.jockeyInvitationId || "") === String(invitation._id) ||
        (String(item.ownerId || "") === String(invitation.ownerId) && String(item.jockeyId || "") === String(invitation.jockeyId) && String(item.horseId || "") === String(invitation.horseId));
    });
    var participated = reg && Boolean(resultByParticipant[participantKey(reg._id)]);
    var reward = asInteger(invitation.reward || 0, "Thù lao jockey");
    if (reward <= 0) return;
    if (participated) {
      postings.push({ ownerType: "USER", userId: invitation.ownerId, transactionType: "JOCKEY_REWARD", availableDelta: 0, holdDelta: -reward, description: "Thanh toán thù lao jockey" });
      postings.push({ ownerType: "USER", userId: invitation.jockeyId, transactionType: "JOCKEY_REWARD", availableDelta: reward, holdDelta: 0, description: "Nhận thù lao thi đấu" });
      invitationUpdates.push({ id: invitation._id, rewardStatus: "PAID" });
      snapshot.jockeyRewards.push({ invitationId: String(invitation._id), amount: reward, outcome: "PAID" });
    } else {
      postings.push({ ownerType: "USER", userId: invitation.ownerId, transactionType: "JOCKEY_REWARD", availableDelta: reward, holdDelta: -reward, description: "Hoàn thù lao jockey không thi đấu" });
      invitationUpdates.push({ id: invitation._id, rewardStatus: "REFUNDED" });
      snapshot.jockeyRewards.push({ invitationId: String(invitation._id), amount: reward, outcome: "REFUNDED" });
    }
  });

  var refereeAmount = asInteger(race.refereePaymentAmount || 0, "Thù lao trọng tài");
  if (race.refereeId && race.refereePaymentStatus === "HELD" && refereeAmount > 0) {
    postings.push({ ownerType: "USER", userId: race.refereeId, transactionType: "REFEREE_FEE", availableDelta: refereeAmount, holdDelta: 0, description: "Thù lao trọng tài" });
    postings.push({ ownerType: "SYSTEM", transactionType: "REFEREE_FEE", availableDelta: -refereeAmount, holdDelta: 0, description: "Chi thù lao trọng tài" });
    snapshot.referee = { refereeId: String(race.refereeId), amount: refereeAmount };
  }

  async function applyDomain(session, operation) {
    var tournament = await Tournament.findById(ctx.tournament._id).session(session).exec();
    if (!tournament) throw apiError("Không tìm thấy giải đấu", 404);
    var currentRace = tournament.races.id(race._id);
    if (!currentRace) throw apiError("Không tìm thấy cuộc đua", 404);
    if (currentRace.financialSettlementStatus === "SETTLED") throw apiError("Kết quả đã khóa tài chính", 409);
    currentRace.results = race.results;
    currentRace.status = "Hoàn thành";
    currentRace.resultFinalizedAt = race.resultFinalizedAt || new Date();
    currentRace.resultFinalizedBy = race.resultFinalizedBy || actorId || null;
    currentRace.financialSettlementStatus = "SETTLED";
    currentRace.financialSettledAt = new Date();
    currentRace.financialSettlementSnapshot = snapshot;
    if (race.simulation) currentRace.simulation = race.simulation;
    if (snapshot.referee) currentRace.refereePaymentStatus = "PAID";
    registrationUpdates.forEach(function (item) {
      var reg = tournament.registrations.id(item.id);
      if (!reg) return;
      reg.participantStatus = item.participantStatus;
      reg.status = item.status;
      if (item.depositStatus) reg.depositStatus = item.depositStatus;
      if (item.paymentStatus) reg.paymentStatus = item.paymentStatus;
      reg.depositOperationId = operation._id;
    });
    await tournament.save({ session: session });
    for (var i = 0; i < invitationUpdates.length; i += 1) {
      await JockeyInvitation.updateOne(
        { _id: invitationUpdates[i].id, rewardStatus: "HELD" },
        { $set: { rewardStatus: invitationUpdates[i].rewardStatus, rewardSettlementOperationId: operation._id } },
        { session: session },
      ).exec();
    }
  }

  var operation = null;
  var wasIdempotent = false;
  if (postings.length) {
    var result = await executeOperation({
      idempotencyKey: "race:financial-settlement:" + raceId,
      type: "RACE_FINANCIAL_SETTLEMENT",
      referenceType: "RACE",
      referenceId: raceId,
      actorId: actorId,
      metadata: snapshot,
      postings: postings,
      mutateDomain: applyDomain,
    });
    operation = result.operation;
    wasIdempotent = Boolean(result.idempotent);
  } else {
    // No money moves, but result locking still uses a conditional update.
    await applyDomain(null, { _id: null });
  }

  var tournament = await Tournament.findById(ctx.tournament._id).exec();
  return {
    tournament: tournament,
    race: tournament.races.id(race._id),
    operation: operation,
    snapshot: snapshot,
    idempotent: wasIdempotent,
  };
}

module.exports = { finalizeRace: finalizeRace, prizeShareForRank: prizeShareForRank };
