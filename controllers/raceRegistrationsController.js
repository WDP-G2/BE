var Horse = require("../models/horse");
var User = require("../models/user");
var JockeyInvitation = require("../models/jockeyInvitation");
var ownerService = require("../services/ownerService");
var registrationService = require("../services/registrationService");
var { mapRaceRegistration } = require("../utils/raceRegistrationMapper");
var { apiSuccess, apiError } = require("../utils/apiResponse");

var ACTIVE_REGISTRATION_STATUSES = ["Chờ duyệt", "Đã duyệt"];

function getHorseAge(horse) {
  if (!horse || !horse.birthDate) return horse?.age || null;
  var birth = new Date(horse.birthDate);
  if (Number.isNaN(birth.getTime())) return horse.age || null;
  var now = new Date();
  var age = now.getFullYear() - birth.getFullYear();
  var monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : horse.age || null;
}

async function findOwnerHorse(ownerId, horseId) {
  return Horse.findOne({
    _id: horseId,
    $or: [{ ownerId: ownerId }, { createdBy: ownerId }],
  }).exec();
}

function countActiveOwnerRegistrations(tournament, ownerId) {
  return (tournament.registrations || []).filter(function (registration) {
    return (
      ACTIVE_REGISTRATION_STATUSES.includes(registration.status) &&
      String(registration.ownerId || "") === String(ownerId)
    );
  }).length;
}

async function registerForRace(req, res) {
  var raceId = req.params.raceId || "";
  var horseId = req.body.horseId || "";
  var jockeyInvitationId = req.body.jockeyInvitationId || "";
  var note = String(req.body.note || req.body.notes || "").trim();

  if (!horseId || !jockeyInvitationId) {
    throw apiError("horseId và jockeyInvitationId là bắt buộc", 400);
  }

  var tournament = await ownerService.findRaceAcrossTournaments(raceId);
  if (!tournament) {
    throw apiError("Không tìm thấy cuộc đua", 404);
  }

  var race = tournament.races.id(raceId);
  if (!race) {
    throw apiError("Không tìm thấy cuộc đua", 404);
  }

  if (!registrationService.isTournamentOpenForRegistration(tournament)) {
    throw apiError("Giải đấu chưa mở đăng ký", 409);
  }

  if (!registrationService.isRaceOpenForRegistration(tournament, race)) {
    throw apiError("Cuộc đua chưa mở đăng ký", 409);
  }

  var invitation = await JockeyInvitation.findById(jockeyInvitationId).exec();
  if (!invitation) {
    throw apiError("Không tìm thấy lời mời jockey", 404);
  }
  if (String(invitation.ownerId) !== String(req.user.id)) {
    throw apiError("Lời mời jockey không thuộc về bạn", 403);
  }
  if (invitation.status !== "Đã chấp nhận") {
    throw apiError("Jockey chưa chấp nhận lời mời", 400);
  }
  if (String(invitation.horseId) !== String(horseId)) {
    throw apiError("Ngựa không khớp với lời mời", 400);
  }
  if (String(invitation.raceId) !== String(raceId)) {
    throw apiError("Cuộc đua không khớp với lời mời", 400);
  }

  var horse = await findOwnerHorse(req.user.id, horseId);
  if (!horse) {
    throw apiError("Không tìm thấy ngựa của bạn", 404);
  }

  if (horse.racingStatus === "cannot-race") {
    throw apiError("Ngựa không đủ điều kiện thi đấu", 400);
  }

  var ageRestriction = registrationService.getHorseAgeRestriction(
    horse,
    registrationService.getRaceStartDate(tournament, race),
  );
  if (ageRestriction) {
    throw apiError(ageRestriction, 400);
  }

  var jockey = await User.findById(invitation.jockeyId).exec();
  if (!jockey || jockey.role !== "JOCKEY") {
    throw apiError("Không tìm thấy jockey", 404);
  }

  var activeCount = countActiveOwnerRegistrations(tournament, req.user.id);
  if (activeCount >= Number(tournament.maxHorsesPerOwner || 10)) {
    throw apiError("Bạn đã đạt số ngựa tối đa cho giải này", 409);
  }

  var duplicate = (tournament.registrations || []).find(function (registration) {
    if (!ACTIVE_REGISTRATION_STATUSES.includes(registration.status)) return false;
    return (
      String(registration.raceId || "") === String(raceId) &&
      (String(registration.ownerId || "") === String(req.user.id) ||
        String(registration.horseId || "") === String(horseId) ||
        String(registration.jockeyId || "") === String(jockey._id))
    );
  });
  if (duplicate) {
    throw apiError("Đã có đăng ký đang hoạt động cho cuộc đua này", 409);
  }

  var options = await registrationService.buildOwnerRaceOptions(
    tournament,
    race,
    req.user.id,
  );
  var selectedHorseOption = (options.horses || []).find(function (item) {
    return String(item.id || "") === String(horse._id);
  });
  if (!selectedHorseOption || selectedHorseOption.available === false) {
    throw apiError(
      (selectedHorseOption && selectedHorseOption.unavailableReason) ||
        "Ngựa không khả dụng cho race này",
      409,
    );
  }

  var selectedJockeyOption = (options.jockeys || []).find(function (item) {
    return String(item.id || "") === String(jockey._id);
  });
  if (!selectedJockeyOption || selectedJockeyOption.available === false) {
    throw apiError(
      (selectedJockeyOption && selectedJockeyOption.unavailableReason) ||
        "Jockey không khả dụng cho race này",
      409,
    );
  }

  tournament.registrations.push({
    tournamentId: tournament._id,
    fullName: req.user.fullName || req.user.username || "",
    ownerId: req.user.id,
    ownerName: req.user.fullName || req.user.username || "",
    horseId: horse._id,
    horseName: horse.name,
    horseAge: getHorseAge(horse),
    horseBreed: horse.breed || "",
    jockeyId: jockey._id,
    jockeyName: jockey.fullName || jockey.name || jockey.username || "",
    jockeyInvitationId: invitation._id,
    raceId: race._id,
    status: "Chờ duyệt",
    notes: note,
    registeredAt: new Date(),
  });

  await tournament.save();
  var created = tournament.registrations[tournament.registrations.length - 1];

  res
    .status(201)
    .json(
      apiSuccess(
        mapRaceRegistration(tournament, created, race),
        "Đã gửi đăng ký thi đấu",
      ),
    );
}

async function withdrawRegistration(req, res) {
  var tournament = await ownerService.findRaceAcrossTournamentsByRegistrationId(
    req.params.id,
  );
  if (!tournament) {
    throw apiError("Không tìm thấy đăng ký", 404);
  }

  var registration = tournament.registrations.id(req.params.id);
  if (!registration || String(registration.ownerId) !== String(req.user.id)) {
    throw apiError("Không tìm thấy đăng ký", 404);
  }

  if (registration.status !== "Chờ duyệt") {
    throw apiError("Chỉ có thể rút đăng ký đang chờ duyệt", 400);
  }

  registration.status = "Đã rút";
  registration.withdrawNote = String(req.body?.note || "").trim();
  registration.updatedAt = new Date();
  await tournament.save();

  var race = registration.raceId ? tournament.races.id(registration.raceId) : null;
  res.json(
    apiSuccess(
      mapRaceRegistration(tournament, registration, race),
      "Đã rút đăng ký",
    ),
  );
}

module.exports = {
  registerForRace: registerForRace,
  withdrawRegistration: withdrawRegistration,
};
