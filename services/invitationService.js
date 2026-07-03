var User = require("../models/user");
var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");
var { apiError } = require("../utils/apiResponse");
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

  var invitation = await JockeyInvitation.create({
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
  });

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
    invitation.status = "Đã chấp nhận";
  } else if (action === "reject") {
    invitation.status = "Đã từ chối";
  } else {
    throw apiError("action must be accept or reject", 400);
  }

  invitation.respondedAt = new Date();
  await invitation.save();

  return invitation;
}

module.exports = {
  findRaceInTournament: findRaceInTournament,
  createInvitation: createInvitation,
  listForJockey: listForJockey,
  listForOwner: listForOwner,
  respondToInvitation: respondToInvitation,
};
