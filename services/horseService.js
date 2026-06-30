var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var RaceRegistration = require("../models/raceRegistration");
var RaceParticipant = require("../models/raceParticipant");
var RaceResult = require("../models/raceResult");
var JockeyInvitation = require("../models/jockeyInvitation");
var ids = require("../utils/ids");

function bad(message, status) {
  var err = new Error(message);
  err.status = status || 400;
  return err;
}

function userName(user) {
  return user ? user.username || user.fullName || user.name || user.email || "" : "";
}

function id(value) {
  return value ? String(value._id || value.id || value) : "";
}

function ownerIdOf(horse) {
  return id(horse.ownerId || horse.createdBy);
}

function effectiveStatus(horse) {
  if (!horse) return "";
  if (horse.status && !(horse.status === "PENDING" && typeof horse.$isDefault === "function" && horse.$isDefault("status"))) {
    return horse.status;
  }
  return horse.racingStatus === "cannot-race" ? "SUSPENDED" : "APPROVED";
}

function racingStatusFor(status) {
  return status === "APPROVED" ? "can-race" : "cannot-race";
}

function requireRole(user, role, message) {
  if (!user || user.role !== role) throw bad(message, 403);
}

async function raceInfo(raceId) {
  var tournament = await Tournament.findOne({ "races._id": raceId }).exec();
  if (!tournament) return null;
  var race = tournament.races.id(raceId);
  return race ? { tournament: tournament, race: race } : null;
}

async function performanceForHorse(horseId) {
  var results = await RaceResult.find({ horseId: horseId }).sort({ finalizedAt: -1, createdAt: -1 }).exec();
  var rankCounts = {};
  var wins = 0;
  var history = [];
  for (var i = 0; i < results.length; i += 1) {
    var result = results[i];
    if (result.rank) rankCounts[String(result.rank)] = (rankCounts[String(result.rank)] || 0) + 1;
    if (Number(result.rank) === 1) wins += 1;
    var info = await raceInfo(result.raceId);
    history.push({
      tournamentId: info ? String(info.tournament._id) : String(result.tournamentId),
      tournamentName: info ? info.tournament.name : "",
      raceId: String(result.raceId),
      raceName: info && info.race ? info.race.name : "",
      scheduledStartAt: info && info.race ? info.race.scheduledAt || null : null,
      rank: result.rank || null,
      status: result.status,
      finishTimeMillis: result.finishTimeMillis || null,
      finalizedAt: result.finalizedAt || null,
    });
  }
  return {
    performance: {
      totalRaces: results.length,
      wins: wins,
      winRate: results.length ? Number(((wins * 100) / results.length).toFixed(2)) : 0,
      rankCounts: rankCounts,
    },
    raceHistory: history,
  };
}

async function mapHorse(horse) {
  if (!horse) return null;
  var perf = await performanceForHorse(horse._id);
  var status = effectiveStatus(horse);
  return {
    id: id(horse),
    ownerId: ownerIdOf(horse) || null,
    ownerUsername: horse.ownerName || "",
    name: horse.name,
    slug: horse.slug,
    breed: horse.breed || "",
    age: horse.age == null ? null : horse.age,
    gender: horse.gender || "",
    color: horse.color || "",
    heightCm: horse.heightCm == null ? null : horse.heightCm,
    weightKg: horse.weightKg == null ? null : horse.weightKg,
    imageUrl: horse.imageUrl || "",
    documentUrl: horse.documentUrl || horse.licenseImageUrl || "",
    status: status,
    racingStatus: horse.racingStatus || racingStatusFor(status),
    reviewReason: horse.reviewReason || "",
    reviewedBy: horse.reviewedBy ? String(horse.reviewedBy) : null,
    reviewedAt: horse.reviewedAt || null,
    performance: perf.performance,
    raceHistory: perf.raceHistory,
    createdAt: horse.createdAt,
    updatedAt: horse.updatedAt,
  };
}

async function mapHorses(horses) {
  var result = [];
  for (var i = 0; i < horses.length; i += 1) result.push(await mapHorse(horses[i]));
  return result;
}

async function listApproved() {
  var horses = await Horse.find({
    $or: [
      { status: "APPROVED" },
      { status: { $exists: false }, racingStatus: { $ne: "cannot-race" } },
    ],
  })
    .sort({ createdAt: -1 })
    .exec();
  return mapHorses(horses);
}

async function listAll(query) {
  var filter = {};
  if (query && query.status) filter.status = String(query.status).toUpperCase();
  var horses = await Horse.find(filter).sort({ createdAt: -1 }).exec();
  return mapHorses(horses);
}

async function listOwner(currentUser) {
  requireRole(currentUser, "OWNER", "Only owners can view owner horses");
  var horses = await Horse.find({
    $or: [{ ownerId: currentUser._id }, { createdBy: currentUser._id }],
  }).sort({ createdAt: -1 }).exec();
  return mapHorses(horses);
}

async function find(identifier, currentUser) {
  var horse = null;
  if (ids.isObjectId(identifier)) {
    horse = await Horse.findById(identifier).exec();
  }
  if (!horse) {
    horse = await Horse.findOne({ slug: identifier }).exec();
  }
  if (!horse) return null;
  var status = effectiveStatus(horse);
  if (status === "APPROVED" || (currentUser && ownerIdOf(horse) === id(currentUser))) {
    return mapHorse(horse);
  }
  return null;
}

async function create(payload, currentUser) {
  requireRole(currentUser, "OWNER", "Only owners can manage horses");
  var name = payload.name || "Horse " + Date.now();
  var horse = await Horse.create(Object.assign({}, payload, {
    name: name,
    slug: payload.slug || ids.createSlug(name) + "-" + Date.now(),
    ownerId: currentUser._id,
    ownerName: userName(currentUser),
    status: "PENDING",
    racingStatus: "cannot-race",
    reviewReason: "",
    reviewedBy: undefined,
    reviewedAt: undefined,
    createdBy: currentUser._id,
  }));
  return mapHorse(horse);
}

async function update(id, payload, currentUser) {
  requireRole(currentUser, "OWNER", "Only owners can manage horses");
  var horse = await Horse.findById(id).exec();
  if (!horse || ownerIdOf(horse) !== String(currentUser._id)) throw bad("Horse not found", 404);
  var status = effectiveStatus(horse);
  if (status === "APPROVED" || status === "SUSPENDED") {
    throw bad("Approved or suspended horses cannot be updated by owner");
  }
  var updatePayload = Object.assign({}, payload, {
    status: "PENDING",
    racingStatus: "cannot-race",
    reviewReason: "",
    reviewedBy: undefined,
    reviewedAt: undefined,
    updatedBy: currentUser._id,
  });
  horse = await Horse.findByIdAndUpdate(id, updatePayload, {
    new: true,
  }).exec();
  return mapHorse(horse);
}

async function hasHorseActivity(horseId) {
  return Boolean(
    await JockeyInvitation.exists({ horseId: horseId }).exec() ||
    await RaceRegistration.exists({ horseId: horseId }).exec() ||
    await RaceParticipant.exists({ horseId: horseId }).exec() ||
    await RaceResult.exists({ horseId: horseId }).exec(),
  );
}

async function remove(id, currentUser) {
  requireRole(currentUser, "OWNER", "Only owners can manage horses");
  var horse = await Horse.findById(id).exec();
  if (!horse || ownerIdOf(horse) !== String(currentUser._id)) throw bad("Horse not found", 404);
  var status = effectiveStatus(horse);
  if (status !== "PENDING" && status !== "REJECTED") {
    throw bad("Only pending or rejected horses can be deleted");
  }
  if (await hasHorseActivity(horse._id)) throw bad("Cannot delete horse with activity history");
  await Horse.findByIdAndDelete(id).exec();
}

async function review(idValue, status, currentUser, payload) {
  requireRole(currentUser, "ADMIN", "Only admins can review horses");
  if ((status === "REJECTED" || status === "SUSPENDED") && (!payload || !payload.reason)) {
    throw bad("Review reason is required");
  }
  var horse = await Horse.findByIdAndUpdate(
    idValue,
    {
      status: status,
      racingStatus: racingStatusFor(status),
      reviewReason: status === "APPROVED" ? "" : payload.reason,
      reviewedBy: currentUser._id,
      reviewedAt: new Date(),
      updatedBy: currentUser._id,
    },
    { new: true },
  ).exec();
  if (!horse) throw bad("Horse not found", 404);
  return mapHorse(horse);
}

async function setRacingStatus(idValue, racingStatus, currentUser, payload) {
  var status = racingStatus === "can-race" ? "APPROVED" : "SUSPENDED";
  return review(idValue, status, currentUser, payload || {});
}

module.exports = {
  create: create,
  effectiveStatus: effectiveStatus,
  find: find,
  listAll: listAll,
  listOwner: listOwner,
  listApproved: listApproved,
  remove: remove,
  review: review,
  setRacingStatus: setRacingStatus,
  update: update,
};
