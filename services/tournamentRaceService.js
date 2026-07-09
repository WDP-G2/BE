var mongoose = require("mongoose");
var Tournament = require("../models/tournament");
var tournamentStatusSync = require("./tournamentStatusSync");
var tm = require("../utils/tournamentMapper");
var Province = require("../models/province");
var User = require("../models/user");
var RefereeSalaryConfig = require("../models/refereeSalaryConfig");
var { toRaceStatusLabel, buildPrizesFromBody } = require("../utils/tournamentMapper");
var { toDate, toNumber } = require("./tournamentService");

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

async function findRaceContext(raceId, options) {
  if (!isObjectId(raceId)) return null;

  var tournament = await Tournament.findOne({ "races._id": raceId }).exec();
  if (!tournament) return null;

  var race = tournament.races.id(String(raceId));
  if (!race) return null;

  var shouldRepair = !options || options.repair !== false;
  if (shouldRepair && tm.toTournamentStatusCode(tournament.status) === "ONGOING") {
    var needsSave = tournamentStatusSync.repairRacesForOngoingTournament(tournament);
    var previousStatus = race.status;
    tournamentStatusSync.ensureRaceScheduledForStart(tournament, race);
    if (race.status !== previousStatus) {
      needsSave = true;
    }
    if (backfillResultFinalizedAt(tournament)) {
      needsSave = true;
    }
    if (needsSave) {
      await tournament.save();
    }
  }

  return { tournament: tournament, race: race };
}

async function listAllRaces(filterFn) {
  var tournaments = await Tournament.find({}).exec();
  var rows = [];

  tournaments.forEach(function (tournament) {
    (tournament.races || []).forEach(function (race) {
      var row = {
        tournament: tournament,
        race: race,
        tournamentId: String(tournament._id),
        tournamentName: tournament.name,
        tournamentStatus: tournament.status,
        raceId: String(race._id),
      };
      if (!filterFn || filterFn(row)) rows.push(row);
    });
  });

  return rows;
}

function prizeAmountForRank(race, rank) {
  if (!rank) return 0;
  var prizes = tm.mapPrizes(race.prizes);
  for (var i = 0; i < prizes.length; i += 1) {
    if (Number(prizes[i].rank) === Number(rank)) {
      return Number(prizes[i].amount || 0);
    }
  }
  return 0;
}

function sumRacePrizePayouts(race) {
  return (race.results || []).reduce(function (sum, result) {
    return sum + prizeAmountForRank(race, result.position);
  }, 0);
}

function backfillResultFinalizedAt(tournament) {
  if (!tournament) return false;

  var changed = false;
  (tournament.races || []).forEach(function (race) {
    if (
      !race.resultFinalizedAt &&
      tm.toRaceStatusCode(race.status) === "RESULT_CONFIRMED" &&
      race.results &&
      race.results.length
    ) {
      race.resultFinalizedAt = tournament.updatedAt || new Date();
      changed = true;
    }
  });

  return changed;
}

function mapRaceSummary(ctx) {
  var race = ctx.race;
  var raceStatusAliases = {
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
  var statusCode =
    raceStatusAliases[String(race.status || "").trim()] ||
    String(race.status || "").trim().toUpperCase();
  var participants = ctx.tournament
    ? getApprovedParticipants(ctx.tournament, race._id)
    : [];
  var checkedInCount = participants.filter(function (reg) {
    return reg.checkInStatus === "CHECKED_IN";
  }).length;
  var winnerResult = (race.results || []).find(function (result) {
    return Number(result.position) === 1;
  });
  var resultFinalizedAt = race.resultFinalizedAt || null;
  if (
    !resultFinalizedAt &&
    statusCode === "RESULT_CONFIRMED" &&
    race.results &&
    race.results.length &&
    ctx.tournament
  ) {
    resultFinalizedAt = ctx.tournament.updatedAt || null;
  }
  return {
    id: String(race._id),
    raceId: String(race._id),
    tournamentId: ctx.tournamentId,
    tournamentName: ctx.tournamentName,
    name: race.name,
    raceNumber: race.raceNumber,
    distance: race.distance,
    scheduledAt: race.scheduledAt,
    scheduledStartAt: race.scheduledAt,
    scheduledEndAt: race.scheduledEndAt || null,
    venueName: race.venueName || "",
    venueAddress: race.venueAddress || "",
    track: race.venueName || race.venueAddress || race.track || "",
    status: statusCode,
    statusCode: statusCode,
    statusLabel: race.status,
    tournamentStatus: ctx.tournamentStatus || "",
    refereeId: race.refereeId ? String(race.refereeId) : null,
    refereePaymentStatus: race.refereePaymentStatus || null,
    salaryConfigId: race.salaryConfigId ? String(race.salaryConfigId) : null,
    participantCount: participants.length,
    checkedInCount: checkedInCount,
    pendingCheckInCount: participants.length - checkedInCount,
    resultFinalizedAt: resultFinalizedAt,
    winnerName: winnerResult ? winnerResult.horseName : null,
    totalPrizeAmount: sumRacePrizePayouts(race),
    prizes: tm.mapPrizes(race.prizes),
  };
}

function getApprovedParticipants(tournament, raceId) {
  return (tournament.registrations || []).filter(function (reg) {
    return (
      String(reg.raceId) === String(raceId) &&
      (reg.status === "Đã duyệt" || reg.status === "Đang chạy" || reg.status === "Hoàn thành")
    );
  });
}

function mapParticipant(reg) {
  return {
    id: String(reg._id),
    participantId: String(reg._id),
    registrationId: String(reg._id),
    horseId: reg.horseId ? String(reg.horseId) : null,
    horseName: reg.horseName,
    ownerId: reg.ownerId ? String(reg.ownerId) : null,
    ownerUsername: reg.ownerName || "",
    jockeyId: reg.jockeyId ? String(reg.jockeyId) : null,
    jockeyUsername: reg.jockeyName || "",
    gateNumber: reg.gateNumber ?? null,
    status: reg.participantStatus || "REGISTERED",
    checkInStatus: reg.checkInStatus || "PENDING",
    note: reg.notes || "",
  };
}

async function applyRefereeAssignment(race, refereeId, salaryConfigId) {
  var amount = 0;
  if (salaryConfigId) {
    var config = await RefereeSalaryConfig.findById(salaryConfigId).exec();
    amount = Number(config?.amount || 0);
  }

  race.refereeId = refereeId;
  race.salaryConfigId = salaryConfigId || null;
  race.refereePaymentStatus = amount > 0 ? "HELD" : "NONE";
  race.refereePaymentAmount = amount;
}

function assertRaceReadyToStart(tournament, race) {
  var participants = getApprovedParticipants(tournament, race._id);
  if (!participants.length) {
    var emptyErr = new Error("Race has no approved participants");
    emptyErr.status = 400;
    throw emptyErr;
  }

  var gates = {};
  for (var i = 0; i < participants.length; i += 1) {
    var gate = Number(participants[i].gateNumber);
    if (!gate || gate <= 0) {
      var gateErr = new Error("Gate number must be assigned before race starts");
      gateErr.status = 400;
      throw gateErr;
    }
    if (gates[gate]) {
      var dupErr = new Error("Gate number already exists in this race");
      dupErr.status = 400;
      throw dupErr;
    }
    gates[gate] = true;
  }

  var checkedInCount = participants.filter(function (reg) {
    return reg.checkInStatus === "CHECKED_IN";
  }).length;
  var configuredMin = Number(race.minHorses || 0);
  var minRequired = configuredMin > 0 ? configuredMin : 1;
  if (minRequired > participants.length) {
    minRequired = participants.length;
  }
  if (checkedInCount < minRequired) {
    var minErr = new Error("Race does not have enough checked-in participants");
    minErr.status = 400;
    throw minErr;
  }
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

async function resolveVenueInfo(venueId) {
  if (!venueId) return { venueId: "", venueName: "", venueAddress: "" };

  var province = await Province.findOne({ "venues._id": venueId }).exec();
  var venue = province ? province.venues.id(venueId) : null;

  if (!venue) return { venueId: String(venueId), venueName: "", venueAddress: "" };

  return {
    venueId: String(venue._id),
    venueName: venue.name || "",
    venueAddress: venue.address || "",
  };
}

async function resolveRefereeAssignment(rawValue) {
  var value = rawValue == null ? "" : String(rawValue).trim();
  if (!value) return { provided: rawValue !== undefined, refereeId: null };
  if (!value.match(/^[a-fA-F0-9]{24}$/)) {
    var err = new Error("Trọng tài không hợp lệ");
    err.status = 400;
    err.expose = true;
    throw err;
  }
  var referee = await User.findById(value).exec();
  if (!referee || referee.role !== "REFEREE") {
    var roleErr = new Error("Trọng tài không hợp lệ");
    roleErr.status = 400;
    roleErr.expose = true;
    throw roleErr;
  }
  return { provided: true, refereeId: referee._id };
}

async function applyRaceFieldsUpdate(race, body) {
  if (body.name !== undefined) race.name = body.name;
  if (body.raceNumber !== undefined)
    race.raceNumber = toNumber(body.raceNumber, race.raceNumber);
  if (body.distance !== undefined) race.distance = String(body.distance);
  var scheduledStart = body.scheduledStartAt ?? body.scheduledAt;
  if (scheduledStart !== undefined) race.scheduledAt = toDate(scheduledStart);
  if (body.scheduledEndAt !== undefined)
    race.scheduledEndAt = toDate(body.scheduledEndAt);
  if (body.status !== undefined)
    race.status = toRaceStatusLabel(body.status, race.status);
  var description = body.description ?? body.note;
  if (description !== undefined) race.description = description;
  if (body.track !== undefined) race.track = body.track;
  if (body.venueId !== undefined) {
    var venueInfo = await resolveVenueInfo(body.venueId);
    race.venueId = venueInfo.venueId;
    race.venueName = venueInfo.venueName;
    race.venueAddress = venueInfo.venueAddress;
  }
  if (body.surface !== undefined) race.surface = body.surface;
  if (body.category !== undefined) race.category = body.category;
  var minCount = body.minHorses ?? body.minParticipants;
  if (minCount !== undefined) race.minHorses = toNumber(minCount, race.minHorses);
  var maxCount = body.maxHorses ?? body.maxParticipants;
  if (maxCount !== undefined) race.maxHorses = toNumber(maxCount, race.maxHorses);
  if (body.entryFee !== undefined)
    race.entryFee = toNumber(body.entryFee, race.entryFee);
  if (body.deposit !== undefined) race.deposit = toNumber(body.deposit, race.deposit);
  if (body.regDeadline !== undefined) race.regDeadline = toDate(body.regDeadline);
  if (body.checkIn !== undefined) race.checkIn = body.checkIn;
  if (body.prizes !== undefined) race.prizes = buildPrizesFromBody(body.prizes, toNumber);
  if (body.refereeId !== undefined) {
    var refereeAssignment = await resolveRefereeAssignment(body.refereeId);
    race.refereeId = refereeAssignment.refereeId;
    if (!refereeAssignment.refereeId) {
      race.salaryConfigId = null;
      race.refereePaymentStatus = "NONE";
      race.refereePaymentAmount = 0;
    }
  }
}

async function buildRacePayload(body, fallbackRaceNumber, defaults) {
  defaults = defaults || {};
  var venueInfo = body.venueId
    ? await resolveVenueInfo(body.venueId)
    : { venueId: "", venueName: "", venueAddress: "" };
  var refereeAssignment = await resolveRefereeAssignment(body.refereeId);

  return {
    raceNumber: toNumber(body.raceNumber, fallbackRaceNumber),
    name: body.name || `Cuộc đua ${fallbackRaceNumber}`,
    distance: body.distance != null ? String(body.distance) : "",
    scheduledAt: toDate(body.scheduledStartAt ?? body.scheduledAt) || defaults.scheduledAt,
    scheduledEndAt: toDate(body.scheduledEndAt) || undefined,
    status: toRaceStatusLabel(body.status, "Nháp"),
    description: body.description || body.note || "",
    track: body.track || defaults.track || "",
    venueId: venueInfo.venueId,
    venueName: venueInfo.venueName,
    venueAddress: venueInfo.venueAddress,
    surface: body.surface || "Cỏ",
    category: body.category || "Open",
    minHorses: toNumber(body.minHorses ?? body.minParticipants, 0),
    maxHorses: toNumber(body.maxHorses ?? body.maxParticipants, defaults.maxHorses || 0),
    entryFee: toNumber(body.entryFee, defaults.entryFee || 0),
    deposit: toNumber(body.deposit, defaults.deposit || 0),
    regDeadline: toDate(body.regDeadline) || defaults.regDeadline,
    checkIn: body.checkIn || defaults.checkIn || "",
    prizes: buildPrizesFromBody(body.prizes, toNumber),
    refereeId: refereeAssignment.refereeId,
  };
}

module.exports = {
  findRaceContext: findRaceContext,
  listAllRaces: listAllRaces,
  mapRaceSummary: mapRaceSummary,
  prizeAmountForRank: prizeAmountForRank,
  sumRacePrizePayouts: sumRacePrizePayouts,
  backfillResultFinalizedAt: backfillResultFinalizedAt,
  getApprovedParticipants: getApprovedParticipants,
  assertRaceReadyToStart: assertRaceReadyToStart,
  mapParticipant: mapParticipant,
  applyRefereeAssignment: applyRefereeAssignment,
  getRaceDefaults: getRaceDefaults,
  resolveVenueInfo: resolveVenueInfo,
  resolveRefereeAssignment: resolveRefereeAssignment,
  applyRaceFieldsUpdate: applyRaceFieldsUpdate,
  buildRacePayload: buildRacePayload,
};
