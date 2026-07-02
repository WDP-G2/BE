var mongoose = require("mongoose");
var Tournament = require("../models/tournament");
var RefereeSalaryConfig = require("../models/refereeSalaryConfig");

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

async function findRaceContext(raceId) {
  if (!isObjectId(raceId)) return null;

  var tournament = await Tournament.findOne({ "races._id": raceId }).exec();
  if (!tournament) return null;

  var race = tournament.races.id(String(raceId));
  if (!race) return null;

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

function mapRaceSummary(ctx) {
  var race = ctx.race;
  var raceStatusAliases = {
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
  var statusCode =
    raceStatusAliases[String(race.status || "").trim()] ||
    String(race.status || "").trim().toUpperCase();
  return {
    id: String(race._id),
    raceId: String(race._id),
    tournamentId: ctx.tournamentId,
    tournamentName: ctx.tournamentName,
    name: race.name,
    raceNumber: race.raceNumber,
    distance: race.distance,
    scheduledAt: race.scheduledAt,
    status: statusCode,
    statusCode: statusCode,
    statusLabel: race.status,
    refereeId: race.refereeId ? String(race.refereeId) : null,
    refereePaymentStatus: race.refereePaymentStatus || null,
    salaryConfigId: race.salaryConfigId ? String(race.salaryConfigId) : null,
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

module.exports = {
  findRaceContext: findRaceContext,
  listAllRaces: listAllRaces,
  mapRaceSummary: mapRaceSummary,
  getApprovedParticipants: getApprovedParticipants,
  mapParticipant: mapParticipant,
  applyRefereeAssignment: applyRefereeAssignment,
};
