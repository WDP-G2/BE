var mongoose = require("../db");
var User = require("../models/user");
var Horse = require("../models/horse");
var Tournament = require("../models/tournament");
var JockeyProfile = require("../models/jockeyProfile");
var JockeyInvitation = require("../models/jockeyInvitation");
var RaceRegistration = require("../models/raceRegistration");
var RaceResult = require("../models/raceResult");
var authService = require("./authService");
var notificationService = require("./notificationService");

var ACTIVE_INVITATION_STATUSES = ["PENDING", "ACCEPTED", "Chờ xử lý", "Đã chấp nhận"];
var ACTIVE_REGISTRATION_STATUSES = ["PENDING", "APPROVED"];
var STATUS_OPEN_TOURNAMENT = "\u0110ang m\u1edf \u0111\u0103ng k\u00fd";
var STATUS_OPEN_RACE = "S\u1eafp ch\u1ea1y";

function bad(message, status) {
  var err = new Error(message);
  err.status = status || 400;
  return err;
}

function id(value) {
  return value ? String(value._id || value.id || value) : null;
}

function objectId(value) {
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
  return null;
}

function userName(user) {
  return user ? user.username || user.fullName || user.name || user.email || "" : "";
}

function horseOwnerId(horse) {
  return horse && horse.ownerId ? String(horse.ownerId) : horse && horse.createdBy ? String(horse.createdBy) : "";
}

function effectiveHorseStatus(horse) {
  if (!horse) return "";
  if (horse.status && !(horse.status === "PENDING" && typeof horse.$isDefault === "function" && horse.$isDefault("status"))) return horse.status;
  return horse.racingStatus === "cannot-race" ? "SUSPENDED" : "APPROVED";
}

function normalizeStatus(status) {
  if (status === "Chờ xử lý") return "PENDING";
  if (status === "Đã chấp nhận") return "ACCEPTED";
  if (status === "Đã từ chối") return "REJECTED";
  return status || "PENDING";
}

function profileStatusFromRoleApplication(application) {
  if (!application) return null;
  if (application.status === "APPROVED") return "APPROVED";
  if (application.status === "REJECTED") return "REJECTED";
  if (application.status === "DRAFT") return "DRAFT";
  return "PENDING";
}

async function currentUser(req) {
  var user = await authService.currentUser(req);
  if (!user || !user._id) throw bad("Unauthorized", 401);
  return user;
}

function requireRole(user, role, message) {
  if (String(user.role || "").toUpperCase() !== role) {
    throw bad(message || "Required role: " + role, 403);
  }
}

async function findRace(raceId) {
  var tournament = await Tournament.findOne({ "races._id": raceId }).exec();
  if (!tournament) return null;
  var race = tournament.races.id(raceId);
  return race ? { tournament: tournament, race: race } : null;
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
  return firstStart < secondEnd && firstEnd > secondStart;
}

function isRaceInvitable(tournament, race) {
  var tournamentStatus = tournament.status;
  var raceStatus = race.status;
  return (
    tournamentStatus === STATUS_OPEN_TOURNAMENT ||
    tournamentStatus === "OPEN_REGISTRATION" ||
    tournamentStatus === "PUBLISHED" ||
    raceStatus === STATUS_OPEN_RACE ||
    raceStatus === "OPEN_REGISTRATION" ||
    raceStatus === "PUBLISHED"
  );
}

async function mapPerformance(jockeyId) {
  var results = await RaceResult.find({ jockeyId: jockeyId }).sort({ finalizedAt: -1, createdAt: -1 }).exec();
  var wins = results.filter(function (result) { return result.rank === 1; }).length;
  var rankCounts = {};
  results.forEach(function (result) {
    if (result.rank != null) rankCounts[String(result.rank)] = (rankCounts[String(result.rank)] || 0) + 1;
  });
  return {
    totalRaces: results.length,
    wins: wins,
    winRate: results.length ? Math.round((wins * 10000) / results.length) / 100 : 0,
    rankCounts: rankCounts,
  };
}

async function raceHistory(jockeyId) {
  var results = await RaceResult.find({ jockeyId: jockeyId }).sort({ finalizedAt: -1, createdAt: -1 }).limit(50).exec();
  var response = [];
  for (var i = 0; i < results.length; i += 1) {
    var result = results[i];
    var raceInfo = await findRace(result.raceId);
    var horse = await Horse.findById(result.horseId).exec();
    response.push({
      tournamentId: raceInfo ? id(raceInfo.tournament) : String(result.tournamentId || ""),
      tournamentName: raceInfo ? raceInfo.tournament.name : "",
      raceId: String(result.raceId),
      raceName: raceInfo ? raceInfo.race.name : "",
      scheduledStartAt: raceInfo ? raceInfo.race.scheduledAt : null,
      horseId: String(result.horseId),
      horseName: horse ? horse.name : "",
      rank: result.rank || null,
      status: result.status,
      finishTimeMillis: result.finishTimeMillis || null,
      finalizedAt: result.finalizedAt || null,
    });
  }
  return response;
}

async function mapProfile(profile) {
  if (!profile) return null;
  var user = await User.findById(profile.userId).exec();
  return {
    id: id(profile),
    userId: String(profile.userId),
    username: userName(user),
    fullName: user ? user.fullName || user.name || "" : "",
    licenseNumber: profile.licenseNumber,
    experienceYears: profile.experienceYears || 0,
    heightCm: profile.heightCm || null,
    weightKg: profile.weightKg || null,
    bio: profile.bio || "",
    awards: profile.awards || "",
    achievements: profile.achievements || "",
    specialties: profile.specialties || "",
    avatarUrl: profile.avatarUrl || "",
    licenseDocumentUrl: profile.licenseDocumentUrl || "",
    status: profile.status,
    reviewReason: profile.reviewReason || "",
    reviewedBy: profile.reviewedBy ? String(profile.reviewedBy) : null,
    reviewedAt: profile.reviewedAt || null,
    performance: await mapPerformance(profile.userId),
    raceHistory: await raceHistory(profile.userId),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

async function upsertApprovedProfileForJockey(user) {
  var profile = await JockeyProfile.findOne({ userId: user._id }).exec();
  if (profile) return profile;
  return JockeyProfile.create({
    userId: user._id,
    licenseNumber: "AUTO-" + String(user._id),
    status: "APPROVED",
    createdBy: user.username || "SYSTEM",
    updatedBy: user.username || "SYSTEM",
  });
}

async function getMyProfile(req) {
  var jockey = await currentUser(req);
  requireRole(jockey, "JOCKEY", "Only jockeys can view jockey profile");
  var profile = await JockeyProfile.findOne({ userId: jockey._id }).exec();
  if (!profile) {
    profile = await upsertApprovedProfileForJockey(jockey);
  }
  return mapProfile(profile);
}

async function updateMyProfile(req, payload) {
  var jockey = await currentUser(req);
  requireRole(jockey, "JOCKEY", "Only jockeys can manage jockey profile");
  var license = payload.licenseNumber || payload.license || "";
  if (!license) {
    var existing = await JockeyProfile.findOne({ userId: jockey._id }).exec();
    license = existing ? existing.licenseNumber : "AUTO-" + String(jockey._id);
  }
  var duplicate = await JockeyProfile.findOne({ licenseNumber: license, userId: { $ne: jockey._id } }).exec();
  if (duplicate) throw bad("License number already exists", 409);
  var update = {
    userId: jockey._id,
    licenseNumber: license,
    updatedBy: jockey.username || jockey.email || "SYSTEM",
    reviewReason: "",
    reviewedBy: undefined,
    reviewedAt: undefined,
  };
  ["experienceYears", "heightCm", "weightKg", "bio", "awards", "achievements", "specialties", "avatarUrl", "licenseDocumentUrl"].forEach(function (field) {
    if (payload[field] !== undefined) update[field] = payload[field];
  });
  if (payload.status && ["DRAFT", "PENDING", "APPROVED", "REJECTED", "SUSPENDED"].indexOf(payload.status) >= 0) {
    update.status = payload.status;
  } else {
    update.status = "PENDING";
  }
  var profile = await JockeyProfile.findOneAndUpdate(
    { userId: jockey._id },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
  return mapProfile(profile);
}

async function availableJockeys() {
  var profiles = await JockeyProfile.find({ status: "APPROVED" }).sort({ createdAt: -1 }).exec();
  var response = [];
  for (var i = 0; i < profiles.length; i += 1) response.push(await mapProfile(profiles[i]));
  if (response.length) return response;
  var users = await User.find({ role: "JOCKEY", active: { $ne: false } }).sort({ createdAt: -1 }).exec();
  for (var j = 0; j < users.length; j += 1) response.push(await mapProfile(await upsertApprovedProfileForJockey(users[j])));
  return response;
}

async function getApprovedJockeyProfile(idValue) {
  var profile = await JockeyProfile.findOne({ userId: idValue, status: "APPROVED" }).exec();
  if (!profile && mongoose.Types.ObjectId.isValid(idValue)) {
    profile = await JockeyProfile.findOne({ _id: idValue, status: "APPROVED" }).exec();
  }
  if (!profile) throw bad("Approved jockey profile not found", 404);
  return mapProfile(profile);
}

async function adminJockeyProfiles(query) {
  var filter = {};
  if (query && query.status) filter.status = String(query.status).toUpperCase();
  var profiles = await JockeyProfile.find(filter).sort({ createdAt: -1 }).exec();
  var response = [];
  for (var i = 0; i < profiles.length; i += 1) response.push(await mapProfile(profiles[i]));
  return response;
}

async function requireHorseForOwner(owner, horseId) {
  var horse = await Horse.findById(horseId).exec();
  if (!horse) throw bad("Horse not found", 404);
  if (horseOwnerId(horse) && horseOwnerId(horse) !== String(owner._id)) {
    throw bad("Cannot invite jockey for another owner's horse", 403);
  }
  if (effectiveHorseStatus(horse) !== "APPROVED") throw bad("Horse must be approved before inviting a jockey");
  return horse;
}

async function requireApprovedJockey(jockeyId) {
  var jockey = await User.findById(jockeyId).exec();
  if (!jockey) throw bad("Jockey not found", 404);
  requireRole(jockey, "JOCKEY", "Invitation target must be a jockey");
  var profile = await JockeyProfile.findOne({ userId: jockey._id }).exec();
  if (!profile) profile = await upsertApprovedProfileForJockey(jockey);
  if (profile.status !== "APPROVED") throw bad("Jockey profile must be approved before invitation");
  return { jockey: jockey, profile: profile };
}

async function assertJockeyRaceAvailable(jockeyId, raceInfo, ignoredInvitationId) {
  var accepted = await JockeyInvitation.find({
    jockeyId: jockeyId,
    status: { $in: ["ACCEPTED", "Đã chấp nhận"] },
    _id: ignoredInvitationId ? { $ne: ignoredInvitationId } : { $exists: true },
  }).exec();
  for (var i = 0; i < accepted.length; i += 1) {
    if (String(accepted[i].raceId) === String(raceInfo.race._id)) {
      throw bad("Jockey already accepted an invitation for this race or an overlapping race");
    }
    var other = await findRace(accepted[i].raceId);
    if (other && schedulesOverlap(other.race, raceInfo.race)) {
      throw bad("Jockey already accepted an invitation for this race or an overlapping race");
    }
  }
}

async function mapInvitation(invitation) {
  var owner = await User.findById(invitation.ownerId).exec();
  var jockey = await User.findById(invitation.jockeyId).exec();
  var horse = await Horse.findById(invitation.horseId).exec();
  var raceInfo = invitation.raceId ? await findRace(invitation.raceId) : null;
  var race = raceInfo ? raceInfo.race : null;
  var tournament = raceInfo ? raceInfo.tournament : null;
  return {
    id: id(invitation),
    ownerId: String(invitation.ownerId),
    ownerUsername: userName(owner) || invitation.ownerName || "",
    jockeyId: String(invitation.jockeyId),
    jockeyUsername: userName(jockey) || invitation.jockeyName || "",
    jockeyProfileId: invitation.jockeyProfileId ? String(invitation.jockeyProfileId) : null,
    horseId: String(invitation.horseId),
    horseName: horse ? horse.name : invitation.horseName || "",
    raceId: invitation.raceId ? String(invitation.raceId) : null,
    raceName: race ? race.name : invitation.raceName || invitation.raceLabel || "",
    raceScheduledStartAt: race ? race.scheduledAt || null : invitation.raceScheduledStartAt || null,
    raceScheduledEndAt: race ? raceEnd(race) : invitation.raceScheduledEndAt || null,
    venueId: invitation.venueId ? String(invitation.venueId) : null,
    venueName: invitation.venueName || "",
    venueAddress: invitation.venueAddress || invitation.location || "",
    tournamentId: tournament ? String(tournament._id) : String(invitation.tournamentId || ""),
    tournamentName: tournament ? tournament.name : invitation.tournamentName || "",
    status: normalizeStatus(invitation.status),
    message: invitation.message || "",
    responseNote: invitation.responseNote || "",
    remunerationAmount: invitation.remunerationAmount || invitation.reward || 0,
    respondedAt: invitation.respondedAt || null,
    cancelledAt: invitation.cancelledAt || null,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
}

async function isEligibleTeam(invitation) {
  if (!invitation || normalizeStatus(invitation.status) !== "ACCEPTED") return false;
  var horse = await Horse.findById(invitation.horseId).exec();
  if (!horse || effectiveHorseStatus(horse) !== "APPROVED") return false;
  if (horseOwnerId(horse) && horseOwnerId(horse) !== String(invitation.ownerId)) return false;
  var profile = invitation.jockeyProfileId
    ? await JockeyProfile.findById(invitation.jockeyProfileId).exec()
    : await JockeyProfile.findOne({ userId: invitation.jockeyId }).exec();
  return Boolean(profile && profile.status === "APPROVED");
}

async function mapEligibleTeam(invitation) {
  var owner = await User.findById(invitation.ownerId).exec();
  var jockey = await User.findById(invitation.jockeyId).exec();
  var horse = await Horse.findById(invitation.horseId).exec();
  var profile = invitation.jockeyProfileId
    ? await JockeyProfile.findById(invitation.jockeyProfileId).exec()
    : await JockeyProfile.findOne({ userId: invitation.jockeyId }).exec();
  return {
    invitationId: String(invitation._id),
    horseId: String(invitation.horseId),
    horseName: horse ? horse.name : invitation.horseName || "",
    ownerId: String(invitation.ownerId),
    ownerUsername: userName(owner) || invitation.ownerName || "",
    jockeyId: String(invitation.jockeyId),
    jockeyUsername: userName(jockey) || invitation.jockeyName || "",
    jockeyProfileId: profile ? String(profile._id) : invitation.jockeyProfileId ? String(invitation.jockeyProfileId) : null,
    jockeyFullName: jockey ? jockey.fullName || jockey.name || userName(jockey) : invitation.jockeyName || "",
    acceptedAt: invitation.respondedAt || invitation.updatedAt || null,
  };
}

async function createInvitation(req, payload) {
  var owner = await currentUser(req);
  requireRole(owner, "OWNER", "Only owners can create jockey invitations");
  var horse = await requireHorseForOwner(owner, payload.horseId);
  var raceInfo = await findRace(payload.raceId);
  if (!raceInfo) throw bad("Race not found", 404);
  if (!isRaceInvitable(raceInfo.tournament, raceInfo.race)) throw bad("Race is not open for jockey invitation");
  if (await JockeyInvitation.findOne({ raceId: payload.raceId, ownerId: owner._id, status: { $in: ACTIVE_INVITATION_STATUSES } }).exec()) {
    throw bad("Owner already has an active jockey invitation for this race");
  }
  var activeRegistrationCount = await RaceRegistration.countDocuments({
    tournamentId: raceInfo.tournament._id,
    ownerId: owner._id,
    status: { $in: ACTIVE_REGISTRATION_STATUSES },
  }).exec();
  var maxPerOwner = Number(raceInfo.tournament.config && raceInfo.tournament.config.maxHorsesPerOwner || raceInfo.tournament.maxHorsesPerOwner || 0);
  if (maxPerOwner > 0 && activeRegistrationCount >= maxPerOwner) {
    throw bad("Owner has reached the maximum horses allowed for this tournament");
  }
  var target = await requireApprovedJockey(payload.jockeyId);
  await assertJockeyRaceAvailable(target.jockey._id, raceInfo);
  if (await JockeyInvitation.findOne({ horseId: horse._id, raceId: raceInfo.race._id, status: { $in: ACTIVE_INVITATION_STATUSES } }).exec()) {
    throw bad("Active invitation already exists for this horse in this race or an overlapping race", 409);
  }
  var amount = Number(payload.remunerationAmount || payload.reward || 0);
  if (!Number.isFinite(amount) || amount < 0) throw bad("Remuneration amount must not be negative");
  var invitation = await JockeyInvitation.create({
    ownerId: owner._id,
    ownerName: userName(owner),
    jockeyId: target.jockey._id,
    jockeyProfileId: target.profile._id,
    jockeyName: userName(target.jockey),
    horseId: horse._id,
    horseName: horse.name,
    horseBreed: horse.breed || "",
    tournamentId: raceInfo.tournament._id,
    tournamentName: raceInfo.tournament.name,
    raceId: raceInfo.race._id,
    raceName: raceInfo.race.name,
    raceScheduledStartAt: raceInfo.race.scheduledAt || null,
    raceScheduledEndAt: raceEnd(raceInfo.race),
    location: raceInfo.tournament.location || "",
    reward: amount,
    remunerationAmount: amount,
    status: "PENDING",
    message: payload.message || "",
    createdBy: owner.username || owner.email || "SYSTEM",
    updatedBy: owner.username || owner.email || "SYSTEM",
  });
  await notificationService.notify(target.jockey._id, "INVITATION_CREATED", "New jockey invitation", "You received a jockey invitation for horse " + horse.name, "JOCKEY_INVITATION", String(invitation._id), JSON.stringify({ horseId: String(horse._id), jockeyId: String(target.jockey._id), ownerId: String(owner._id) }));
  return mapInvitation(invitation);
}

async function ownerInvitations(req) {
  var owner = await currentUser(req);
  requireRole(owner, "OWNER", "Only owners can view owner invitations");
  var items = await JockeyInvitation.find({ ownerId: owner._id }).sort({ createdAt: -1 }).exec();
  var response = [];
  for (var i = 0; i < items.length; i += 1) response.push(await mapInvitation(items[i]));
  return response;
}

async function ownerInvitation(req, invitationId) {
  var owner = await currentUser(req);
  requireRole(owner, "OWNER", "Only owners can view owner invitations");
  var item = await JockeyInvitation.findById(invitationId).exec();
  if (!item) throw bad("Jockey invitation not found", 404);
  if (String(item.ownerId) !== String(owner._id)) throw bad("Cannot view another owner's invitation", 403);
  return mapInvitation(item);
}

async function ownerAcceptedJockeys(req) {
  var owner = await currentUser(req);
  requireRole(owner, "OWNER", "Only owners can view owner jockeys");
  var items = await JockeyInvitation.find({ ownerId: owner._id, status: { $in: ["ACCEPTED", "Đã chấp nhận"] } }).sort({ createdAt: -1 }).exec();
  var response = [];
  for (var i = 0; i < items.length; i += 1) response.push(await mapInvitation(items[i]));
  return response;
}

async function cancelInvitation(req, invitationId) {
  var owner = await currentUser(req);
  requireRole(owner, "OWNER", "Only owners can cancel owner invitations");
  var item = await JockeyInvitation.findById(invitationId).exec();
  if (!item) throw bad("Jockey invitation not found", 404);
  if (String(item.ownerId) !== String(owner._id)) throw bad("Cannot cancel another owner's invitation", 403);
  if (["PENDING", "ACCEPTED", "Chờ xử lý", "Đã chấp nhận"].indexOf(item.status) < 0) {
    throw bad("Only pending or accepted invitations can be cancelled");
  }
  if (normalizeStatus(item.status) === "ACCEPTED") {
    var activeRegistration = await RaceRegistration.findOne({ jockeyInvitationId: item._id, status: { $in: ACTIVE_REGISTRATION_STATUSES } }).exec();
    if (activeRegistration) throw bad("Cannot cancel an accepted invitation used in an active race registration");
  }
  item.status = "CANCELLED";
  item.cancelledAt = new Date();
  item.updatedBy = owner.username || owner.email || "SYSTEM";
  await item.save();
  await notificationService.notify(item.jockeyId, "INVITATION_CANCELLED", "Jockey invitation cancelled", "The invitation for horse " + item.horseName + " was cancelled", "JOCKEY_INVITATION", String(item._id), "");
  return mapInvitation(item);
}

async function jockeyInvitations(req) {
  var jockey = await currentUser(req);
  requireRole(jockey, "JOCKEY", "Only jockeys can view jockey invitations");
  var items = await JockeyInvitation.find({ jockeyId: jockey._id }).sort({ createdAt: -1 }).exec();
  var response = [];
  for (var i = 0; i < items.length; i += 1) response.push(await mapInvitation(items[i]));
  return response;
}

async function jockeyInvitation(req, invitationId) {
  var jockey = await currentUser(req);
  requireRole(jockey, "JOCKEY", "Only jockeys can view jockey invitations");
  var item = await JockeyInvitation.findById(invitationId).exec();
  if (!item) throw bad("Jockey invitation not found", 404);
  if (String(item.jockeyId) !== String(jockey._id)) throw bad("Cannot respond to another jockey's invitation", 403);
  return mapInvitation(item);
}

async function respondInvitation(req, invitationId, status, payload) {
  var jockey = await currentUser(req);
  requireRole(jockey, "JOCKEY", "Only jockeys can respond to jockey invitations");
  var item = await JockeyInvitation.findById(invitationId).exec();
  if (!item) throw bad("Jockey invitation not found", 404);
  if (String(item.jockeyId) !== String(jockey._id)) throw bad("Cannot respond to another jockey's invitation", 403);
  if (normalizeStatus(item.status) !== "PENDING") throw bad("Only pending invitations can be updated");
  var raceInfo = item.raceId ? await findRace(item.raceId) : null;
  if (status === "ACCEPTED") {
    if (raceInfo && !isRaceInvitable(raceInfo.tournament, raceInfo.race)) throw bad("Race is not open for jockey invitation");
    await assertJockeyRaceAvailable(jockey._id, raceInfo, item._id);
  }
  item.status = status;
  item.responseNote = payload.note || payload.responseNote || "";
  item.respondedAt = new Date();
  item.updatedBy = jockey.username || jockey.email || "SYSTEM";
  await item.save();
  if (status === "ACCEPTED" && raceInfo) {
    var pending = await JockeyInvitation.find({ jockeyId: jockey._id, status: { $in: ["PENDING", "Chờ xử lý"] }, _id: { $ne: item._id } }).exec();
    for (var i = 0; i < pending.length; i += 1) {
      var other = await findRace(pending[i].raceId);
      if (other && (String(other.race._id) === String(raceInfo.race._id) || schedulesOverlap(other.race, raceInfo.race))) {
        pending[i].status = "CANCELLED";
        pending[i].responseNote = "Jockey accepted a conflicting invitation";
        pending[i].cancelledAt = new Date();
        pending[i].updatedBy = jockey.username || jockey.email || "SYSTEM";
        await pending[i].save();
      }
    }
  }
  await notificationService.notify(item.ownerId, status === "ACCEPTED" ? "INVITATION_ACCEPTED" : "INVITATION_REJECTED", status === "ACCEPTED" ? "Jockey invitation accepted" : "Jockey invitation rejected", userName(jockey) + (status === "ACCEPTED" ? " accepted your invitation" : " rejected your invitation"), "JOCKEY_INVITATION", String(item._id), "");
  return mapInvitation(item);
}

async function eligibleHorseTeams(req) {
  var owner = await currentUser(req);
  requireRole(owner, "OWNER", "Only owners can view eligible horse teams");
  var items = await JockeyInvitation.find({ ownerId: owner._id, status: { $in: ["ACCEPTED", "Đã chấp nhận"] } }).sort({ createdAt: -1 }).exec();
  var response = [];
  for (var i = 0; i < items.length; i += 1) {
    if (await isEligibleTeam(items[i])) response.push(await mapEligibleTeam(items[i]));
  }
  return response;
}

async function adminEligibleHorseTeams(req, tournamentId) {
  var admin = await currentUser(req);
  requireRole(admin, "ADMIN", "Only admins can view eligible horse teams");
  var tournament = await Tournament.findById(tournamentId).exec();
  if (!tournament) throw bad("Tournament not found", 404);
  var items = await JockeyInvitation.find({ status: { $in: ["ACCEPTED", "Đã chấp nhận"] } }).sort({ createdAt: -1 }).exec();
  var response = [];
  for (var i = 0; i < items.length; i += 1) {
    if (await isEligibleTeam(items[i])) response.push(await mapEligibleTeam(items[i]));
  }
  return response;
}

async function rankings() {
  var horseRows = await RaceResult.aggregate([
    { $match: { status: "FINISHED" } },
    { $group: { _id: "$horseId", wins: { $sum: { $cond: [{ $eq: ["$rank", 1] }, 1, 0] } }, races: { $sum: 1 }, totalPrizeAmount: { $sum: "$prizeAmount" } } },
    { $sort: { wins: -1, totalPrizeAmount: -1, races: 1 } },
    { $limit: 10 },
  ]).exec();
  var jockeyRows = await RaceResult.aggregate([
    { $match: { status: "FINISHED" } },
    { $group: { _id: "$jockeyId", wins: { $sum: { $cond: [{ $eq: ["$rank", 1] }, 1, 0] } }, races: { $sum: 1 }, totalPrizeAmount: { $sum: "$jockeyPrizeAmount" } } },
    { $sort: { wins: -1, totalPrizeAmount: -1, races: 1 } },
    { $limit: 10 },
  ]).exec();
  var horses = [];
  for (var i = 0; i < horseRows.length; i += 1) {
    var horse = await Horse.findById(horseRows[i]._id).exec();
    horses.push({ rank: i + 1, horseId: String(horseRows[i]._id), horseName: horse ? horse.name : "", wins: horseRows[i].wins, races: horseRows[i].races, totalPrizeAmount: horseRows[i].totalPrizeAmount || 0 });
  }
  var jockeys = [];
  for (var j = 0; j < jockeyRows.length; j += 1) {
    var jockey = await User.findById(jockeyRows[j]._id).exec();
    jockeys.push({ rank: j + 1, jockeyId: String(jockeyRows[j]._id), jockeyUsername: userName(jockey), wins: jockeyRows[j].wins, races: jockeyRows[j].races, totalPrizeAmount: jockeyRows[j].totalPrizeAmount || 0 });
  }
  return { horses: horses, jockeys: jockeys };
}

module.exports = {
  adminEligibleHorseTeams: adminEligibleHorseTeams,
  adminJockeyProfiles: adminJockeyProfiles,
  availableJockeys: availableJockeys,
  cancelInvitation: cancelInvitation,
  createInvitation: createInvitation,
  eligibleHorseTeams: eligibleHorseTeams,
  getApprovedJockeyProfile: getApprovedJockeyProfile,
  getMyProfile: getMyProfile,
  jockeyInvitation: jockeyInvitation,
  jockeyInvitations: jockeyInvitations,
  ownerAcceptedJockeys: ownerAcceptedJockeys,
  ownerInvitation: ownerInvitation,
  ownerInvitations: ownerInvitations,
  rankings: rankings,
  respondInvitation: respondInvitation,
  updateMyProfile: updateMyProfile,
};
