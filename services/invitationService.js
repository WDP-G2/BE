var User = require("../models/user");
var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");
var { apiError } = require("../utils/apiResponse");
var { executeOperation, asInteger } = require("./walletLedger");
var featureFlags = require("./financialFeatureFlags");
var {
  toDateInput,
  toTimeInput,
  horseAgeFromBirthDate,
  buildHorseBreedLabel,
} = require("../utils/ownerInvitationMapper");

function findRaceInTournament(tournament, raceId) {
  if (!raceId) return null;
  return (tournament.races || []).find(function (race) {
    return String(race._id) === String(raceId);
  });
}

async function createInvitation(actingUser, payload) {
  var jockeyId = payload.jockeyId || "";
  var horseId = payload.horseId || "";
  var tournamentId = payload.tournamentId || "";
  var raceId = payload.raceId || "";
  var reward = Number(payload.reward || 0);

  if (!jockeyId || !horseId || !tournamentId) {
    throw apiError("jockeyId, horseId and tournamentId are required", 400);
  }

  var results = await Promise.all([
    User.findById(jockeyId).exec(),
    Horse.findById(horseId).exec(),
    Tournament.findById(tournamentId).exec(),
  ]);
  var jockey = results[0];
  var horse = results[1];
  var tournament = results[2];

  if (!jockey || jockey.role !== "JOCKEY") {
    throw apiError("Jockey not found", 404);
  }

  if (!horse) {
    throw apiError("Horse not found", 404);
  }

  if (
    actingUser.role !== "ADMIN" &&
    String(horse.createdBy || "") !== String(actingUser.id)
  ) {
    throw apiError("Forbidden", 403);
  }

  if (!tournament) {
    throw apiError("Tournament not found", 404);
  }

  var race = findRaceInTournament(tournament, raceId);
  if (raceId && !race) {
    throw apiError("Race not found", 404);
  }

  var existingRegistration = (tournament.registrations || []).find(
    function (registration) {
      var sameJockey =
        String(registration.jockeyId || "") === String(jockey._id);
      var sameHorse =
        String(registration.horseId || "") === String(horse._id);
      var sameRace = raceId
        ? String(registration.raceId || "") === String(race?._id || "")
        : true;
      return sameJockey && sameHorse && sameRace;
    },
  );

  if (existingRegistration) {
    throw apiError("Jockey và ngựa đã được đăng ký cho race này", 409);
  }

  var duplicateFilter = {
    ownerId: actingUser.id,
    jockeyId: jockey._id,
    horseId: horse._id,
    tournamentId: tournament._id,
    status: "Chờ xử lý",
  };
  if (raceId) duplicateFilter.raceId = race._id;

  var existing = await JockeyInvitation.findOne(duplicateFilter).exec();
  if (existing) {
    throw apiError("Lời mời đang chờ xử lý đã tồn tại cho jockey này", 409);
  }

  var horseBreedLabel = buildHorseBreedLabel(horse);
  var raceLabel = race
    ? "Race R" + (race.raceNumber || "") + " · " + (race.name || "")
    : "";
  var scheduledAt =
    race && race.scheduledAt ? new Date(race.scheduledAt) : null;

  var invitationPayload = {
    ownerId: actingUser.id,
    ownerName: actingUser.fullName || actingUser.username || "",
    jockeyId: jockey._id,
    jockeyName: jockey.fullName || jockey.name || jockey.username || "",
    horseId: horse._id,
    horseName: horse.name,
    horseBreed: horseBreedLabel,
    horseAge: horseAgeFromBirthDate(horse.birthDate),
    tournamentId: tournament._id,
    tournamentName: tournament.name,
    raceId: race ? race._id : undefined,
    raceLabel: raceLabel,
    raceDate: scheduledAt
      ? toDateInput(scheduledAt)
      : toDateInput(tournament.startDate),
    raceTime: scheduledAt ? toTimeInput(scheduledAt) : "",
    location: tournament.location || race?.track || "",
    reward:
      reward > 0
        ? reward
        : race?.entryFee || tournament.config?.entryFee || 0,
    status: "Chờ xử lý",
  };

  invitationPayload.reward = asInteger(invitationPayload.reward, "Thù lao jockey");
  if (invitationPayload.reward < 0) throw apiError("Thù lao jockey không được âm", 400);
  if (invitationPayload.reward === 0) {
    invitationPayload.rewardStatus = "NONE";
    var zeroInvitation = await JockeyInvitation.create(invitationPayload);
    return { invitation: zeroInvitation, horseBreedLabel: horseBreedLabel };
  }

  featureFlags.assertEnabled("INVITATION");

  var requestKey = String(payload.idempotencyKey || payload._idempotencyKey || "").trim();
  if (!requestKey) throw apiError("Thiếu Idempotency-Key", 400);
  var result = await executeOperation({
    idempotencyKey: "jockey:invite:" + actingUser.id + ":" + requestKey,
    type: "JOCKEY_REWARD_HOLD",
    referenceType: "JOCKEY_INVITATION",
    referenceId: requestKey,
    actorId: actingUser.id,
    postings: [{ ownerType: "USER", userId: actingUser.id, transactionType: "JOCKEY_REWARD", availableDelta: -invitationPayload.reward, holdDelta: invitationPayload.reward, description: "Giữ thù lao khi gửi lời mời jockey" }],
    mutateDomain: async function (session, operation) {
      invitationPayload.rewardStatus = "HELD";
      invitationPayload.rewardHoldOperationId = operation._id;
      await JockeyInvitation.create([invitationPayload], { session: session });
    },
  });
  var invitation = await JockeyInvitation.findOne({ rewardHoldOperationId: result.operation._id }).exec();

  return { invitation: invitation, horseBreedLabel: horseBreedLabel };
}

async function listForJockey(actingUser, jockeyIdOverride) {
  var filter =
    actingUser.role === "ADMIN" && jockeyIdOverride
      ? { jockeyId: jockeyIdOverride }
      : { jockeyId: actingUser.id };

  return JockeyInvitation.find(filter).sort({ createdAt: -1 }).exec();
}

async function listForOwner(actingUser, ownerIdOverride) {
  var filter =
    actingUser.role === "ADMIN" && ownerIdOverride
      ? { ownerId: ownerIdOverride }
      : { ownerId: actingUser.id };

  return JockeyInvitation.find(filter).sort({ createdAt: -1 }).exec();
}

async function respondToInvitation(actingUser, invitationId, action) {
  var invitation = await JockeyInvitation.findById(invitationId).exec();

  if (!invitation) {
    throw apiError("Invitation not found", 404);
  }

  if (
    actingUser.role !== "ADMIN" &&
    String(invitation.jockeyId) !== String(actingUser.id)
  ) {
    throw apiError("Forbidden", 403);
  }

  if (invitation.status !== "Chờ xử lý") {
    throw apiError("Invitation already responded", 400);
  }

  if (action === "accept") {
    invitation = await JockeyInvitation.findOneAndUpdate(
      { _id: invitation._id, status: "Chờ xử lý" },
      { $set: { status: "Đã chấp nhận", respondedAt: new Date() } },
      { new: true },
    ).exec();
  } else if (action === "reject") {
    if (invitation.rewardStatus === "HELD" && Number(invitation.reward || 0) > 0) {
      var result = await executeOperation({
        idempotencyKey: "jockey:invite:refund:" + invitation._id,
        type: "JOCKEY_REWARD_REFUND",
        referenceType: "JOCKEY_INVITATION",
        referenceId: String(invitation._id),
        actorId: actingUser.id,
        postings: [{ ownerType: "USER", userId: invitation.ownerId, transactionType: "JOCKEY_REWARD", availableDelta: invitation.reward, holdDelta: -invitation.reward, description: "Hoàn thù lao do jockey từ chối" }],
        mutateDomain: async function (session, operation) {
          var updated = await JockeyInvitation.findOneAndUpdate(
            { _id: invitation._id, status: "Chờ xử lý", rewardStatus: "HELD" },
            { $set: { status: "Đã từ chối", respondedAt: new Date(), rewardStatus: "REFUNDED", rewardSettlementOperationId: operation._id } },
            { new: true, session: session },
          ).exec();
          if (!updated) throw apiError("Lời mời đã được xử lý", 409);
        },
      });
      invitation = await JockeyInvitation.findOne({ _id: invitation._id, rewardSettlementOperationId: result.operation._id }).exec();
    } else {
      invitation = await JockeyInvitation.findOneAndUpdate(
        { _id: invitation._id, status: "Chờ xử lý" },
        { $set: { status: "Đã từ chối", respondedAt: new Date() } },
        { new: true },
      ).exec();
    }
  } else {
    throw apiError("action must be accept or reject", 400);
  }

  return invitation;
}

async function cancelInvitation(actingUser, invitationId) {
  var invitation = await JockeyInvitation.findOne({ _id: invitationId, ownerId: actingUser.id }).exec();
  if (!invitation) throw apiError("Không tìm thấy lời mời", 404);
  if (invitation.status !== "Chờ xử lý") throw apiError("Chỉ có thể hủy lời mời đang chờ xử lý", 409);
  if (invitation.rewardStatus === "HELD" && Number(invitation.reward || 0) > 0) {
    var result = await executeOperation({
      idempotencyKey: "jockey:invite:cancel:" + invitation._id,
      type: "JOCKEY_REWARD_REFUND",
      referenceType: "JOCKEY_INVITATION",
      referenceId: String(invitation._id),
      actorId: actingUser.id,
      postings: [{ ownerType: "USER", userId: invitation.ownerId, transactionType: "JOCKEY_REWARD", availableDelta: invitation.reward, holdDelta: -invitation.reward, description: "Hoàn thù lao do hủy lời mời" }],
      mutateDomain: async function (session, operation) {
        var updated = await JockeyInvitation.findOneAndUpdate(
          { _id: invitation._id, status: "Chờ xử lý", rewardStatus: "HELD" },
          { $set: { status: "Đã hủy", cancelledAt: new Date(), rewardStatus: "REFUNDED", rewardSettlementOperationId: operation._id } },
          { new: true, session: session },
        ).exec();
        if (!updated) throw apiError("Lời mời đã được xử lý", 409);
      },
    });
    return JockeyInvitation.findOne({ _id: invitation._id, rewardSettlementOperationId: result.operation._id }).exec();
  }
  invitation.status = "Đã hủy";
  invitation.cancelledAt = new Date();
  await invitation.save();
  return invitation;
}

module.exports = {
  findRaceInTournament: findRaceInTournament,
  createInvitation: createInvitation,
  listForJockey: listForJockey,
  listForOwner: listForOwner,
  respondToInvitation: respondToInvitation,
  cancelInvitation: cancelInvitation,
};
