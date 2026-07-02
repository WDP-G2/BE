var express = require("express");
var router = express.Router();
var mongoose = require("mongoose");
var multer = require("multer");
var User = require("../models/user");
var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var Province = require("../models/province");
var JockeyInvitation = require("../models/jockeyInvitation");
var { authenticate, requireRole } = require("../middleware/auth");
var { fail } = require("../utils/httpErrors");
var {
  uploadBufferToCloudinary,
  isCloudinaryError,
} = require("../utils/cloudinaryUpload");
var { mapVenue } = require("../utils/systemSettingsMapper");

var MIN_RACE_AGE_MONTHS = 24;

var TOURNAMENT_STATUS_LABELS = {
  DRAFT: "Nháp",
  PUBLISHED: "Đã công bố",
  OPEN_REGISTRATION: "Đang mở đăng ký",
  REGISTRATION_CLOSED: "Đã đóng đăng ký",
  SCHEDULED: "Đã lên lịch",
  ONGOING: "Đang diễn ra",
  COMPLETED: "Đã kết thúc",
  CANCELLED: "Đã hủy",
};

var TOURNAMENT_STATUS_CODES = Object.keys(TOURNAMENT_STATUS_LABELS).reduce(
  function (result, code) {
    result[TOURNAMENT_STATUS_LABELS[code]] = code;
    return result;
  },
  {},
);

var RACE_STATUS_LABELS = {
  DRAFT: "Nháp",
  SCHEDULED: "Sắp diễn ra",
  ONGOING: "Đang diễn ra",
  RESULT_CONFIRMED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

var RACE_STATUS_CODES = {
  "Nháp": "DRAFT",
  "Sắp chạy": "SCHEDULED",
  "Sắp diễn ra": "SCHEDULED",
  "Đã lên lịch": "SCHEDULED",
  "Đang chạy": "ONGOING",
  "Đang diễn ra": "ONGOING",
  "Hoàn thành": "RESULT_CONFIRMED",
  "Đã chốt kết quả": "RESULT_CONFIRMED",
  "Đã hủy": "CANCELLED",
};

function normalizeStatusKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function toTournamentStatusLabel(value, fallback) {
  var trimmed = String(value || "").trim();
  if (!trimmed) return fallback || TOURNAMENT_STATUS_LABELS.DRAFT;

  var code = normalizeStatusKey(trimmed);
  return TOURNAMENT_STATUS_LABELS[code] || trimmed;
}

function toTournamentStatusCode(value) {
  var trimmed = String(value || "").trim();
  if (!trimmed) return "DRAFT";

  var code = normalizeStatusKey(trimmed);
  return TOURNAMENT_STATUS_LABELS[code]
    ? code
    : TOURNAMENT_STATUS_CODES[trimmed] || code;
}

function toRaceStatusLabel(value, fallback) {
  var trimmed = String(value || "").trim();
  if (!trimmed) return fallback || RACE_STATUS_LABELS.DRAFT;

  var code = normalizeStatusKey(trimmed);
  return RACE_STATUS_LABELS[code] || trimmed;
}

function toRaceStatusCode(value) {
  var trimmed = String(value || "").trim();
  if (!trimmed) return "DRAFT";

  var code = normalizeStatusKey(trimmed);
  return RACE_STATUS_LABELS[code] ? code : RACE_STATUS_CODES[trimmed] || code;
}

var storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  var allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (allowed.indexOf(file.mimetype) === -1) {
    return cb(new Error("Only image files are allowed"));
  }
  cb(null, true);
}

var upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

function createSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toDate(value) {
  if (!value) return undefined;
  var str = String(value);
  // Date-time strings without a timezone designator (e.g. "2026-07-08T08:00:00")
  // are parsed using the server's local timezone by the JS Date constructor,
  // which silently shifts the wall-clock time the admin entered whenever the
  // server isn't running in UTC. Treat them as UTC instead so the value the
  // admin typed round-trips unchanged regardless of server timezone.
  if (/T\d{2}:\d{2}/.test(str) && !/[Zz]$|[+-]\d{2}:\d{2}$/.test(str)) {
    str += "Z";
  }
  var date = new Date(str);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toDateInput(value) {
  if (!value) return "";
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toTimeInput(value) {
  if (!value) return "";
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(11, 16);
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  var number = Number(value);
  return Number.isNaN(number) ? fallback : number;
}

function parseMaybeJson(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function extractTournamentBanner(req) {
  if (req.file) {
    return uploadBufferToCloudinary(req.file, "horse-racing/tournaments").then(
      function (uploaded) {
        return uploaded ? uploaded.secure_url || uploaded.url || "" : "";
      },
    );
  }
  return Promise.resolve(req.body.banner || req.body.bannerUrl || "");
}

var LEGACY_PRIZE_RANKS = {
  first: { rank: 1, itemName: "Giải nhất" },
  second: { rank: 2, itemName: "Giải nhì" },
  third: { rank: 3, itemName: "Giải ba" },
};

function mapPrizes(prizes) {
  if (Array.isArray(prizes)) {
    return prizes.map(function (prize, index) {
      return {
        id: prize.id || "prize-" + (prize.rank || index + 1) + "-" + index,
        rank: Number(prize.rank || index + 1),
        itemName: prize.itemName || "Giải " + (prize.rank || index + 1),
        amount: Number(prize.amount || 0),
      };
    });
  }

  if (prizes && typeof prizes === "object") {
    return Object.keys(LEGACY_PRIZE_RANKS)
      .filter(function (key) {
        return Number(prizes[key]) > 0;
      })
      .map(function (key) {
        var meta = LEGACY_PRIZE_RANKS[key];
        return {
          id: "prize-" + meta.rank,
          rank: meta.rank,
          itemName: meta.itemName,
          amount: Number(prizes[key]),
        };
      });
  }

  return [];
}

function buildPrizesFromBody(rawPrizes) {
  if (!Array.isArray(rawPrizes)) return [];
  return rawPrizes.map(function (prize, index) {
    return {
      rank: toNumber(prize.rank, index + 1),
      itemName: prize.itemName || prize.name || "Giải " + toNumber(prize.rank, index + 1),
      amount: toNumber(prize.amount, 0),
    };
  });
}

function mapResult(result) {
  return {
    id: String(result._id),
    position: result.position,
    horseName: result.horseName,
    jockeyId: result.jockeyId ? String(result.jockeyId) : "",
    jockeyName: result.jockeyName || "",
    time: result.time || "",
    points: result.points || 0,
    notes: result.notes || "",
  };
}

function mapRace(race) {
  var statusCode = toRaceStatusCode(race.status);
  return {
    id: String(race._id),
    raceNumber: race.raceNumber,
    name: race.name,
    distance: race.distance,
    scheduledAt: race.scheduledAt || null,
    scheduledStartAt: race.scheduledAt || null,
    scheduledEndAt: race.scheduledEndAt || null,
    status: statusCode,
    statusCode: statusCode,
    statusLabel: race.status || RACE_STATUS_LABELS[statusCode] || "",
    description: race.description || "",
    note: race.description || "",
    track: race.track || "",
    venueId: race.venueId || "",
    venueName: race.venueName || "",
    venueAddress: race.venueAddress || "",
    surface: race.surface || "Cỏ",
    category: race.category || "Open",
    minHorses: race.minHorses || 0,
    maxHorses: race.maxHorses || 0,
    minParticipants: race.minHorses || 0,
    maxParticipants: race.maxHorses || 0,
    entryFee: race.entryFee || 0,
    deposit: race.deposit || 0,
    regDeadline: race.regDeadline || null,
    checkIn: race.checkIn || "",
    refereeId: race.refereeId ? String(race.refereeId) : null,
    prizes: mapPrizes(race.prizes),
    results: (race.results || []).map(mapResult),
  };
}

function mapRegistration(registration) {
  return {
    id: String(registration._id),
    tournamentId: registration.tournamentId
      ? String(registration.tournamentId)
      : "",
    fullName: registration.fullName,
    ownerId: registration.ownerId ? String(registration.ownerId) : "",
    ownerName: registration.ownerName || "",
    horseId: registration.horseId ? String(registration.horseId) : "",
    horseName: registration.horseName,
    horseAge: registration.horseAge || null,
    horseBreed: registration.horseBreed || "",
    jockeyId: registration.jockeyId ? String(registration.jockeyId) : "",
    jockeyName: registration.jockeyName || "",
    raceId: registration.raceId ? String(registration.raceId) : "",
    status: registration.status,
    notes: registration.notes || "",
    registeredAt: registration.registeredAt,
  };
}

function mapPublicUser(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    username: user.username || user.email?.split("@")[0] || "",
    fullName: user.fullName || user.name || "",
    name: user.name || user.fullName || "",
    email: user.email || "",
    phone: user.phone || "",
    role: user.role || "USER",
  };
}

function toDayKey(value) {
  if (!value) return "";
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, "0");
  var day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function getAgeInMonths(birthDate, referenceDate) {
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

function getHorseAgeRestriction(horse, referenceDate) {
  var ageMonths = getAgeInMonths(horse && horse.birthDate, referenceDate);
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

function mapHorseOption(horse) {
  return {
    id: String(horse._id),
    slug: horse.slug,
    name: horse.name,
    breed: horse.breed || "",
    gender: horse.gender || "",
    birthDate: horse.birthDate || null,
    ownerName: horse.ownerName || "",
    imageUrl: horse.imageUrl || "",
    licenseImageUrl: horse.licenseImageUrl || "",
    healthStatus: horse.healthStatus || "Chưa cập nhật",
    racingStatus: horse.racingStatus || "can-race",
    canRace: horse.racingStatus !== "cannot-race",
    notes: horse.notes || "",
    wins: Number(horse.wins || 0),
    races: Number(horse.races || 0),
    achievements: Array.isArray(horse.achievements) ? horse.achievements : [],
    history: Array.isArray(horse.history) ? horse.history : [],
  };
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

function mapTournament(tournament) {
  var config = tournament.config || {};
  var statusCode = toTournamentStatusCode(tournament.status);
  return {
    id: String(tournament._id),
    slug: tournament.slug,
    name: tournament.name,
    description: tournament.description || "",
    location: tournament.location,
    banner: tournament.banner || "",
    type: tournament.type,
    bannerUrl: tournament.banner || "",
    status: statusCode,
    statusCode: statusCode,
    statusLabel: tournament.status,
    startDate: tournament.startDate || null,
    endDate: tournament.endDate || null,
    startAt: tournament.startDate || null,
    endAt: tournament.endDate || null,
    provinceId: tournament.provinceId ? String(tournament.provinceId) : null,
    registrationOpenAt: tournament.registrationOpenAt || null,
    checkInDeadlineAt:
      tournament.checkInDeadlineAt || config.deadlineAt || null,
    minTeams: Number(tournament.minTeams ?? 1),
    maxTeams: Number(tournament.maxTeams ?? 0),
    minHorsesPerOwner: Number(tournament.minHorsesPerOwner ?? 4),
    maxHorsesPerOwner: Number(tournament.maxHorsesPerOwner ?? 10),
    jockeyChallengeEnabled: Boolean(tournament.jockeyChallengeEnabled),
    jockeyChallengeFirstPoints: Number(
      tournament.jockeyChallengeFirstPoints ?? 3,
    ),
    jockeyChallengeSecondPoints: Number(
      tournament.jockeyChallengeSecondPoints ?? 2,
    ),
    jockeyChallengeThirdPoints: Number(
      tournament.jockeyChallengeThirdPoints ?? 1,
    ),
    jockeyChallengePrizes: (tournament.jockeyChallengePrizes || []).map(
      function (prize) {
        return {
          rank: Number(prize.rank || 0),
          amount: Number(prize.amount || 0),
          note: prize.note || "",
        };
      },
    ),
    rules: tournament.rules || "",
    config: config,
    deadlineAt: config.deadlineAt || tournament.startDate || null,
    registrationDeadline: config.deadlineAt || tournament.startDate || null,
    registrationCloseAt: config.deadlineAt || tournament.startDate || null,
    registrationFee: Number(config.entryFee || 0),
    depositFee: Number(config.depositFee || 0),
    maxRegistrations: Number(config.maxRegistrations || 0),
    requireJockey: Boolean(config.requireJockey !== false),
    requireHorseOwner: Boolean(config.requireHorseOwner !== false),
    races: (tournament.races || []).map(mapRace),
    registrations: (tournament.registrations || []).map(mapRegistration),
    raceCount: (tournament.races || []).length,
    registrationCount: (tournament.registrations || []).length,
    createdAt: tournament.createdAt,
    updatedAt: tournament.updatedAt,
  };
}

function findTournamentByIdOrSlug(identifier) {
  var conditions = [{ slug: identifier }];
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    conditions.unshift({ _id: identifier });
  }
  return Tournament.findOne({ $or: conditions });
}

function getRaceDefaults(tournament) {
  var config = tournament.config || {};
  return {
    scheduledAt: tournament.startDate,
    track: tournament.location || "",
    maxHorses: config.maxRegistrations || 0,
    entryFee: config.entryFee || 0,
    deposit: config.depositFee || 0,
    regDeadline: config.deadlineAt || tournament.startDate,
    checkIn: "08:00",
  };
}

function buildRacePayload(body, fallbackRaceNumber, defaults) {
  var prizes = body.prizes || {};
  defaults = defaults || {};
  return {
    raceNumber: toNumber(body.raceNumber, fallbackRaceNumber),
    name: body.name || `Cuộc đua ${fallbackRaceNumber}`,
    distance: toNumber(body.distance, 0),
    scheduledAt: toDate(body.scheduledAt) || defaults.scheduledAt,
    status: body.status || "Nháp",
    description: body.description || "",
    track: body.track || defaults.track || "",
    surface: body.surface || "Cỏ",
    category: body.category || "Open",
    minHorses: toNumber(body.minHorses, 0),
    maxHorses: toNumber(body.maxHorses, defaults.maxHorses || 0),
    entryFee: toNumber(body.entryFee, defaults.entryFee || 0),
    deposit: toNumber(body.deposit, defaults.deposit || 0),
    regDeadline: toDate(body.regDeadline) || defaults.regDeadline,
    checkIn: body.checkIn || defaults.checkIn || "",
    prizes: {
      first: toNumber(prizes.first, 0),
      second: toNumber(prizes.second, 0),
      third: toNumber(prizes.third, 0),
    },
  };
}

router.get("/", async function (req, res, next) {
  try {
    var query = {};
    var status = (req.query.status || "").trim();
    var type = (req.query.type || "").trim();
    var search = (req.query.search || "").trim();

    if (status) query.status = status;
    if (type) query.type = type;
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
        { location: new RegExp(search, "i") },
      ];
    }

    var tournaments = await Tournament.find(query)
      .sort({ createdAt: -1 })
      .exec();
    res.json(tournaments.map(mapTournament));
  } catch (err) {
    next(err);
  }
});

router.get("/owner/open", async function (req, res, next) {
  try {
    var tournaments = await Tournament.find({ status: "Đang mở đăng ký" })
      .sort({ createdAt: -1 })
      .exec();

    res.json(
      tournaments.map(function (tournament) {
        var openRaces = (tournament.races || [])
          .filter(function (race) {
            return isRaceOpenForRegistration(tournament, race);
          })
          .map(mapRace);

        return Object.assign({}, mapTournament(tournament), {
          races: openRaces,
          openRaceCount: openRaces.length,
        });
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.get(
  "/owner/registrations",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  async function (req, res, next) {
    try {
      var ownerObjectId = mongoose.Types.ObjectId.isValid(req.user.id)
        ? new mongoose.Types.ObjectId(req.user.id)
        : req.user.id;

      var tournaments = await Tournament.find({
        "registrations.ownerId": ownerObjectId,
      })
        .sort({ updatedAt: -1 })
        .exec();

      var registrations = [];
      tournaments.forEach(function (tournament) {
        (tournament.registrations || []).forEach(function (registration) {
          if (
            String(registration.ownerId || "") === String(req.user.id) ||
            String(registration.ownerId || "") === String(ownerObjectId)
          ) {
            var race = tournament.races.id(registration.raceId);
            registrations.push(
              Object.assign({}, mapRegistration(registration), {
                tournamentId: String(tournament._id),
                tournamentName: tournament.name,
                tournamentStatus: tournament.status,
                raceName: race ? race.name : "",
                raceStatus: race ? race.status : "",
              }),
            );
          }
        });
      });

      res.json(registrations);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/jockey/registrations",
  authenticate,
  requireRole("JOCKEY", "ADMIN"),
  async function (req, res, next) {
    try {
      var jockeyObjectId = mongoose.Types.ObjectId.isValid(req.user.id)
        ? new mongoose.Types.ObjectId(req.user.id)
        : req.user.id;

      var tournaments = await Tournament.find({
        "registrations.jockeyId": jockeyObjectId,
      })
        .sort({ updatedAt: -1 })
        .exec();

      var horseIds = new Set();
      tournaments.forEach(function (tournament) {
        (tournament.registrations || []).forEach(function (registration) {
          if (
            String(registration.jockeyId || "") === String(req.user.id) ||
            String(registration.jockeyId || "") === String(jockeyObjectId)
          ) {
            if (registration.horseId) {
              horseIds.add(String(registration.horseId));
            }
          }
        });
      });

      var horseObjectIds = Array.from(horseIds)
        .filter(function (id) {
          return mongoose.Types.ObjectId.isValid(id);
        })
        .map(function (id) {
          return new mongoose.Types.ObjectId(id);
        });

      var horses = horseObjectIds.length
        ? await Horse.find({ _id: { $in: horseObjectIds } }).exec()
        : [];

      var horsesById = {};
      horses.forEach(function (horse) {
        horsesById[String(horse._id)] = horse;
      });

      var registrations = [];
      tournaments.forEach(function (tournament) {
        (tournament.registrations || []).forEach(function (registration) {
          if (
            String(registration.jockeyId || "") === String(req.user.id) ||
            String(registration.jockeyId || "") === String(jockeyObjectId)
          ) {
            var race = tournament.races.id(registration.raceId);
            var scheduledAt =
              race && race.scheduledAt ? new Date(race.scheduledAt) : null;
            var horseDoc =
              horsesById[String(registration.horseId || "")] || null;
            registrations.push(
              Object.assign({}, mapRegistration(registration), {
                tournamentId: String(tournament._id),
                tournamentName: tournament.name,
                tournamentStatus: tournament.status,
                raceName: race ? race.name : "",
                raceNumber: race ? race.raceNumber || "" : "",
                raceStatus: race ? race.status : "",
                raceDate: scheduledAt
                  ? toDateInput(scheduledAt)
                  : toDateInput(tournament.startDate),
                raceTime: scheduledAt ? toTimeInput(scheduledAt) : "",
                location: (race && race.track) || tournament.location || "",
                horseHealth: horseDoc ? horseDoc.healthStatus : "",
                horseBirthDate: horseDoc ? toDateInput(horseDoc.birthDate) : "",
                horseWins: horseDoc ? horseDoc.wins : 0,
                horseRaces: horseDoc ? horseDoc.races : 0,
                horseNotes: horseDoc ? horseDoc.notes : "",
                horseGender: horseDoc ? horseDoc.gender : "",
                horseImageUrl: horseDoc ? horseDoc.imageUrl : "",
              }),
            );
          }
        });
      });

      res.json(registrations);
    } catch (err) {
      next(err);
    }
  },
);

router.get("/:identifier", async function (req, res, next) {
  try {
    var tournament = await findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    res.json(mapTournament(tournament));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  upload.single("banner"),
  async function (req, res, next) {
    try {
      var name = (req.body.name || "").trim();
      var location = (req.body.location || "").trim();
      var slug = (
        req.body.slug ||
        createSlug(name) ||
        createSlug(location) ||
        "giai-dau"
      ).trim();

      if (!name || !location) {
        return fail(res, 400, "Vui lòng nhập tên và địa điểm giải đấu");
      }

      var exists = await Tournament.findOne({ slug: slug }).exec();
      if (exists) {
        return fail(res, 409, "Mã giải đấu đã tồn tại");
      }

      var banner = await extractTournamentBanner(req);
      var config = parseMaybeJson(req.body.config, {});

      var tournament = await Tournament.create({
        name: name,
        slug: slug,
        description: req.body.description || "",
        location: location,
        banner: banner,
        type: req.body.type || "regular",
        status: req.body.status || "Nháp",
        startDate: toDate(req.body.startDate),
        endDate: toDate(req.body.endDate),
        rules: req.body.rules || "",
        config: config,
        createdBy: req.user.id,
      });

      res.status(201).json(mapTournament(tournament));
    } catch (err) {
      console.error(
        "Tournament create error:",
        err && err.stack ? err.stack : err,
      );
      if (isCloudinaryError(err)) {
        var createErrorMessage = String(err && err.message ? err.message : err);
        return res.status(400).json({ error: createErrorMessage });
      }
      next(err);
    }
  },
);

router.patch(
  "/:identifier",
  authenticate,
  requireRole("ADMIN"),
  upload.single("banner"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return fail(res, 404, "Không tìm thấy giải đấu");
      }

      var nextName = req.body.name;
      var nextSlug = req.body.slug;

      if (nextName !== undefined)
        tournament.name = String(nextName).trim() || tournament.name;
      if (nextSlug !== undefined)
        tournament.slug = createSlug(nextSlug) || tournament.slug;
      if (req.body.description !== undefined)
        tournament.description = req.body.description;
      if (req.body.location !== undefined)
        tournament.location = req.body.location;
      if (req.file || req.body.banner !== undefined) {
        tournament.banner = await extractTournamentBanner(req);
      }
      if (req.body.type !== undefined) tournament.type = req.body.type;
      if (req.body.status !== undefined) tournament.status = req.body.status;
      if (req.body.startDate !== undefined)
        tournament.startDate = toDate(req.body.startDate);
      if (req.body.endDate !== undefined)
        tournament.endDate = toDate(req.body.endDate);
      if (req.body.rules !== undefined) tournament.rules = req.body.rules;

      if (req.body.config) {
        var nextConfig = parseMaybeJson(req.body.config, req.body.config);
        tournament.config = Object.assign(
          {},
          tournament.config.toObject
            ? tournament.config.toObject()
            : tournament.config,
          nextConfig,
        );
      }

      await tournament.save();
      res.json(mapTournament(tournament));
    } catch (err) {
      console.error(
        "Tournament update error:",
        err && err.stack ? err.stack : err,
      );
      if (isCloudinaryError(err)) {
        var updateErrorMessage = String(err && err.message ? err.message : err);
        return res.status(400).json({ error: updateErrorMessage });
      }
      next(err);
    }
  },
);

router.patch(
  "/:identifier/config",
  authenticate,
  requireRole("ADMIN"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return fail(res, 404, "Không tìm thấy giải đấu");
      }

      tournament.type = req.body.type || tournament.type;
      tournament.status = req.body.status || tournament.status;
      tournament.rules =
        req.body.rules !== undefined ? req.body.rules : tournament.rules;
      tournament.config = Object.assign(
        {},
        tournament.config.toObject
          ? tournament.config.toObject()
          : tournament.config,
        req.body.config || {},
      );

      await tournament.save();
      res.json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.get("/:identifier/races", async function (req, res, next) {
  try {
    var tournament = await findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    res.json((tournament.races || []).map(mapRace));
  } catch (err) {
    next(err);
  }
});

router.get(
  "/:identifier/races/:raceId/owner-options",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return fail(res, 404, "Không tìm thấy giải đấu");
      }

      var race = tournament.races.id(req.params.raceId);
      if (!race) {
        return fail(res, 404, "Không tìm thấy cuộc đua");
      }

      if (!isRaceOpenForRegistration(tournament, race)) {
        return fail(res, 409, "Cuộc đua chưa mở đăng ký");
      }

      var options = await buildOwnerRaceOptions(tournament, race, req.user.id);
      res.json(options);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:identifier/races",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return fail(res, 404, "Không tìm thấy giải đấu");
      }

      var raceNumber = Number(
        req.body.raceNumber || tournament.races.length + 1,
      );

      tournament.races.push(
        Object.assign(
          buildRacePayload(req.body, raceNumber, getRaceDefaults(tournament)),
          { results: [] },
        ),
      );

      await tournament.save();
      res.status(201).json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.get("/:identifier/races/:raceId", async function (req, res, next) {
  try {
    var tournament = await findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    var race = tournament.races.id(req.params.raceId);
    if (!race) {
      return fail(res, 404, "Không tìm thấy cuộc đua");
    }

    res.json(mapRace(race));
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/:identifier/races/:raceId",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return fail(res, 404, "Không tìm thấy giải đấu");
      }

      var race = tournament.races.id(req.params.raceId);
      if (!race) {
        return fail(res, 404, "Không tìm thấy cuộc đua");
      }

      if (req.body.name !== undefined) race.name = req.body.name;
      if (req.body.raceNumber !== undefined)
        race.raceNumber = toNumber(req.body.raceNumber, race.raceNumber);
      if (req.body.distance !== undefined)
        race.distance = toNumber(req.body.distance, race.distance);
      if (req.body.scheduledAt !== undefined)
        race.scheduledAt = toDate(req.body.scheduledAt);
      if (req.body.status !== undefined) race.status = req.body.status;
      if (req.body.description !== undefined)
        race.description = req.body.description;
      if (req.body.track !== undefined) race.track = req.body.track;
      if (req.body.surface !== undefined) race.surface = req.body.surface;
      if (req.body.category !== undefined) race.category = req.body.category;
      if (req.body.minHorses !== undefined)
        race.minHorses = toNumber(req.body.minHorses, race.minHorses);
      if (req.body.maxHorses !== undefined)
        race.maxHorses = toNumber(req.body.maxHorses, race.maxHorses);
      if (req.body.entryFee !== undefined)
        race.entryFee = toNumber(req.body.entryFee, race.entryFee);
      if (req.body.deposit !== undefined)
        race.deposit = toNumber(req.body.deposit, race.deposit);
      if (req.body.regDeadline !== undefined)
        race.regDeadline = toDate(req.body.regDeadline);
      if (req.body.checkIn !== undefined) race.checkIn = req.body.checkIn;
      if (req.body.prizes) {
        var currentPrizes = mapPrizes(race.prizes);
        race.prizes = Object.assign(currentPrizes, {
          first: toNumber(req.body.prizes.first, currentPrizes.first),
          second: toNumber(req.body.prizes.second, currentPrizes.second),
          third: toNumber(req.body.prizes.third, currentPrizes.third),
        });
      }

      await tournament.save();
      res.json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/:identifier/races/:raceId",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return fail(res, 404, "Không tìm thấy giải đấu");
      }

      var race = tournament.races.id(req.params.raceId);
      if (!race) {
        return fail(res, 404, "Không tìm thấy cuộc đua");
      }

      race.deleteOne();
      await tournament.save();
      res.json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.get("/:identifier/registrations", async function (req, res, next) {
  try {
    var tournament = await findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    res.json(tournament.registrations.map(mapRegistration));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/:identifier/owner/registrations",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return fail(res, 404, "Không tìm thấy giải đấu");
      }

      if (!isTournamentOpenForRegistration(tournament)) {
        return fail(res, 409, "Giải đấu chưa mở đăng ký");
      }

      var raceId = req.body.raceId || "";
      var race = raceId ? tournament.races.id(raceId) : null;
      if (!race) {
        return fail(res, 400, "Vui lòng chọn cuộc đua");
      }

      if (!isRaceOpenForRegistration(tournament, race)) {
        return fail(res, 409, "Cuộc đua chưa mở đăng ký");
      }

      var horseId = req.body.horseId || "";
      var jockeyId = req.body.jockeyId || "";
      var fullName = (
        req.body.fullName ||
        req.user.fullName ||
        req.user.username ||
        ""
      ).trim();
      var horse = horseId ? await Horse.findById(horseId).exec() : null;
      var jockey = jockeyId ? await User.findById(jockeyId).exec() : null;

      if (!fullName) {
        return fail(res, 400, "Vui lòng nhập tên người đăng ký");
      }

      if (!horse || String(horse.createdBy || "") !== String(req.user.id)) {
        return fail(res, 404, "Không tìm thấy ngựa");
      }

      if (horse.racingStatus === "cannot-race") {
        return fail(res, 400, "Ngựa không đủ điều kiện thi đấu");
      }

      var ageRestriction = getHorseAgeRestriction(horse, getRaceStartDate(tournament, race));
      if (ageRestriction) {
        return res.status(400).json({ error: ageRestriction });
      }

      if (!jockey || jockey.role !== "JOCKEY") {
        return fail(res, 404, "Không tìm thấy jockey");
      }

      var options = await buildOwnerRaceOptions(tournament, race, req.user.id);
      var jockeyAllowed = (options.jockeys || []).some(function (item) {
        return String(item.id || "") === String(jockey._id);
      });
      if (!jockeyAllowed) {
        return res.status(403).json({
          error:
            "Jockey chưa nhận lời mời cho giải này hoặc chưa thi đấu cho bạn",
        });
      }
      var selectedHorseOption = options.horses.find(function (item) {
        return String(item.id || "") === String(horse._id || "");
      });
      if (!selectedHorseOption || selectedHorseOption.available === false) {
        return res.status(409).json({
          error:
            (selectedHorseOption && selectedHorseOption.unavailableReason) ||
            "Ngựa không khả dụng cho race này",
        });
      }

      var selectedJockeyOption = options.jockeys.find(function (item) {
        return String(item.id || "") === String(jockey._id || "");
      });
      if (!selectedJockeyOption || selectedJockeyOption.available === false) {
        return res.status(409).json({
          error:
            (selectedJockeyOption && selectedJockeyOption.unavailableReason) ||
            "Jockey không khả dụng cho race này",
        });
      }

      var horseName = (req.body.horseName || horse.name || "").trim();
      var jockeyName = (
        req.body.jockeyName ||
        jockey.fullName ||
        jockey.name ||
        ""
      ).trim();

      tournament.registrations.push({
        tournamentId: tournament._id,
        fullName: fullName,
        ownerId: req.user.id,
        ownerName: req.user.fullName || req.user.username || fullName,
        horseId: horse._id,
        horseName: horseName,
        horseAge: req.body.horseAge ? Number(req.body.horseAge) : undefined,
        horseBreed: req.body.horseBreed || horse.breed || "",
        jockeyId: jockey._id,
        jockeyName: jockeyName,
        raceId: race._id,
        status: req.body.status || "Chờ duyệt",
        notes: req.body.notes || "",
      });

      await tournament.save();
      res.status(201).json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/:identifier/registrations/:registrationId",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return fail(res, 404, "Không tìm thấy giải đấu");
      }

      var registration = tournament.registrations.id(req.params.registrationId);
      if (!registration) {
        return fail(res, 404, "Không tìm thấy đăng ký");
      }

      var status = String(req.body.status || "").trim();
      var allowedStatuses = [
        "Chờ duyệt",
        "Đã duyệt",
        "Từ chối",
        "Đang chạy",
        "Hoàn thành",
      ];

      if (allowedStatuses.indexOf(status) === -1) {
        return fail(res, 400, "Trạng thái đăng ký không hợp lệ");
      }

      registration.status = status;
      await tournament.save();
      res.json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:identifier/races/:raceId/results",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  async function (req, res, next) {
    try {
      var tournament = await findTournamentByIdOrSlug(
        req.params.identifier,
      ).exec();

      if (!tournament) {
        return fail(res, 404, "Không tìm thấy giải đấu");
      }

      var race = tournament.races.id(req.params.raceId);
      if (!race) {
        return fail(res, 404, "Không tìm thấy cuộc đua");
      }

      var results = Array.isArray(req.body.results) ? req.body.results : [];
      race.results = results.map(function (item, index) {
        return {
          position: Number(item.position || index + 1),
          horseName: item.horseName || "",
          jockeyId: item.jockeyId || undefined,
          jockeyName: item.jockeyName || "",
          time: item.time || "",
          points: item.points !== undefined ? Number(item.points) : 0,
          notes: item.notes || "",
        };
      });
      race.status = req.body.status || "Hoàn thành";
      tournament.status = req.body.tournamentStatus || tournament.status;

      await tournament.save();
      res.json(mapTournament(tournament));
    } catch (err) {
      next(err);
    }
  },
);

router.get("/:identifier/results", async function (req, res, next) {
  try {
    var tournament = await findTournamentByIdOrSlug(
      req.params.identifier,
    ).exec();

    if (!tournament) {
      return fail(res, 404, "Không tìm thấy giải đấu");
    }

    res.json(
      tournament.races.map(function (race) {
        return {
          race: mapRace(race),
          results: (race.results || []).map(mapResult),
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
