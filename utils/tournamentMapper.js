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

var TOURNAMENT_STATUS_TRANSITIONS = {
  DRAFT: ["DRAFT", "PUBLISHED", "CANCELLED"],
  PUBLISHED: ["PUBLISHED", "OPEN_REGISTRATION", "CANCELLED"],
  OPEN_REGISTRATION: ["OPEN_REGISTRATION", "REGISTRATION_CLOSED"],
  REGISTRATION_CLOSED: ["REGISTRATION_CLOSED", "SCHEDULED"],
  SCHEDULED: ["SCHEDULED", "ONGOING"],
  ONGOING: ["ONGOING", "COMPLETED"],
  COMPLETED: ["COMPLETED"],
  CANCELLED: ["CANCELLED"],
};

var RACE_STATUS_LABELS = {
  DRAFT: "Nháp",
  PUBLISHED: "Đã công bố",
  OPEN_REGISTRATION: "Đang mở đăng ký",
  REGISTRATION_CLOSED: "Đã đóng đăng ký",
  SCHEDULED: "Sắp diễn ra",
  ONGOING: "Đang diễn ra",
  RESULT_CONFIRMED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

var RACE_STATUS_CODES = {
  "Nháp": "DRAFT",
  "Đã công bố": "PUBLISHED",
  "Đang mở đăng ký": "OPEN_REGISTRATION",
  "Đã đóng đăng ký": "REGISTRATION_CLOSED",
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

function buildPrizesFromBody(rawPrizes, toNumber) {
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
    status: result.status || (Number(result.position) > 0 ? "FINISHED" : "DISQUALIFIED"),
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
    resultFinalizedAt: race.resultFinalizedAt || null,
    resultFinalizedBy: race.resultFinalizedBy ? String(race.resultFinalizedBy) : null,
    financialSettlementStatus: race.financialSettlementStatus || "NONE",
    financialSettledAt: race.financialSettledAt || null,
    financialSettlementSnapshot: race.financialSettlementSnapshot || null,
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
    entryFeeAmount: Number(registration.entryFeeAmount || 0),
    depositAmount: Number(registration.depositAmount || 0),
    paymentStatus: registration.paymentStatus || "UNCHARGED",
    depositStatus: registration.depositStatus || "NONE",
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

module.exports = {
  TOURNAMENT_STATUS_LABELS: TOURNAMENT_STATUS_LABELS,
  TOURNAMENT_STATUS_CODES: TOURNAMENT_STATUS_CODES,
  TOURNAMENT_STATUS_TRANSITIONS: TOURNAMENT_STATUS_TRANSITIONS,
  RACE_STATUS_LABELS: RACE_STATUS_LABELS,
  RACE_STATUS_CODES: RACE_STATUS_CODES,
  normalizeStatusKey: normalizeStatusKey,
  toTournamentStatusLabel: toTournamentStatusLabel,
  toTournamentStatusCode: toTournamentStatusCode,
  toRaceStatusLabel: toRaceStatusLabel,
  toRaceStatusCode: toRaceStatusCode,
  mapPrizes: mapPrizes,
  buildPrizesFromBody: buildPrizesFromBody,
  mapResult: mapResult,
  mapRace: mapRace,
  mapRegistration: mapRegistration,
  mapPublicUser: mapPublicUser,
  mapHorseOption: mapHorseOption,
  mapTournament: mapTournament,
};
