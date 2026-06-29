var mongoose = require("mongoose");
var Tournament = require("../models/tournament");

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
  return {
    id: String(race._id),
    raceId: String(race._id),
    tournamentId: ctx.tournamentId,
    tournamentName: ctx.tournamentName,
    name: race.name,
    raceNumber: race.raceNumber,
    distance: race.distance,
    scheduledAt: race.scheduledAt,
    status: race.status,
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

module.exports = {
  findRaceContext: findRaceContext,
  listAllRaces: listAllRaces,
  mapRaceSummary: mapRaceSummary,
  getApprovedParticipants: getApprovedParticipants,
  mapParticipant: mapParticipant,
};
