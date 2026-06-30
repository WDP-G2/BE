var Tournament = require("../models/tournament");
var User = require("../models/user");
var Horse = require("../models/horse");
var RaceRegistration = require("../models/raceRegistration");
var RaceParticipant = require("../models/raceParticipant");
var RaceResult = require("../models/raceResult");
var RaceComplaint = require("../models/raceComplaint");
var JockeyChallengeResult = require("../models/jockeyChallengeResult");
var RaceVenue = require("../models/raceVenue");
var ids = require("../utils/ids");
var mapper = require("../utils/documentMapper");

var STATUS_DRAFT = "Nháp";
var STATUS_COMPLETED = "Hoàn thành";
var STATUS_CANCELLED = "Đã hủy";

function bad(message, status) {
  var err = new Error(message);
  err.status = status || 400;
  return err;
}

function requireAdmin(user) {
  if (!user || user.role !== "ADMIN") throw bad("Only admins can manage tournaments", 403);
}

function isCompletedRaceStatus(status) {
  return status === STATUS_COMPLETED || status === "RESULT_CONFIRMED" || status === "COMPLETED";
}

function isCancelledRaceStatus(status) {
  return status === STATUS_CANCELLED || status === "CANCELLED";
}

function normalizeRacePayload(payload, index) {
  var source = payload || {};
  if (!source.name) throw bad("Race name is required");
  if (!source.distance) throw bad("Race distance is required");
  if (!source.scheduledAt && !source.scheduledStartAt) throw bad("Race start time is required");
  if (!source.scheduledEndAt && source.scheduledStartAt && source.endAt) source.scheduledEndAt = source.endAt;
  var minParticipants = Number(source.minParticipants == null ? source.minHorses || 1 : source.minParticipants);
  var maxParticipants = Number(source.maxParticipants == null ? source.maxHorses || minParticipants : source.maxParticipants);
  if (!Number.isFinite(minParticipants) || minParticipants <= 0) throw bad("Minimum participants must be greater than zero");
  if (!Number.isFinite(maxParticipants) || maxParticipants <= 0) throw bad("Maximum participants must be greater than zero");
  if (minParticipants > maxParticipants) throw bad("Minimum participants cannot exceed maximum participants");
  var scheduledAt = new Date(source.scheduledStartAt || source.scheduledAt);
  var scheduledEndAt = source.scheduledEndAt ? new Date(source.scheduledEndAt) : undefined;
  if (scheduledEndAt && scheduledEndAt <= scheduledAt) throw bad("Race end time must be after start time");
  return {
    raceNumber: source.raceNumber || index + 1,
    name: source.name,
    distance: source.distance,
    scheduledAt: scheduledAt,
    scheduledEndAt: scheduledEndAt,
    status: source.status || STATUS_DRAFT,
    description: source.description || source.note || "",
    note: source.note || source.description || "",
    venueId: source.venueId || undefined,
    venueName: source.venueName || "",
    track: source.track || "",
    surface: source.surface || "Cỏ",
    category: source.category || "Open",
    refereeId: source.refereeId || undefined,
    minHorses: minParticipants,
    maxHorses: maxParticipants,
    minParticipants: minParticipants,
    maxParticipants: maxParticipants,
    entryFee: Number(source.entryFee || 0),
    lateCheckInFee: Number(source.lateCheckInFee || 0),
    regDeadline: source.regDeadline || undefined,
    checkIn: source.checkIn || "",
    prizes: source.prizes || {},
  };
}

function requireConfigEditable(tournament) {
  if (!tournament) throw bad("Tournament not found", 404);
  if (tournament.status !== STATUS_DRAFT && tournament.status !== "DRAFT") {
    throw bad("Only draft tournaments can be configured");
  }
}

async function listAll() {
  var tournaments = await Tournament.find({})
    .sort({ startDate: 1, createdAt: -1 })
    .exec();
  return mapper.toPlainList(tournaments);
}

async function find(identifier) {
  var tournament = null;
  if (ids.isObjectId(identifier)) {
    tournament = await Tournament.findById(identifier).exec();
  }
  if (!tournament) {
    tournament = await Tournament.findOne({ slug: identifier }).exec();
  }
  return tournament;
}

async function get(identifier) {
  return mapper.toPlain(await find(identifier));
}

async function create(payload, currentUser) {
  var name = payload.name || "Tournament " + Date.now();
  var tournament = await Tournament.create(
    Object.assign({}, payload, {
      name: name,
      slug: payload.slug || ids.createSlug(name) + "-" + Date.now(),
      location: payload.location || payload.venue || "TBD",
      createdBy: currentUser && currentUser._id ? currentUser._id : undefined,
    }),
  );
  return mapper.toPlain(tournament);
}

async function update(id, payload) {
  var tournament = await Tournament.findByIdAndUpdate(id, payload, {
    new: true,
  }).exec();
  return mapper.toPlain(tournament);
}

async function remove(id) {
  await Tournament.findByIdAndDelete(id).exec();
}

async function races(identifier) {
  var tournament = await find(identifier);
  return tournament ? tournament.races || [] : [];
}

async function createRace(tournamentId, payload) {
  var tournament = await Tournament.findById(tournamentId).exec();
  if (!tournament) return null;

  tournament.races.push(
    Object.assign(
      { raceNumber: tournament.races.length + 1, name: "Race", distance: 1000 },
      payload,
    ),
  );
  await tournament.save();
  return tournament.races[tournament.races.length - 1];
}

async function updateRace(raceId, payload) {
  var tournament = await Tournament.findOne({ "races._id": raceId }).exec();
  if (!tournament) return null;

  var race = tournament.races.id(raceId);
  Object.assign(race, payload || {});
  await tournament.save();
  return race;
}

async function deleteRace(raceId) {
  var tournament = await Tournament.findOne({ "races._id": raceId }).exec();
  if (!tournament) return;

  tournament.races.id(raceId).deleteOne();
  await tournament.save();
}

async function replaceRaces(tournamentId, payload, currentUser) {
  requireAdmin(currentUser);
  var tournament = await Tournament.findById(tournamentId).exec();
  if (!tournament) throw bad("Tournament not found", 404);
  requireConfigEditable(tournament);
  var requests = Array.isArray(payload) ? payload : payload && Array.isArray(payload.races) ? payload.races : [];
  tournament.races.splice(0, tournament.races.length);
  requests.forEach(function (item, index) {
    tournament.races.push(normalizeRacePayload(item, index));
  });
  tournament.markModified("races");
  tournament.updatedBy = currentUser._id;
  await tournament.save();
  return mapper.toPlain(tournament);
}

async function setStatus(id, status) {
  return update(id, { status: status });
}

function id(value) {
  return value ? String(value._id || value.id || value) : null;
}

async function nameOf(model, value, fallback) {
  if (!value) return fallback || "";
  var doc = await model.findById(value).exec();
  return doc ? doc.username || doc.fullName || doc.name || doc.email || fallback || "" : fallback || "";
}

function countBy(items, mapperFn) {
  var result = {};
  (items || []).forEach(function (item) {
    var key = mapperFn(item) || "UNKNOWN";
    result[key] = (result[key] || 0) + 1;
  });
  return result;
}

function distinctCount(items, mapperFn) {
  var seen = {};
  (items || []).forEach(function (item) {
    var key = mapperFn(item);
    if (key) seen[String(key)] = true;
  });
  return Object.keys(seen).length;
}

function sum(items, mapperFn) {
  return (items || []).reduce(function (total, item) {
    return total + (Number(mapperFn(item)) || 0);
  }, 0);
}

function raceEnd(race) {
  if (!race) return null;
  if (race.scheduledEndAt) return race.scheduledEndAt;
  if (!race.scheduledAt) return null;
  return new Date(new Date(race.scheduledAt).getTime() + 60 * 60 * 1000);
}

function findRaceInTournament(tournament, raceId) {
  return tournament && tournament.races ? tournament.races.id(raceId) : null;
}

async function mapLeaderboardEntry(tournament, result, index) {
  var race = findRaceInTournament(tournament, result.raceId);
  var participant = result.participantId ? await RaceParticipant.findById(result.participantId).exec() : null;
  var prizeAmount = Number(result.prizeAmount) || 0;
  var ownerPrizeAmount = Number(result.ownerPrizeAmount) || 0;
  var jockeyPrizeAmount = Number(result.jockeyPrizeAmount) || 0;
  if (!ownerPrizeAmount && !jockeyPrizeAmount) ownerPrizeAmount = prizeAmount;
  return {
    id: String(result._id),
    tournamentId: String(result.tournamentId),
    raceId: String(result.raceId),
    raceName: race ? race.name : "",
    raceScheduledStartAt: race ? race.scheduledAt || null : null,
    raceScheduledEndAt: raceEnd(race),
    raceResultId: String(result._id),
    participantId: participant ? String(participant._id) : String(result.participantId || ""),
    raceRank: result.rank || null,
    finishTimeMillis: result.finishTimeMillis || null,
    resultStatus: result.status,
    horseId: String(result.horseId),
    horseName: await nameOf(Horse, result.horseId),
    ownerId: String(result.ownerId),
    ownerUsername: await nameOf(User, result.ownerId),
    jockeyId: String(result.jockeyId),
    jockeyUsername: await nameOf(User, result.jockeyId),
    prizeAmount: prizeAmount,
    ownerPrizeAmount: ownerPrizeAmount,
    jockeyPrizeAmount: jockeyPrizeAmount,
    jockeyPrizePercent: Number(result.jockeyPrizePercent) || 0,
    payoutStatus: result.payoutStatus || "NOT_ELIGIBLE",
    resultFinalizedBy: result.finalizedBy ? String(result.finalizedBy) : null,
    resultFinalizedAt: result.finalizedAt || null,
    tournamentFinalizedBy: tournament.finalizedBy ? String(tournament.finalizedBy) : null,
    tournamentFinalizedAt: tournament.finalizedAt || null,
    sortIndex: index,
  };
}

async function jockeyStandings(tournamentId) {
  var rows = await JockeyChallengeResult.find({ tournamentId: tournamentId })
    .sort({ challengeRank: 1, totalPoints: -1 })
    .exec();
  var response = [];
  for (var i = 0; i < rows.length; i += 1) {
    response.push({
      jockeyId: String(rows[i].jockeyId),
      jockeyUsername: await nameOf(User, rows[i].jockeyId),
      totalPoints: rows[i].totalPoints || 0,
      firstPlaces: rows[i].firstPlaces || 0,
      secondPlaces: rows[i].secondPlaces || 0,
      thirdPlaces: rows[i].thirdPlaces || 0,
      challengeRank: rows[i].challengeRank,
      prizeAmount: rows[i].prizeAmount || 0,
      payoutStatus: rows[i].payoutStatus || "NOT_ELIGIBLE",
      finalizedAt: rows[i].finalizedAt || null,
    });
  }
  return response;
}

async function leaderboard(identifier) {
  var tournament = await find(identifier);
  if (!tournament) return null;
  var results = await RaceResult.find({ tournamentId: tournament._id }).exec();
  var entries = [];
  for (var i = 0; i < results.length; i += 1) {
    entries.push(await mapLeaderboardEntry(tournament, results[i], i));
  }
  entries.sort(function (a, b) {
    return new Date(a.raceScheduledStartAt || 0) - new Date(b.raceScheduledStartAt || 0) ||
      (a.raceRank || 9999) - (b.raceRank || 9999) ||
      a.sortIndex - b.sortIndex;
  });
  entries.forEach(function (entry) { delete entry.sortIndex; });
  return {
    tournamentId: String(tournament._id),
    tournamentName: tournament.name,
    tournamentStatus: tournament.status,
    finalizedAt: tournament.finalizedAt || null,
    finalizedBy: tournament.finalizedBy ? String(tournament.finalizedBy) : null,
    pendingComplaintCountAtFinalize: tournament.pendingComplaintCountAtFinalize || 0,
    entries: entries,
    jockeyStandings: await jockeyStandings(tournament._id),
  };
}

async function statistics(identifier) {
  var tournament = await find(identifier);
  if (!tournament) return null;
  var registrations = await RaceRegistration.find({ tournamentId: tournament._id }).exec();
  var participants = await RaceParticipant.find({ tournamentId: tournament._id }).exec();
  var complaints = await RaceComplaint.find({ tournamentId: tournament._id }).exec();
  var results = await RaceResult.find({ tournamentId: tournament._id }).exec();
  var payoutTotals = {};
  results.forEach(function (result) {
    var status = result.payoutStatus || "NOT_ELIGIBLE";
    payoutTotals[status] = (payoutTotals[status] || 0) + (Number(result.prizeAmount) || 0);
  });
  return {
    tournamentId: String(tournament._id),
    tournamentName: tournament.name,
    tournamentStatus: tournament.status,
    finalizedAt: tournament.finalizedAt || null,
    finalizedBy: tournament.finalizedBy ? String(tournament.finalizedBy) : null,
    ownerCount: distinctCount(registrations, function (item) { return item.ownerId; }),
    horseCount: distinctCount(registrations, function (item) { return item.horseId; }),
    jockeyCount: distinctCount(registrations, function (item) { return item.jockeyId; }),
    refereeCount: distinctCount(tournament.races || [], function (race) { return race.refereeId; }),
    raceResultCount: results.length,
    pendingComplaintCountAtFinalize: tournament.pendingComplaintCountAtFinalize || complaints.filter(function (item) { return item.status === "PENDING"; }).length,
    registrationsByStatus: countBy(registrations, function (item) { return item.status; }),
    racesByStatus: countBy(tournament.races || [], function (race) { return race.status; }),
    participantsByStatus: countBy(participants, function (item) { return item.status; }),
    complaintsByStatus: countBy(complaints, function (item) { return item.status; }),
    prizePayoutTotalsByStatus: payoutTotals,
    totalPrizeAmount: sum(results, function (item) { return item.prizeAmount; }),
    paidPrizeAmount: payoutTotals.PAID || 0,
    unpaidPrizeAmount: payoutTotals.UNPAID || 0,
    notEligiblePrizeAmount: payoutTotals.NOT_ELIGIBLE || 0,
  };
}

async function payouts(identifier) {
  var tournament = await find(identifier);
  if (!tournament) return null;
  var results = await RaceResult.find({ tournamentId: tournament._id }).exec();
  var entries = [];
  for (var i = 0; i < results.length; i += 1) {
    var entry = await mapLeaderboardEntry(tournament, results[i], i);
    var unpaid = entry.payoutStatus === "UNPAID";
    entries.push({
      raceResultId: entry.raceResultId,
      tournamentId: entry.tournamentId,
      tournamentName: tournament.name,
      raceId: entry.raceId,
      raceName: entry.raceName,
      participantId: entry.participantId,
      rank: entry.raceRank,
      horseId: entry.horseId,
      horseName: entry.horseName,
      ownerId: entry.ownerId,
      ownerUsername: entry.ownerUsername,
      jockeyId: entry.jockeyId,
      jockeyUsername: entry.jockeyUsername,
      prizeAmount: entry.prizeAmount,
      ownerPrizeAmount: entry.ownerPrizeAmount,
      jockeyPrizeAmount: entry.jockeyPrizeAmount,
      jockeyPrizePercent: entry.jockeyPrizePercent,
      unpaidOwnerAmount: unpaid ? entry.ownerPrizeAmount : 0,
      unpaidJockeyAmount: unpaid ? entry.jockeyPrizeAmount : 0,
      payoutStatus: entry.payoutStatus,
      finalizedAt: entry.resultFinalizedAt,
    });
  }
  entries.sort(function (a, b) {
    return (a.rank || 9999) - (b.rank || 9999) || String(a.raceResultId).localeCompare(String(b.raceResultId));
  });
  return entries;
}

async function finalizeTournament(tournamentId, currentUser) {
  requireAdmin(currentUser);
  var tournament = await find(tournamentId);
  if (!tournament) throw bad("Tournament not found", 404);
  if (tournament.status === STATUS_CANCELLED || tournament.status === "CANCELLED") {
    throw bad("Cancelled tournaments cannot be finalized");
  }
  if (tournament.status === STATUS_COMPLETED && tournament.finalizedAt) {
    return {
      tournament: mapper.toPlain(tournament),
      leaderboard: await leaderboard(tournament._id),
      statistics: await statistics(tournament._id),
      payouts: await payouts(tournament._id),
    };
  }
  var racesList = tournament.races || [];
  if (!racesList.length) throw bad("Tournament must have races before finalizing");
  var unfinished = racesList.filter(function (race) {
    return !isCompletedRaceStatus(race.status) && !isCancelledRaceStatus(race.status);
  });
  if (unfinished.length) throw bad("All races must be result-confirmed or cancelled before finalizing");
  var confirmedRaceIds = racesList
    .filter(function (race) { return isCompletedRaceStatus(race.status); })
    .map(function (race) { return String(race._id); });
  var results = await RaceResult.find({ tournamentId: tournament._id }).exec();
  if (!confirmedRaceIds.length || !results.length) {
    throw bad("Tournament must have at least one confirmed race result");
  }
  var resultsByRace = {};
  for (var i = 0; i < results.length; i += 1) {
    resultsByRace[String(results[i].raceId)] = (resultsByRace[String(results[i].raceId)] || 0) + 1;
  }
  for (var r = 0; r < confirmedRaceIds.length; r += 1) {
    if (!resultsByRace[confirmedRaceIds[r]]) throw bad("Every confirmed race must have result rows before finalizing");
  }
  var finalPayoutStatuses = { PAID: true, UNPAID: true, NOT_ELIGIBLE: true };
  var invalidPayout = results.some(function (result) {
    return !finalPayoutStatuses[result.payoutStatus || "NOT_ELIGIBLE"];
  });
  if (invalidPayout) throw bad("Race prize payouts must be paid, unpaid, or not eligible before finalizing");
  var pendingComplaints = await RaceComplaint.countDocuments({ tournamentId: tournament._id, status: "PENDING" }).exec();
  if (tournament.jockeyChallengeEnabled) {
    var existingChallenge = await JockeyChallengeResult.countDocuments({ tournamentId: tournament._id }).exec();
    if (!existingChallenge) {
      var byJockey = {};
      for (var j = 0; j < results.length; j += 1) {
        var key = String(results[j].jockeyId);
        if (!byJockey[key]) byJockey[key] = { jockeyId: results[j].jockeyId, totalPoints: 0, firstPlaces: 0, secondPlaces: 0, thirdPlaces: 0 };
        byJockey[key].totalPoints += Number(results[j].jockeyChallengePoints || 0);
        if (Number(results[j].rank) === 1) byJockey[key].firstPlaces += 1;
        if (Number(results[j].rank) === 2) byJockey[key].secondPlaces += 1;
        if (Number(results[j].rank) === 3) byJockey[key].thirdPlaces += 1;
      }
      var standings = Object.keys(byJockey).map(function (key) { return byJockey[key]; }).sort(function (a, b) {
        return b.totalPoints - a.totalPoints || b.firstPlaces - a.firstPlaces || b.secondPlaces - a.secondPlaces || b.thirdPlaces - a.thirdPlaces;
      });
      for (var s = 0; s < standings.length; s += 1) {
        await JockeyChallengeResult.create({
          tournamentId: tournament._id,
          jockeyId: standings[s].jockeyId,
          totalPoints: standings[s].totalPoints,
          firstPlaces: standings[s].firstPlaces,
          secondPlaces: standings[s].secondPlaces,
          thirdPlaces: standings[s].thirdPlaces,
          challengeRank: s + 1,
          payoutStatus: "NOT_ELIGIBLE",
          finalizedAt: new Date(),
        });
      }
    }
  }
  tournament.status = STATUS_COMPLETED;
  tournament.finalizedAt = new Date();
  tournament.finalizedBy = currentUser._id;
  tournament.pendingComplaintCountAtFinalize = pendingComplaints;
  tournament.updatedBy = currentUser._id;
  await tournament.save();
  return {
    tournament: mapper.toPlain(tournament),
    leaderboard: await leaderboard(tournament._id),
    statistics: await statistics(tournament._id),
    payouts: await payouts(tournament._id),
  };
}

async function venues(identifier) {
  var tournament = await find(identifier);
  if (!tournament) return null;
  if (tournament.provinceId) {
    return mapper.toPlainList(await RaceVenue.find({ provinceId: tournament.provinceId, active: { $ne: false } }).sort({ name: 1 }).exec());
  }
  if (tournament.venueId) {
    return mapper.toPlainList(await RaceVenue.find({ _id: tournament.venueId }).exec());
  }
  return (tournament.location || "")
    ? [{ id: null, name: tournament.location, address: tournament.location, active: true }]
    : [];
}

module.exports = {
  create: create,
  createRace: createRace,
  deleteRace: deleteRace,
  get: get,
  leaderboard: leaderboard,
  listAll: listAll,
  payouts: payouts,
  finalizeTournament: finalizeTournament,
  races: races,
  remove: remove,
  replaceRaces: replaceRaces,
  setStatus: setStatus,
  statistics: statistics,
  update: update,
  updateRace: updateRace,
  venues: venues,
};
