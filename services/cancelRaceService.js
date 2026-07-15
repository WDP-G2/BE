var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");
var { BetMarket } = require("../models/betting");
var { findRaceContext } = require("./tournamentRaceService");
var { executeOperation, asInteger } = require("./walletLedger");
var { apiError } = require("../utils/apiResponse");
var featureFlags = require("./financialFeatureFlags");

async function cancelRace(raceId, actorId, reason) {
  featureFlags.assertEnabled("RACE_SETTLEMENT");
  var ctx = await findRaceContext(raceId, { repair: false });
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  if (ctx.race.financialSettlementStatus === "SETTLED") throw apiError("Không thể hủy race đã quyết toán", 409);
  if (ctx.race.financialSettlementStatus === "CANCELLED") return ctx;

  var registrations = (ctx.tournament.registrations || []).filter(function (reg) {
    return String(reg.raceId || "") === String(ctx.race._id) && reg.paymentStatus === "CHARGED";
  });
  var invitations = await JockeyInvitation.find({ raceId: ctx.race._id, rewardStatus: "HELD" }).exec();
  var postings = [];

  registrations.forEach(function (reg) {
    var entryFee = asInteger(reg.entryFeeAmount || 0, "Phí đăng ký");
    var deposit = reg.depositStatus === "HELD" ? asInteger(reg.depositAmount || 0, "Tiền cọc") : 0;
    if (entryFee + deposit > 0) postings.push({ ownerType: "USER", userId: reg.ownerId, transactionType: "REGISTRATION_DEPOSIT", availableDelta: entryFee + deposit, holdDelta: -deposit, description: "Hoàn phí và cọc do race bị hủy" });
    if (entryFee > 0) postings.push({ ownerType: "SYSTEM", transactionType: "ENTRY_FEE", availableDelta: -entryFee, holdDelta: 0, description: "Hoàn phí đăng ký race bị hủy" });
  });
  invitations.forEach(function (invitation) {
    var reward = asInteger(invitation.reward || 0, "Thù lao jockey");
    if (reward > 0) postings.push({ ownerType: "USER", userId: invitation.ownerId, transactionType: "JOCKEY_REWARD", availableDelta: reward, holdDelta: -reward, description: "Hoàn thù lao do race bị hủy" });
  });

  async function mutateDomain(session, operation) {
    var tournament = await Tournament.findById(ctx.tournament._id).session(session).exec();
    var race = tournament && tournament.races.id(ctx.race._id);
    if (!race) throw apiError("Không tìm thấy cuộc đua", 404);
    if (race.financialSettlementStatus === "SETTLED") throw apiError("Không thể hủy race đã quyết toán", 409);
    race.status = "Đã hủy";
    race.financialSettlementStatus = "CANCELLED";
    race.financialSettledAt = new Date();
    race.financialSettlementSnapshot = { cancelled: true, reason: reason || "", refundedRegistrations: registrations.length, refundedInvitations: invitations.length };
    registrations.forEach(function (source) {
      var reg = tournament.registrations.id(source._id);
      if (!reg) return;
      reg.paymentStatus = "REFUNDED";
      if (reg.depositStatus === "HELD") reg.depositStatus = "REFUNDED";
      reg.depositOperationId = operation && operation._id ? operation._id : null;
    });
    await tournament.save({ session: session });
    await BetMarket.updateMany({ raceId: race._id, status: { $nin: ["SETTLED"] } }, { $set: { status: "CANCELLED", closedAt: new Date() } }, { session: session }).exec();
    for (var i = 0; i < invitations.length; i += 1) {
      await JockeyInvitation.updateOne(
        { _id: invitations[i]._id, rewardStatus: "HELD" },
        { $set: { rewardStatus: "REFUNDED", rewardSettlementOperationId: operation && operation._id ? operation._id : null } },
        { session: session },
      ).exec();
    }
  }

  if (postings.length) {
    await executeOperation({
      idempotencyKey: "race:cancel:" + ctx.race._id,
      type: "RACE_CANCELLATION",
      referenceType: "RACE",
      referenceId: String(ctx.race._id),
      actorId: actorId,
      metadata: { reason: reason || "" },
      postings: postings,
      mutateDomain: mutateDomain,
    });
  } else {
    await mutateDomain(null, null);
  }
  var tournament = await Tournament.findById(ctx.tournament._id).exec();
  return { tournament: tournament, race: tournament.races.id(ctx.race._id) };
}

module.exports = { cancelRace: cancelRace };
