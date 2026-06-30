var User = require("../models/user");
var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var RaceResult = require("../models/raceResult");
var JockeyChallengeResult = require("../models/jockeyChallengeResult");
var AdminAuditLog = require("../models/adminAuditLog");

function id(value) {
  return value ? String(value._id || value.id || value) : null;
}

async function nameOf(model, value) {
  if (!value) return "";
  var doc = await model.findById(value).exec();
  return doc ? doc.username || doc.fullName || doc.name || doc.email || "" : "";
}

async function findRace(tournamentId, raceId) {
  var tournament = await Tournament.findById(tournamentId).exec();
  if (!tournament) return { tournament: null, race: null };
  return { tournament: tournament, race: tournament.races.id(raceId) };
}

async function mapRaceDebt(result) {
  var raceInfo = await findRace(result.tournamentId, result.raceId);
  var ownerAmount = Number(result.ownerPrizeAmount) || 0;
  var jockeyAmount = Number(result.jockeyPrizeAmount) || 0;
  var prizeAmount = Number(result.prizeAmount) || 0;
  if (!ownerAmount && !jockeyAmount) ownerAmount = prizeAmount;
  return {
    debtType: "RACE_PRIZE",
    referenceId: id(result),
    tournamentId: String(result.tournamentId),
    tournamentName: raceInfo.tournament ? raceInfo.tournament.name : "",
    raceId: String(result.raceId),
    raceName: raceInfo.race ? raceInfo.race.name : "",
    recipientUserId: String(result.ownerId),
    recipientUsername: await nameOf(User, result.ownerId),
    recipientRole: "OWNER_AND_JOCKEY",
    horseId: String(result.horseId),
    horseName: await nameOf(Horse, result.horseId),
    jockeyId: String(result.jockeyId),
    jockeyUsername: await nameOf(User, result.jockeyId),
    rank: result.rank || null,
    amount: prizeAmount,
    ownerPrizeAmount: ownerAmount,
    jockeyPrizeAmount: jockeyAmount,
    jockeyPrizePercent: Number(result.jockeyPrizePercent) || 0,
    finalizedAt: result.finalizedAt || null,
    note: "Race prize is unpaid because admin wallet did not have enough balance",
  };
}

async function mapChallengeDebt(result) {
  var tournament = await Tournament.findById(result.tournamentId).exec();
  return {
    debtType: "JOCKEY_CHALLENGE_PRIZE",
    referenceId: id(result),
    tournamentId: String(result.tournamentId),
    tournamentName: tournament ? tournament.name : "",
    raceId: null,
    raceName: null,
    recipientUserId: String(result.jockeyId),
    recipientUsername: await nameOf(User, result.jockeyId),
    recipientRole: "JOCKEY",
    horseId: null,
    horseName: null,
    jockeyId: String(result.jockeyId),
    jockeyUsername: await nameOf(User, result.jockeyId),
    rank: result.challengeRank || null,
    amount: Number(result.prizeAmount) || 0,
    ownerPrizeAmount: 0,
    jockeyPrizeAmount: Number(result.prizeAmount) || 0,
    jockeyPrizePercent: 0,
    finalizedAt: result.finalizedAt || null,
    note: "Jockey challenge prize is unpaid because admin wallet did not have enough balance",
  };
}

async function payoutDebts() {
  var debts = [];
  var raceResults = await RaceResult.find({ payoutStatus: "UNPAID" }).sort({ finalizedAt: 1, createdAt: 1 }).exec();
  for (var i = 0; i < raceResults.length; i += 1) debts.push(await mapRaceDebt(raceResults[i]));
  var challengeResults = await JockeyChallengeResult.find({ payoutStatus: "UNPAID" }).sort({ finalizedAt: 1, createdAt: 1 }).exec();
  for (var j = 0; j < challengeResults.length; j += 1) debts.push(await mapChallengeDebt(challengeResults[j]));
  debts.sort(function (a, b) {
    return new Date(a.finalizedAt || 8640000000000000) - new Date(b.finalizedAt || 8640000000000000) ||
      String(a.debtType).localeCompare(String(b.debtType)) ||
      String(a.referenceId).localeCompare(String(b.referenceId));
  });
  return {
    totalAmount: debts.reduce(function (total, debt) { return total + (Number(debt.amount) || 0); }, 0),
    debtCount: debts.length,
    debts: debts,
    totalDebt: debts.reduce(function (total, debt) { return total + (Number(debt.amount) || 0); }, 0),
    items: debts,
  };
}

function auditDto(log) {
  return {
    id: id(log),
    adminId: log.adminId ? String(log.adminId) : null,
    action: log.action,
    referenceType: log.referenceType || "",
    referenceId: log.referenceId || "",
    amount: log.amount == null ? null : Number(log.amount),
    reason: log.reason || "",
    metadata: log.metadata || "",
    createdAt: log.createdAt,
  };
}

async function auditLogs(query) {
  var filter = {};
  if (query && query.referenceType && query.referenceId) {
    filter.referenceType = String(query.referenceType);
    filter.referenceId = String(query.referenceId);
  }
  var logs = await AdminAuditLog.find(filter).sort({ createdAt: -1 }).exec();
  return logs.map(auditDto);
}

async function recordAudit(admin, action, referenceType, referenceId, reason, amount, metadata) {
  if (!admin || !admin._id || !action) return null;
  var log = await AdminAuditLog.create({
    adminId: admin._id,
    action: action,
    referenceType: referenceType || "",
    referenceId: referenceId ? String(referenceId) : "",
    amount: amount == null ? undefined : Number(amount),
    reason: reason || "",
    metadata: typeof metadata === "string" ? metadata : JSON.stringify(metadata || {}),
  });
  return auditDto(log);
}

module.exports = {
  auditLogs: auditLogs,
  payoutDebts: payoutDebts,
  recordAudit: recordAudit,
};
