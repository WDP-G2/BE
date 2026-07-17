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

function schedulesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  if (!firstStart || !firstEnd || !secondStart || !secondEnd) return false;
  return firstStart.getTime() < secondEnd.getTime() && secondStart.getTime() < firstEnd.getTime();
}

async function loadRaceSchedule(invitation, tournamentCache) {
  if (!invitation.raceId || !invitation.tournamentId) return null;

  var cacheKey = String(invitation.tournamentId);
  var tournament = tournamentCache.has(cacheKey)
    ? tournamentCache.get(cacheKey)
    : await Tournament.findById(invitation.tournamentId).exec();
  tournamentCache.set(cacheKey, tournament);
  if (!tournament) return null;

  var race = findRaceInTournament(tournament, invitation.raceId);
  if (!race || !race.scheduledAt || !race.scheduledEndAt) return null;

  return { start: new Date(race.scheduledAt), end: new Date(race.scheduledEndAt) };
}

/**
 * Blocks sending a new invitation to a jockey who has already accepted
 * another invitation (from any owner) for the same race, or for a race
 * whose real schedule overlaps it — the jockey cannot honor a second one.
 */
async function findAcceptedScheduleConflict(jockeyId, race, tournamentCache) {
  if (!race) return null;

  var targetSchedule =
    race.scheduledAt && race.scheduledEndAt
      ? { start: new Date(race.scheduledAt), end: new Date(race.scheduledEndAt) }
      : null;

  var accepted = await JockeyInvitation.find({
    jockeyId: jockeyId,
    status: "Đã chấp nhận",
  }).exec();

  for (var i = 0; i < accepted.length; i += 1) {
    var candidate = accepted[i];
    if (candidate.raceId && String(candidate.raceId) === String(race._id)) {
      return { invitation: candidate, sameRace: true };
    }

    if (targetSchedule) {
      var candidateSchedule = await loadRaceSchedule(candidate, tournamentCache);
      if (
        candidateSchedule &&
        schedulesOverlap(targetSchedule.start, targetSchedule.end, candidateSchedule.start, candidateSchedule.end)
      ) {
        return { invitation: candidate, sameRace: false };
      }
    }
  }

  return null;
}

/**
 * A jockey can only run one race at a time. When they accept an invitation,
 * any other pending invitation for the same race (or an overlapping time
 * slot in another race) can never be honored, so it is auto-cancelled and
 * its held reward refunded to the inviting owner.
 */
async function cancelConflictingInvitations(acceptedInvitation) {
  var candidates = await JockeyInvitation.find({
    _id: { $ne: acceptedInvitation._id },
    jockeyId: acceptedInvitation.jockeyId,
    status: "Chờ xử lý",
  }).exec();
  if (!candidates.length) return;

  var tournamentCache = new Map();
  var acceptedSchedule = await loadRaceSchedule(acceptedInvitation, tournamentCache);

  for (var i = 0; i < candidates.length; i += 1) {
    var candidate = candidates[i];
    var sameRace =
      acceptedInvitation.raceId &&
      candidate.raceId &&
      String(candidate.raceId) === String(acceptedInvitation.raceId);

    var overlapping = false;
    if (!sameRace && acceptedSchedule) {
      var candidateSchedule = await loadRaceSchedule(candidate, tournamentCache);
      overlapping = candidateSchedule
        ? schedulesOverlap(
            acceptedSchedule.start,
            acceptedSchedule.end,
            candidateSchedule.start,
            candidateSchedule.end,
          )
        : false;
    }
    if (!sameRace && !overlapping) continue;

    var note =
      "Tự động hủy: jockey đã nhận lời mời khác cho " +
      (sameRace ? "cùng cuộc đua" : "khung giờ trùng lịch") +
      ".";

    try {
      if (candidate.rewardStatus === "HELD" && Number(candidate.reward || 0) > 0) {
        await executeOperation({
          idempotencyKey: "jockey:invite:auto-cancel:" + candidate._id,
          type: "JOCKEY_REWARD_REFUND",
          referenceType: "JOCKEY_INVITATION",
          referenceId: String(candidate._id),
          actorId: acceptedInvitation.jockeyId,
          postings: [{ ownerType: "USER", userId: candidate.ownerId, transactionType: "JOCKEY_REWARD", availableDelta: candidate.reward, holdDelta: -candidate.reward, description: "Hoàn thù lao do jockey nhận lời mời khác trùng lịch" }],
          mutateDomain: async function (session, operation) {
            var updated = await JockeyInvitation.findOneAndUpdate(
              { _id: candidate._id, status: "Chờ xử lý", rewardStatus: "HELD" },
              { $set: { status: "Đã hủy", cancelledAt: new Date(), rewardStatus: "REFUNDED", rewardSettlementOperationId: operation._id, responseNote: note } },
              { new: true, session: session },
            ).exec();
            if (!updated) throw apiError("Lời mời đã được xử lý", 409);
          },
        });
      } else {
        await JockeyInvitation.findOneAndUpdate(
          { _id: candidate._id, status: "Chờ xử lý" },
          { $set: { status: "Đã hủy", cancelledAt: new Date(), responseNote: note } },
        ).exec();
      }
    } catch (err) {
      // Best-effort: another request may have already resolved this invitation
      // (e.g. the owner cancelled it concurrently) — skip and continue.
    }
  }
}

/**
 * Races a jockey can no longer be invited to because they already accepted
 * an invitation for that exact race (from any owner). Used by the invite
 * form to lock those races out before the owner even tries to submit.
 */
async function listAcceptedRaceLocks(jockeyId) {
  var accepted = await JockeyInvitation.find({
    jockeyId: jockeyId,
    status: "Đã chấp nhận",
    raceId: { $ne: null },
  }).exec();

  return accepted.map(function (invitation) {
    return {
      raceId: String(invitation.raceId),
      tournamentId: invitation.tournamentId ? String(invitation.tournamentId) : null,
      raceLabel: invitation.raceLabel || "",
      tournamentName: invitation.tournamentName || "",
    };
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

  var acceptedConflict = await findAcceptedScheduleConflict(jockey._id, race, new Map());
  if (acceptedConflict) {
    throw apiError(
      acceptedConflict.sameRace
        ? "Jockey đã nhận lời mời khác cho chính cuộc đua này, không thể gửi thêm lời mời"
        : "Jockey đã nhận lời mời khác có khung giờ trùng với cuộc đua này, không thể gửi thêm lời mời",
      409,
    );
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
    if (invitation) {
      try {
        await cancelConflictingInvitations(invitation);
      } catch (err) {
        // The jockey's acceptance already succeeded; a failure here must not
        // turn that success into an error response.
      }
    }
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
  listAcceptedRaceLocks: listAcceptedRaceLocks,
};
