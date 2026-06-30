var Tournament = require("../models/tournament");
var Horse = require("../models/horse");
var User = require("../models/user");
var RaceRegistration = require("../models/raceRegistration");
var RaceParticipant = require("../models/raceParticipant");
var RaceResult = require("../models/raceResult");
var RaceComplaint = require("../models/raceComplaint");
var JockeyInvitation = require("../models/jockeyInvitation");
var JockeyProfile = require("../models/jockeyProfile");
var JockeyChallengeResult = require("../models/jockeyChallengeResult");
var authService = require("./authService");
var financeSettingsService = require("./financeSettingsService");
var refereeService = require("./refereeService");
var horseService = require("./horseService");
var walletService = require("./walletService");

var STATUS_OPEN_REGISTRATION = "\u0110ang m\u1edf \u0111\u0103ng k\u00fd";
var STATUS_RUNNING = "\u0110ang ch\u1ea1y";
var STATUS_TOURNAMENT_RUNNING = "\u0110ang di\u1ec5n ra";
var STATUS_COMPLETED = "Ho\u00e0n th\u00e0nh";
var STATUS_CANCELLED = "\u0110\u00e3 h\u1ee7y";

async function currentUser(req) {
  var user = await authService.currentUser(req);
  if (!user || !user._id) {
    var err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return user;
}

async function findRace(raceId) {
  var tournament = await Tournament.findOne({ "races._id": raceId }).exec();
  if (!tournament) return null;
  var race = tournament.races.id(raceId);
  return { tournament: tournament, race: race };
}

function bad(message, status) {
  var err = new Error(message);
  err.status = status || 400;
  return err;
}

function requireRole(user, role, message) {
  if (!user || user.role !== role) throw bad(message, 403);
}

function raceEnd(race) {
  if (race.scheduledEndAt) return race.scheduledEndAt;
  if (!race.scheduledAt) return null;
  return new Date(new Date(race.scheduledAt).getTime() + 60 * 60 * 1000);
}

function schedulesOverlap(firstRace, secondRace) {
  if (!firstRace || !secondRace || !firstRace.scheduledAt || !secondRace.scheduledAt) return false;
  var firstStart = new Date(firstRace.scheduledAt);
  var firstEnd = raceEnd(firstRace);
  var secondStart = new Date(secondRace.scheduledAt);
  var secondEnd = raceEnd(secondRace);
  return firstEnd && secondEnd && firstStart < secondEnd && firstEnd > secondStart;
}

async function nameOf(model, id, fallback) {
  if (!id) return fallback || "";
  var doc = await model.findById(id).exec();
  return doc ? doc.fullName || doc.name || doc.username || doc.email || fallback || "" : fallback || "";
}

async function mapRegistration(item) {
  var raceInfo = await findRace(item.raceId);
  return {
    id: String(item._id),
    raceId: String(item.raceId),
    raceName: raceInfo && raceInfo.race ? raceInfo.race.name : "",
    tournamentId: String(item.tournamentId),
    ownerId: String(item.ownerId),
    ownerUsername: await nameOf(User, item.ownerId),
    horseId: String(item.horseId),
    horseName: await nameOf(Horse, item.horseId),
    jockeyId: String(item.jockeyId),
    jockeyUsername: await nameOf(User, item.jockeyId),
    jockeyInvitationId: item.jockeyInvitationId ? String(item.jockeyInvitationId) : null,
    status: item.status,
    entryFeeAmount: item.entryFeeAmount || 0,
    ownerNote: item.ownerNote || "",
    reviewNote: item.reviewNote || "",
    withdrawNote: item.withdrawNote || "",
    reviewedBy: item.reviewedBy ? String(item.reviewedBy) : null,
    reviewedAt: item.reviewedAt || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function mapParticipant(item) {
  return {
    id: String(item._id),
    raceId: String(item.raceId),
    registrationId: String(item.registrationId),
    ownerId: String(item.ownerId),
    ownerUsername: await nameOf(User, item.ownerId),
    horseId: String(item.horseId),
    horseName: await nameOf(Horse, item.horseId),
    jockeyId: String(item.jockeyId),
    jockeyUsername: await nameOf(User, item.jockeyId),
    gateNumber: item.gateNumber || null,
    status: item.status,
    checkInNote: item.checkInNote || "",
    checkedInAt: item.checkedInAt || null,
    checkedInBy: item.checkedInBy ? String(item.checkedInBy) : null,
    lateCheckInFeeAmount: item.lateCheckInFeeAmount || 0,
    lateCheckInFeeCharged: Boolean(item.lateCheckInFeeDebitKey),
    createdAt: item.createdAt,
  };
}

async function mapResult(item) {
  return {
    id: String(item._id),
    raceId: String(item.raceId),
    participantId: String(item.participantId),
    ownerId: String(item.ownerId),
    ownerUsername: await nameOf(User, item.ownerId),
    horseId: String(item.horseId),
    horseName: await nameOf(Horse, item.horseId),
    jockeyId: String(item.jockeyId),
    jockeyUsername: await nameOf(User, item.jockeyId),
    rank: item.rank || null,
    finishTimeMillis: item.finishTimeMillis || null,
    status: item.status,
    jockeyChallengePoints: item.jockeyChallengePoints || 0,
    prizeAmount: item.prizeAmount || 0,
    ownerPrizeAmount: item.ownerPrizeAmount || 0,
    jockeyPrizeAmount: item.jockeyPrizeAmount || 0,
    jockeyPrizePercent: item.jockeyPrizePercent || 0,
    payoutStatus: item.payoutStatus,
    note: item.note || "",
    finalizedBy: item.finalizedBy ? String(item.finalizedBy) : null,
    finalizedAt: item.finalizedAt || null,
  };
}

function mapChallenge(item, jockeyName) {
  return {
    jockeyId: String(item.jockeyId),
    jockeyUsername: jockeyName || "",
    totalPoints: item.totalPoints || 0,
    firstPlaces: item.firstPlaces || 0,
    secondPlaces: item.secondPlaces || 0,
    thirdPlaces: item.thirdPlaces || 0,
    challengeRank: item.challengeRank,
    prizeAmount: item.prizeAmount || 0,
    payoutStatus: item.payoutStatus || "NOT_ELIGIBLE",
    finalizedAt: item.finalizedAt || null,
  };
}

async function mapComplaint(item, revealComplainant) {
  var participant = await RaceParticipant.findById(item.accusedParticipantId).exec();
  var raceInfo = await findRace(item.raceId);
  return {
    id: String(item._id),
    raceId: String(item.raceId),
    raceName: raceInfo && raceInfo.race ? raceInfo.race.name : "",
    complainantOwnerId: revealComplainant ? String(item.complainantOwnerId) : null,
    accusedOwnerId: String(item.accusedOwnerId),
    accusedOwnerUsername: await nameOf(User, item.accusedOwnerId),
    accusedParticipantId: String(item.accusedParticipantId),
    accusedHorseId: participant ? String(participant.horseId) : "",
    accusedHorseName: participant ? await nameOf(Horse, participant.horseId) : "",
    status: item.status,
    reason: item.reason,
    evidenceUrl: item.evidenceUrl || "",
    adminNote: item.adminNote || "",
    ownerPrizeReturnAmount: item.ownerPrizeReturnAmount || 0,
    fineAmount: item.fineAmount || 0,
    totalPenaltyAmount: item.totalPenaltyAmount || 0,
    banUntil: item.banUntil || null,
    createdAt: item.createdAt,
    resolvedAt: item.resolvedAt || null,
    resolvedBy: item.resolvedBy ? String(item.resolvedBy) : null,
  };
}

function raceStatusIsRegistrationOpen(tournament) {
  return tournament.status === STATUS_OPEN_REGISTRATION || tournament.status === "OPEN_REGISTRATION";
}

async function registerForRace(req, raceId, payload) {
  var owner = await currentUser(req);
  requireRole(owner, "OWNER", "Only owners can register for races");
  var raceInfo = await findRace(raceId);
  if (!raceInfo) throw bad("Race not found", 404);
  if (!raceStatusIsRegistrationOpen(raceInfo.tournament)) {
    throw bad("Tournament registration is not open");
  }
  if (owner.ownerBanUntil && new Date(owner.ownerBanUntil) > new Date()) {
    throw bad("Owner is banned from race registration until " + owner.ownerBanUntil);
  }
  var horseId = payload.horseId;
  var invitationId = payload.jockeyInvitationId;
  if (!horseId) throw bad("Horse id is required");
  if (!invitationId) throw bad("Jockey invitation id is required");
  var invitation = await JockeyInvitation.findById(invitationId).exec();
  if (!invitation) throw bad("JockeyInvitation not found", 404);
  if (String(invitation.ownerId) !== String(owner._id)) throw bad("Owner does not own this jockey invitation", 403);
  if (String(invitation.horseId) !== String(horseId)) throw bad("Jockey invitation does not belong to the selected horse");
  if (invitation.raceId && String(invitation.raceId) !== String(raceId)) throw bad("Jockey invitation does not belong to this race");
  if (String(invitation.status) !== "ACCEPTED" && String(invitation.status) !== "Đã chấp nhận") {
    throw bad("Jockey invitation must be accepted");
  }
  var horse = await Horse.findById(horseId).exec();
  if (!horse) throw bad("Horse not found", 404);
  var realOwnerId = horse.ownerId || horse.createdBy;
  if (realOwnerId && String(realOwnerId) !== String(owner._id)) throw bad("Owner does not own this horse", 403);
  if (horseService.effectiveStatus(horse) !== "APPROVED") throw bad("Horse must be approved");
  var profile = invitation.jockeyProfileId
    ? await JockeyProfile.findById(invitation.jockeyProfileId).exec()
    : await JockeyProfile.findOne({ userId: invitation.jockeyId }).exec();
  if (!profile || profile.status !== "APPROVED") throw bad("Jockey profile must be approved");
  var jockeyId = invitation.jockeyId;
  var active = ["PENDING", "APPROVED"];
  if (await RaceRegistration.findOne({ raceId: raceId, ownerId: owner._id, status: { $in: active } }).exec()) {
    throw bad("Owner can only register one horse for this race");
  }
  var maxPerOwner = Number(raceInfo.tournament.config && raceInfo.tournament.config.maxHorsesPerOwner || raceInfo.tournament.maxHorsesPerOwner || 10);
  var ownerTournamentRegistrationCount = await RaceRegistration.countDocuments({
    tournamentId: raceInfo.tournament._id,
    ownerId: owner._id,
    status: { $in: active },
  }).exec();
  if (maxPerOwner > 0 && ownerTournamentRegistrationCount >= maxPerOwner) {
    throw bad("Owner has reached the maximum horses allowed for this tournament");
  }
  if (await RaceRegistration.findOne({ raceId: raceId, horseId: horseId, status: { $in: active } }).exec()) {
    throw bad("Horse is already registered for this race");
  }
  var raceStartAt = raceInfo.race.scheduledAt;
  if (raceStartAt) {
    var windowStart = new Date(new Date(raceStartAt).getTime() - 24 * 60 * 60 * 1000);
    var windowEnd = new Date(new Date(raceStartAt).getTime() + 24 * 60 * 60 * 1000);
    var activeHorseRegistrations = await RaceRegistration.find({ horseId: horseId, status: { $in: active } }).exec();
    for (var h = 0; h < activeHorseRegistrations.length; h += 1) {
      var otherHorseRace = await findRace(activeHorseRegistrations[h].raceId);
      if (otherHorseRace && otherHorseRace.race.scheduledAt) {
        var otherStart = new Date(otherHorseRace.race.scheduledAt);
        if (otherStart >= windowStart && otherStart <= windowEnd) {
          throw bad("Horse can only join one race within a 24-hour period");
        }
      }
    }
  }
  var activeJockeyRegistrations = await RaceRegistration.find({ jockeyId: jockeyId, status: { $in: active } }).exec();
  for (var j = 0; j < activeJockeyRegistrations.length; j += 1) {
    var otherRace = await findRace(activeJockeyRegistrations[j].raceId);
    if (otherRace && schedulesOverlap(otherRace.race, raceInfo.race)) {
      throw bad("Jockey cannot join overlapping races");
    }
  }
  var entryFee = Number(raceInfo.race.entryFee || 0);
  var item = await RaceRegistration.create({
    tournamentId: raceInfo.tournament._id,
    raceId: raceId,
    ownerId: owner._id,
    horseId: horse._id,
    jockeyId: jockeyId,
    jockeyInvitationId: invitation._id,
    status: "PENDING",
    entryFeeAmount: entryFee,
    ownerNote: payload.note || "",
  });
  if (entryFee > 0) {
    var key = "race-registration:" + item._id + ":entry-fee";
    await walletService.debit(owner._id, entryFee, "ENTRY_FEE", "RACE_REGISTRATION", String(item._id), key, "", "Race entry fee");
    item.entryFeeDebitKey = key;
    await item.save();
  }
  return mapRegistration(item);
}

async function ownerRegistrations(req) {
  var owner = await currentUser(req);
  var items = await RaceRegistration.find({ ownerId: owner._id }).sort({ createdAt: -1 }).exec();
  var result = [];
  for (var i = 0; i < items.length; i += 1) result.push(await mapRegistration(items[i]));
  return result;
}

async function tournamentRegistrations(tournamentId) {
  var items = await RaceRegistration.find({ tournamentId: tournamentId }).sort({ createdAt: -1 }).exec();
  var result = [];
  for (var i = 0; i < items.length; i += 1) result.push(await mapRegistration(items[i]));
  return result;
}

async function approveRegistration(req, id, payload) {
  var admin = await currentUser(req);
  var item = await RaceRegistration.findById(id).exec();
  if (!item) return null;
  if (item.status !== "PENDING") throw bad("Only pending race registrations can be approved");
  item.status = "APPROVED";
  item.reviewedBy = admin._id;
  item.reviewedAt = new Date();
  item.reviewNote = payload.note || "";
  await item.save();
  await RaceParticipant.findOneAndUpdate(
    { registrationId: item._id },
    {
      tournamentId: item.tournamentId,
      raceId: item.raceId,
      registrationId: item._id,
      ownerId: item.ownerId,
      horseId: item.horseId,
      jockeyId: item.jockeyId,
      status: "REGISTERED",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
  return mapRegistration(item);
}

async function refundRegistration(item, note) {
  if (item.entryFeeAmount > 0 && item.entryFeeDebitKey && !item.entryFeeRefundKey) {
    var key = "race-registration:" + item._id + ":entry-refund";
    await walletService.credit(item.ownerId, item.entryFeeAmount, "REFUND", "RACE_REGISTRATION", String(item._id), key, "", note);
    item.entryFeeRefundKey = key;
  }
}

async function rejectRegistration(req, id, payload) {
  var admin = await currentUser(req);
  var item = await RaceRegistration.findById(id).exec();
  if (!item) return null;
  if (item.status !== "PENDING") throw bad("Only pending race registrations can be rejected");
  await refundRegistration(item, "Race entry fee refunded after rejection");
  item.status = "REJECTED";
  item.reviewedBy = admin._id;
  item.reviewedAt = new Date();
  item.reviewNote = payload.note || "";
  await item.save();
  return mapRegistration(item);
}

async function withdrawRegistration(req, id, payload) {
  var owner = await currentUser(req);
  var item = await RaceRegistration.findById(id).exec();
  if (!item) return null;
  if (String(item.ownerId) !== String(owner._id)) throw bad("Cannot withdraw another owner's race registration", 403);
  if (item.status !== "PENDING") throw bad("Only pending race registrations can be withdrawn");
  await refundRegistration(item, "Race entry fee refunded after owner withdrawal");
  item.status = "WITHDRAWN";
  item.withdrawNote = payload.note || "";
  await item.save();
  return mapRegistration(item);
}

async function participants(raceId) {
  var items = await RaceParticipant.find({ raceId: raceId }).sort({ gateNumber: 1, createdAt: 1 }).exec();
  var result = [];
  for (var i = 0; i < items.length; i += 1) result.push(await mapParticipant(items[i]));
  return result;
}

async function setGate(participantId, payload) {
  var item = await RaceParticipant.findById(participantId).exec();
  if (!item) return null;
  item.gateNumber = Number(payload.gateNumber);
  await item.save();
  return mapParticipant(item);
}

async function checkIn(req, participantId, payload) {
  var referee = await currentUser(req);
  var item = await RaceParticipant.findById(participantId).exec();
  if (!item) return null;
  item.status = "CHECKED_IN";
  item.checkInNote = payload.note || "";
  item.checkedInAt = new Date();
  item.checkedInBy = referee._id;
  await item.save();
  return mapParticipant(item);
}

async function startRace(raceId) {
  var raceInfo = await findRace(raceId);
  if (!raceInfo) return null;
  raceInfo.race.status = STATUS_RUNNING;
  await raceInfo.tournament.save();
  await RaceParticipant.updateMany({ raceId: raceId, status: "CHECKED_IN" }, { $set: { status: "RUNNING" } }).exec();
  return raceInfo.race;
}

function prizeForRace(race, rank) {
  if (!rank) return 0;
  if (race.prizes && !Array.isArray(race.prizes)) {
    if (rank === 1) return Number(race.prizes.first || 0);
    if (rank === 2) return Number(race.prizes.second || 0);
    if (rank === 3) return Number(race.prizes.third || 0);
  }
  return 0;
}

async function jockeyPrizePercent(rank) {
  var shares = await financeSettingsService.getPrizeShares();
  var share = (shares.shares || []).find(function (item) {
    return Number(item.rank) === Number(rank);
  });
  return share ? Number(share.jockeyPercent || 0) : 0;
}

async function adminCanPay(amount) {
  var wallet = await walletService.getOrCreateAdminWallet();
  return Number(wallet.availableBalance || 0) >= Number(amount || 0);
}

async function payoutRacePrize(result) {
  if (result.payoutStatus !== "PENDING" || Number(result.prizeAmount || 0) <= 0) return;
  if (!(await adminCanPay(result.prizeAmount))) {
    result.payoutStatus = "UNPAID";
    await result.save();
    return;
  }
  var referenceId = String(result._id);
  await walletService.debitAdmin(
    result.prizeAmount,
    "PRIZE",
    "RACE_RESULT",
    referenceId,
    "race-result:" + referenceId + ":admin-prize-debit",
    "",
    "Race prize payout",
  );
  if (Number(result.ownerPrizeAmount || 0) > 0) {
    await walletService.credit(
      result.ownerId,
      result.ownerPrizeAmount,
      "PRIZE",
      "RACE_RESULT",
      referenceId,
      "race-result:" + referenceId + ":owner-prize-credit",
      "",
      "Race prize payout owner share",
    );
  }
  if (Number(result.jockeyPrizeAmount || 0) > 0) {
    await walletService.credit(
      result.jockeyId,
      result.jockeyPrizeAmount,
      "PRIZE",
      "RACE_RESULT",
      referenceId,
      "race-result:" + referenceId + ":jockey-prize-credit",
      "",
      "Race prize payout jockey share",
    );
  }
  result.payoutStatus = "PAID";
  await result.save();
}

async function finalizeResults(req, raceId, payload) {
  var referee = await currentUser(req);
  var raceInfo = await findRace(raceId);
  if (!raceInfo) throw bad("Race not found", 404);
  var entries = payload.results || payload.entries || [];
  if (!Array.isArray(entries) || entries.length === 0) throw bad("Race result entries are required");
  await RaceResult.deleteMany({ raceId: raceId }).exec();
  var result = [];
  for (var i = 0; i < entries.length; i += 1) {
    var entry = entries[i];
    var participant = await RaceParticipant.findById(entry.participantId).exec();
    if (!participant) continue;
    participant.status = entry.status || "FINISHED";
    await participant.save();
    var prize = prizeForRace(raceInfo.race, Number(entry.rank));
    var jockeyPercent = await jockeyPrizePercent(Number(entry.rank));
    var jockeyAmount = Math.round((prize * jockeyPercent) / 100);
    var ownerAmount = prize - jockeyAmount;
    var item = await RaceResult.create({
      tournamentId: raceInfo.tournament._id,
      raceId: raceId,
      participantId: participant._id,
      ownerId: participant.ownerId,
      horseId: participant.horseId,
      jockeyId: participant.jockeyId,
      rank: entry.rank,
      finishTimeMillis: entry.finishTimeMillis,
      status: entry.status || "FINISHED",
      jockeyChallengePoints: entry.jockeyChallengePoints || challengePointsForRank(Number(entry.rank), entry.status || "FINISHED"),
      prizeAmount: prize,
      ownerPrizeAmount: ownerAmount,
      jockeyPrizeAmount: jockeyAmount,
      jockeyPrizePercent: jockeyPercent,
      payoutStatus: prize > 0 ? "PENDING" : "NOT_ELIGIBLE",
      note: entry.note || "",
      finalizedBy: referee._id,
      finalizedAt: new Date(),
    });
    await payoutRacePrize(item);
    result.push(await mapResult(item));
  }
  raceInfo.race.status = STATUS_COMPLETED;
  await raceInfo.tournament.save();
  await refereeService.payForCompletedRace(raceId);
  return result;
}

function challengePointsForRank(rank, status) {
  if (status !== "FINISHED") return 0;
  if (rank === 1) return 5;
  if (rank === 2) return 3;
  if (rank === 3) return 1;
  return 0;
}

async function raceResults(raceId) {
  var items = await RaceResult.find({ raceId: raceId }).sort({ rank: 1 }).exec();
  var result = [];
  for (var i = 0; i < items.length; i += 1) result.push(await mapResult(items[i]));
  return result;
}

async function createComplaint(req, raceId, payload) {
  var owner = await currentUser(req);
  var participant = await RaceParticipant.findById(payload.accusedParticipantId).exec();
  if (!participant) throw bad("Accused participant not found", 404);
  var raceInfo = await findRace(raceId);
  var item = await RaceComplaint.create({
    tournamentId: raceInfo.tournament._id,
    raceId: raceId,
    complainantOwnerId: owner._id,
    accusedOwnerId: participant.ownerId,
    accusedParticipantId: participant._id,
    status: "PENDING",
    reason: payload.reason || "",
    evidenceUrl: payload.evidenceUrl || "",
  });
  return mapComplaint(item, true);
}

async function ownerComplaints(req) {
  var owner = await currentUser(req);
  var items = await RaceComplaint.find({ complainantOwnerId: owner._id }).sort({ createdAt: -1 }).exec();
  var result = [];
  for (var i = 0; i < items.length; i += 1) result.push(await mapComplaint(items[i], true));
  return result;
}

async function adminComplaints() {
  var items = await RaceComplaint.find({}).sort({ createdAt: -1 }).exec();
  var result = [];
  for (var i = 0; i < items.length; i += 1) result.push(await mapComplaint(items[i], true));
  return result;
}

async function resolveComplaint(req, id, payload) {
  var admin = await currentUser(req);
  var item = await RaceComplaint.findById(id).exec();
  if (!item) return null;
  item.status = payload.status || "RESOLVED";
  item.adminNote = payload.adminNote || payload.note || "";
  item.ownerPrizeReturnAmount = Number(payload.ownerPrizeReturnAmount || 0);
  item.fineAmount = Number(payload.fineAmount || 0);
  item.totalPenaltyAmount = item.ownerPrizeReturnAmount + item.fineAmount;
  item.banUntil = payload.banUntil ? new Date(payload.banUntil) : undefined;
  item.resolvedAt = new Date();
  item.resolvedBy = admin._id;
  await item.save();
  return mapComplaint(item, true);
}

async function calculateChallengeStandings(tournamentId) {
  var results = await RaceResult.find({
    tournamentId: tournamentId,
    status: "FINISHED",
    jockeyChallengePoints: { $gt: 0 },
  }).exec();
  var byJockey = {};
  results.forEach(function (result) {
    var key = String(result.jockeyId);
    if (!byJockey[key]) {
      byJockey[key] = {
        jockeyId: result.jockeyId,
        totalPoints: 0,
        firstPlaces: 0,
        secondPlaces: 0,
        thirdPlaces: 0,
      };
    }
    byJockey[key].totalPoints += Number(result.jockeyChallengePoints || 0);
    if (Number(result.rank) === 1) byJockey[key].firstPlaces += 1;
    if (Number(result.rank) === 2) byJockey[key].secondPlaces += 1;
    if (Number(result.rank) === 3) byJockey[key].thirdPlaces += 1;
  });
  var standings = Object.keys(byJockey).map(function (key) { return byJockey[key]; });
  standings.sort(function (a, b) {
    return (
      b.totalPoints - a.totalPoints ||
      b.firstPlaces - a.firstPlaces ||
      b.secondPlaces - a.secondPlaces ||
      b.thirdPlaces - a.thirdPlaces
    );
  });
  return standings.map(function (item, index) {
    item.challengeRank = index + 1;
    item.prizeAmount = 0;
    item.payoutStatus = "NOT_ELIGIBLE";
    item.finalizedAt = new Date();
    return item;
  });
}

async function finalizeJockeyChallenge(req, tournamentId) {
  await currentUser(req);
  var standings = await calculateChallengeStandings(tournamentId);
  await JockeyChallengeResult.deleteMany({ tournamentId: tournamentId }).exec();
  if (standings.length) {
    await JockeyChallengeResult.insertMany(standings.map(function (item) {
      return {
        tournamentId: tournamentId,
        jockeyId: item.jockeyId,
        totalPoints: item.totalPoints,
        firstPlaces: item.firstPlaces,
        secondPlaces: item.secondPlaces,
        thirdPlaces: item.thirdPlaces,
        challengeRank: item.challengeRank,
        prizeAmount: item.prizeAmount,
        payoutStatus: item.payoutStatus,
        finalizedAt: item.finalizedAt,
      };
    }));
  }
  return getJockeyChallenge(tournamentId);
}

async function getJockeyChallenge(tournamentId) {
  var persisted = await JockeyChallengeResult.find({ tournamentId: tournamentId }).sort({ challengeRank: 1 }).exec();
  var source = persisted.length ? persisted : await calculateChallengeStandings(tournamentId);
  var output = [];
  for (var i = 0; i < source.length; i += 1) {
    output.push(mapChallenge(source[i], await nameOf(User, source[i].jockeyId)));
  }
  return output;
}

async function cancelRace(req, raceId, payload) {
  var admin = await currentUser(req);
  var raceInfo = await findRace(raceId);
  if (!raceInfo) return null;
  var regs = await RaceRegistration.find({ raceId: raceId, status: { $in: ["PENDING", "APPROVED"] } }).exec();
  for (var i = 0; i < regs.length; i += 1) {
    await refundRegistration(regs[i], "Race entry fee refunded after race cancellation");
    regs[i].status = "CANCELLED";
    regs[i].reviewedBy = admin._id;
    regs[i].reviewedAt = new Date();
    regs[i].reviewNote = payload.note || "";
    await regs[i].save();
  }
  raceInfo.race.status = STATUS_CANCELLED;
  await refereeService.releaseForCancelledRace(admin._id, raceInfo.race._id);
  await raceInfo.tournament.save();
  return raceInfo.race;
}

async function scheduleTournament(req, tournamentId) {
  var admin = await currentUser(req);
  if (String(admin.role || "").toUpperCase() !== "ADMIN") {
    throw bad("Only admins can schedule tournaments", 403);
  }
  var tournament = await Tournament.findById(tournamentId).exec();
  if (!tournament) throw bad("Tournament not found", 404);
  if (tournament.status === STATUS_COMPLETED || tournament.status === STATUS_CANCELLED) {
    throw bad("Completed or cancelled tournaments cannot be scheduled");
  }
  var activeRaces = (tournament.races || []).filter(function (race) {
    return race.status !== STATUS_CANCELLED && race.status !== STATUS_COMPLETED;
  });
  if (!activeRaces.length) {
    throw bad("Tournament has no active races to schedule");
  }
  var participantCount = await RaceParticipant.countDocuments({ tournamentId: tournament._id }).exec();
  var minTeams = Number(tournament.minTeams || tournament.config && tournament.config.minTeams || 0);
  var maxTeams = Number(tournament.maxTeams || tournament.config && tournament.config.maxRegistrations || 0);
  if (minTeams > 0 && participantCount < minTeams) {
    throw bad("Tournament does not have enough approved participants");
  }
  if (maxTeams > 0 && participantCount > maxTeams) {
    throw bad("Tournament exceeds maximum team limit");
  }
  activeRaces.forEach(function (race) {
    if (!race.scheduledAt) {
      throw bad("Race schedule is required");
    }
    race.status = "S\u1eafp ch\u1ea1y";
  });
  tournament.status = STATUS_TOURNAMENT_RUNNING;
  tournament.updatedBy = admin.username || admin.email || "SYSTEM";
  await tournament.save();
  return tournament;
}

module.exports = {
  adminComplaints: adminComplaints,
  approveRegistration: approveRegistration,
  cancelRace: cancelRace,
  checkIn: checkIn,
  createComplaint: createComplaint,
  currentUser: currentUser,
  finalizeResults: finalizeResults,
  finalizeJockeyChallenge: finalizeJockeyChallenge,
  getJockeyChallenge: getJockeyChallenge,
  mapParticipant: mapParticipant,
  ownerComplaints: ownerComplaints,
  ownerRegistrations: ownerRegistrations,
  participants: participants,
  raceResults: raceResults,
  registerForRace: registerForRace,
  rejectRegistration: rejectRegistration,
  resolveComplaint: resolveComplaint,
  scheduleTournament: scheduleTournament,
  setGate: setGate,
  startRace: startRace,
  tournamentRegistrations: tournamentRegistrations,
  withdrawRegistration: withdrawRegistration,
};
