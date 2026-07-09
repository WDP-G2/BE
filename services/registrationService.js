var mongoose = require("mongoose");
var Horse = require("../models/horse");
var User = require("../models/user");
var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");
var {
  mapTournament,
  mapRace,
  mapRegistration,
  mapPublicUser,
  mapHorseOption,
} = require("../utils/tournamentMapper");

var MIN_RACE_AGE_MONTHS = 24;

function toDayKey(value) {
  if (!value) return "";
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, "0");
  var day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function getAgeInMonthsFromBirthDate(birthDate, referenceDate) {
  if (!birthDate) return null;
  var birth = new Date(birthDate);
  var reference = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) {
    return null;
  }
  var months =
    (reference.getFullYear() - birth.getFullYear()) * 12 +
    (reference.getMonth() - birth.getMonth());
  if (reference.getDate() < birth.getDate()) months -= 1;
  return months;
}

function getAgeInMonths(horseOrBirthDate, referenceDate) {
  if (horseOrBirthDate && typeof horseOrBirthDate === "object") {
    var horse = horseOrBirthDate;
    var fromBirthDate = getAgeInMonthsFromBirthDate(horse.birthDate, referenceDate);
    if (fromBirthDate !== null) return fromBirthDate;

    var ageYears = Number(horse.age);
    if (Number.isFinite(ageYears) && ageYears > 0) {
      return ageYears * 12;
    }
    return null;
  }

  return getAgeInMonthsFromBirthDate(horseOrBirthDate, referenceDate);
}

function getHorseAgeRestriction(horse, referenceDate) {
  var ageMonths = getAgeInMonths(horse, referenceDate);
  if (ageMonths === null) {
    return "Ngựa cần có ngày sinh để kiểm tra tuổi thi đấu";
  }
  if (ageMonths < MIN_RACE_AGE_MONTHS) {
    return "Ngựa chưa đủ " + MIN_RACE_AGE_MONTHS + " tháng tuổi để thi đấu";
  }
  return "";
}

function getRaceStartDate(tournament, race) {
  if (!race && !tournament) return null;
  var date =
    race && race.scheduledAt
      ? race.scheduledAt
      : tournament && tournament.startDate
        ? tournament.startDate
        : null;
  if (!date) return null;
  var parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRaceEndDate(tournament, race) {
  var start = getRaceStartDate(tournament, race);
  if (!start) return null;
  return new Date(start.getTime() + 60 * 60 * 1000);
}

function rangesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime();
}

function sameDay(dateA, dateB) {
  return toDayKey(dateA) === toDayKey(dateB);
}

function isTournamentOpenForRegistration(tournament) {
  return tournament && tournament.status === "Đang mở đăng ký";
}

function isRaceOpenForRegistration(tournament, race) {
  if (!tournament || !race) return false;
  if (!isTournamentOpenForRegistration(tournament)) return false;
  if (race.status === "Nháp") return false;

  var deadline = race.regDeadline || tournament.config?.deadlineAt || null;
  if (deadline) {
    var deadlineDate = new Date(deadline);
    if (
      !Number.isNaN(deadlineDate.getTime()) &&
      deadlineDate.getTime() < Date.now()
    ) {
      return false;
    }
  }

  return true;
}

function getRegistrationRaceInfo(registration, tournament) {
  if (!registration || !tournament) return null;
  if (!registration.raceId) return null;
  return tournament.races.id(registration.raceId) || null;
}

function horseMatchesRegistration(horse, registration) {
  var horseId = String(horse._id || "");
  var registrationHorseId = String(registration.horseId || "");
  var horseName = String(horse.name || "")
    .trim()
    .toLowerCase();
  var registrationHorseName = String(registration.horseName || "")
    .trim()
    .toLowerCase();

  if (registrationHorseId && registrationHorseId === horseId) return true;
  if (!registrationHorseId && registrationHorseName === horseName) return true;
  return false;
}

function getHorseRegistrationConflict(ownerRegistrations, horse) {
  return ownerRegistrations.find(function (item) {
    return horseMatchesRegistration(horse, item.registration);
  });
}

function getJockeyRegistrationConflict(jockeyRegistrations, jockeyId) {
  return jockeyRegistrations.find(function (item) {
    return String(item.registration.jockeyId || "") === String(jockeyId || "");
  });
}

function findRaceIdsRegistrations(tournament, raceId) {
  return (tournament.registrations || []).filter(function (item) {
    return String(item.raceId || "") === String(raceId || "");
  });
}

async function getOwnerEligibleJockeyIds(ownerId, tournament) {
  var ownerObjectId = mongoose.Types.ObjectId.isValid(ownerId)
    ? new mongoose.Types.ObjectId(ownerId)
    : ownerId;

  var acceptedInvitations = await JockeyInvitation.find({
    ownerId: ownerObjectId,
    tournamentId: tournament._id,
    status: "Đã chấp nhận",
  }).exec();

  var eligible = new Set();

  acceptedInvitations.forEach(function (invitation) {
    if (invitation.jockeyId) {
      eligible.add(String(invitation.jockeyId));
    }
  });

  return {
    ids: eligible,
    acceptedInvitations: acceptedInvitations,
  };
}

async function buildOwnerRaceOptions(tournament, race, ownerId) {
  var horses = await Horse.find({ createdBy: ownerId })
    .sort({ createdAt: -1 })
    .exec();

  var allTournaments = await Tournament.find({}).exec();
  var selectedRaceStart = getRaceStartDate(tournament, race);
  var selectedRaceEnd = getRaceEndDate(tournament, race);

  var raceRegistrations = findRaceIdsRegistrations(tournament, race._id);
  var usedHorseIds = new Set(
    raceRegistrations
      .map(function (item) {
        return String(item.horseId || "");
      })
      .filter(Boolean),
  );
  var usedJockeyIds = new Set(
    raceRegistrations
      .map(function (item) {
        return String(item.jockeyId || "");
      })
      .filter(Boolean),
  );
  var ownerRegistrations = [];
  var jockeyRegistrations = [];

  allTournaments.forEach(function (currentTournament) {
    (currentTournament.registrations || []).forEach(function (registration) {
      if (String(registration.ownerId || "") === String(ownerId)) {
        ownerRegistrations.push({
          tournament: currentTournament,
          registration: registration,
        });
      }

      if (registration.jockeyId) {
        jockeyRegistrations.push({
          tournament: currentTournament,
          registration: registration,
        });
      }
    });
  });

  var eligibleJockeys = await getOwnerEligibleJockeyIds(ownerId, tournament);
  var eligibleJockeyIds = eligibleJockeys.ids;
  var eligibleObjectIds = Array.from(eligibleJockeyIds)
    .filter(function (id) {
      return mongoose.Types.ObjectId.isValid(id);
    })
    .map(function (id) {
      return new mongoose.Types.ObjectId(id);
    });

  var ownerJockeys = eligibleObjectIds.length
    ? await User.find({ role: "JOCKEY", _id: { $in: eligibleObjectIds } })
        .sort({ fullName: 1, name: 1, username: 1 })
        .exec()
    : [];

  return {
    tournament: mapTournament(tournament),
    race: mapRace(race),
    horses: horses.map(function (horse) {
      var option = mapHorseOption(horse);
      var unavailableReason = "";
      var ageRestriction = getHorseAgeRestriction(horse, selectedRaceStart);

      if (horse.racingStatus === "cannot-race") {
        unavailableReason = "Ngựa đang ở trạng thái không thể đua";
      } else if (ageRestriction) {
        unavailableReason = ageRestriction;
      } else if (usedHorseIds.has(String(horse._id))) {
        unavailableReason = "Ngựa đã được chọn cho race này";
      } else if (selectedRaceStart) {
        var horseConflict = ownerRegistrations.find(function (item) {
          var registrationHorseId = String(item.registration.horseId || "");
          var registrationHorseName = String(item.registration.horseName || "")
            .trim()
            .toLowerCase();
          var horseName = String(horse.name || "")
            .trim()
            .toLowerCase();
          if (
            registrationHorseId &&
            registrationHorseId === String(horse._id)
          ) {
            return true;
          }
          return !registrationHorseId && registrationHorseName === horseName;
        });

        if (horseConflict) {
          var horseRace = horseConflict.tournament.races.id(
            horseConflict.registration.raceId,
          );
          var horseRaceStart = getRaceStartDate(
            horseConflict.tournament,
            horseRace,
          );

          if (horseRaceStart && sameDay(horseRaceStart, selectedRaceStart)) {
            unavailableReason = "Mỗi ngày ngựa chỉ được đua 1 race";
          }
        }
      }

      return Object.assign({}, option, {
        available: unavailableReason === "",
        unavailableReason: unavailableReason,
      });
    }),
    jockeys: ownerJockeys.map(function (jockey) {
      var option = mapPublicUser(jockey);
      var unavailableReason = "";
      var jockeyId = String(jockey._id);
      var relationship = "Đã nhận lời mời";

      if (usedJockeyIds.has(jockeyId)) {
        unavailableReason = "Jockey đã được chọn cho race này";
      } else if (selectedRaceStart && selectedRaceEnd) {
        var jockeyConflict = jockeyRegistrations.find(function (item) {
          return String(item.registration.jockeyId || "") === jockeyId;
        });

        if (jockeyConflict) {
          var jockeyRace = jockeyConflict.tournament.races.id(
            jockeyConflict.registration.raceId,
          );
          var jockeyRaceStart = getRaceStartDate(
            jockeyConflict.tournament,
            jockeyRace,
          );
          var jockeyRaceEnd = getRaceEndDate(
            jockeyConflict.tournament,
            jockeyRace,
          );

          if (
            jockeyRaceStart &&
            jockeyRaceEnd &&
            rangesOverlap(
              selectedRaceStart,
              selectedRaceEnd,
              jockeyRaceStart,
              jockeyRaceEnd,
            )
          ) {
            unavailableReason = "Jockey trùng khung giờ với race khác";
          }
        }
      }

      return Object.assign({}, option, {
        available: unavailableReason === "",
        unavailableReason: unavailableReason,
        relationship: relationship,
      });
    }),
    registrations: raceRegistrations.map(mapRegistration),
  };
}

module.exports = {
  MIN_RACE_AGE_MONTHS: MIN_RACE_AGE_MONTHS,
  toDayKey: toDayKey,
  getAgeInMonths: getAgeInMonths,
  getHorseAgeRestriction: getHorseAgeRestriction,
  getRaceStartDate: getRaceStartDate,
  getRaceEndDate: getRaceEndDate,
  rangesOverlap: rangesOverlap,
  sameDay: sameDay,
  isTournamentOpenForRegistration: isTournamentOpenForRegistration,
  isRaceOpenForRegistration: isRaceOpenForRegistration,
  getRegistrationRaceInfo: getRegistrationRaceInfo,
  horseMatchesRegistration: horseMatchesRegistration,
  getHorseRegistrationConflict: getHorseRegistrationConflict,
  getJockeyRegistrationConflict: getJockeyRegistrationConflict,
  findRaceIdsRegistrations: findRaceIdsRegistrations,
  getOwnerEligibleJockeyIds: getOwnerEligibleJockeyIds,
  buildOwnerRaceOptions: buildOwnerRaceOptions,
};
