var mongoose = require("mongoose");
var Tournament = require("../models/tournament");
var Horse = require("../models/horse");
var User = require("../models/user");
var RoleApplication = require("../models/roleApplication");
var JockeyInvitation = require("../models/jockeyInvitation");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var { mapInvitation } = require("../utils/jockeyInvitationMapper");
var { mapHorse } = require("../utils/horseMapper");
var ownerService = require("../services/ownerService");
var { buildOwnerResultsPayload } = require("../services/ownerResultsService");
var { mapRaceRegistration } = require("../utils/raceRegistrationMapper");

function buildOwnerProfileResponse(app, user) {
  var profileData = (app && app.profileData) || {};
  return {
    id: app ? String(app._id) : null,
    role: "OWNER",
    status: app ? app.status : "APPROVED",
    stableName: profileData.stableName || "",
    address: profileData.address || "",
    experienceYears: profileData.experienceYears ?? "",
    bio: profileData.bio || "",
    verificationDocumentUrl: profileData.verificationDocumentUrl || "",
    fullName: (app && app.fullName) || user.fullName || user.name || user.username || "",
    phone: (app && app.phone) || user.phone || "",
    createdAt: app ? app.createdAt : null,
    updatedAt: app ? app.updatedAt : null,
  };
}

async function findApprovedOwnerApplication(userId) {
  return RoleApplication.findOne({
    userId: userId,
    role: "OWNER",
    status: "APPROVED",
  })
    .sort({ createdAt: -1 })
    .exec();
}

async function getProfile(req, res) {
  var app = await findApprovedOwnerApplication(req.user.id);
  res.json(apiSuccess(buildOwnerProfileResponse(app, req.user)));
}

async function updateProfile(req, res) {
  var stableName = req.body.stableName;
  var address = req.body.address;
  var experienceYears = req.body.experienceYears;
  var bio = req.body.bio;
  var phone = req.body.phone;

  var setFields = {};
  if (stableName !== undefined) setFields["profileData.stableName"] = String(stableName).trim();
  if (address !== undefined) setFields["profileData.address"] = String(address).trim();
  if (experienceYears !== undefined && experienceYears !== "") {
    setFields["profileData.experienceYears"] = Number(experienceYears);
  }
  if (bio !== undefined) setFields["profileData.bio"] = String(bio).trim();
  if (phone !== undefined) setFields.phone = String(phone).trim();

  var app = await RoleApplication.findOneAndUpdate(
    { userId: req.user.id, role: "OWNER", status: "APPROVED" },
    { $set: setFields },
    { new: true, sort: { createdAt: -1 } },
  ).exec();

  if (!app) {
    throw apiError("Chưa có hồ sơ chủ ngựa được duyệt", 404);
  }

  if (phone !== undefined) {
    await User.findByIdAndUpdate(req.user.id, { $set: { phone: String(phone).trim() } }).exec();
    req.user.phone = String(phone).trim();
  }

  res.json(apiSuccess(buildOwnerProfileResponse(app, req.user), "Cập nhật hồ sơ chủ ngựa thành công"));
}

async function getResults(req, res) {
  var payload = await buildOwnerResultsPayload(req.user.id);
  res.json(apiSuccess(payload));
}

async function getDashboard(req, res) {
  var horses = await Horse.countDocuments({ ownerId: req.user.id }).exec();
  var ownerId = new mongoose.Types.ObjectId(req.user.id);
  var regs = await Tournament.aggregate([
    { $unwind: "$registrations" },
    { $match: { "registrations.ownerId": ownerId } },
    { $count: "total" },
  ]);
  res.json(apiSuccess({
    role: "OWNER",
    horseCount: horses,
    registrationCount: regs[0]?.total || 0,
  }));
}

async function listHorses(req, res) {
  var horses = await Horse.find({ ownerId: req.user.id }).sort({ updatedAt: -1 }).exec();
  res.json(apiSuccess(horses.map(mapHorse)));
}

async function listRaceRegistrations(req, res) {
  var tournaments = await Tournament.find({ "registrations.ownerId": req.user.id }).exec();
  var rows = [];
  tournaments.forEach(function (tournament) {
    (tournament.registrations || []).forEach(function (registration) {
      if (String(registration.ownerId) !== String(req.user.id)) return;
      var race = registration.raceId ? tournament.races.id(registration.raceId) : null;
      rows.push(mapRaceRegistration(tournament, registration, race));
    });
  });
  rows.sort(function (a, b) {
    var aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    var bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  res.json(apiSuccess(rows));
}

async function listJockeyInvitations(req, res) {
  var rows = await JockeyInvitation.find({ ownerId: req.user.id }).sort({ createdAt: -1 }).exec();
  res.json(apiSuccess(rows.map(mapInvitation)));
}

async function createJockeyInvitation(req, res) {
  var horseId = req.body.horseId || "";
  var raceId = req.body.raceId || "";
  var jockeyId = req.body.jockeyId || "";
  var message = req.body.message || "";
  var remunerationAmount = Number(req.body.remunerationAmount || 0);

  if (!horseId || !raceId || !jockeyId) {
    throw apiError("horseId, raceId và jockeyId là bắt buộc", 400);
  }

  var results = await Promise.all([
    User.findById(jockeyId).exec(),
    Horse.findOne({ _id: horseId, ownerId: req.user.id }).exec(),
    ownerService.findRaceAcrossTournaments(raceId),
  ]);
  var jockey = results[0];
  var horse = results[1];
  var tournament = results[2];

  if (!jockey || jockey.role !== "JOCKEY") {
    throw apiError("Không tìm thấy jockey", 404);
  }
  if (!horse) {
    throw apiError("Không tìm thấy ngựa của bạn", 404);
  }
  if (!tournament) {
    throw apiError("Không tìm thấy cuộc đua", 404);
  }

  var race = tournament.races.id(raceId);

  var existing = await JockeyInvitation.findOne({
    ownerId: req.user.id,
    jockeyId: jockey._id,
    horseId: horse._id,
    raceId: race._id,
    status: "Chờ xử lý",
  }).exec();
  if (existing) {
    throw apiError("Lời mời đang chờ xử lý đã tồn tại cho jockey này", 409);
  }

  var scheduledAt = race.scheduledAt ? new Date(race.scheduledAt) : null;

  var invitation = await JockeyInvitation.create({
    ownerId: req.user.id,
    ownerName: req.user.fullName || req.user.username || "",
    jockeyId: jockey._id,
    jockeyName: jockey.fullName || jockey.name || jockey.username || "",
    horseId: horse._id,
    horseName: horse.name,
    horseBreed: ownerService.buildHorseBreedLabel(horse),
    horseAge: horse.age,
    tournamentId: tournament._id,
    tournamentName: tournament.name,
    raceId: race._id,
    raceLabel: "Race R" + (race.raceNumber || "") + " · " + (race.name || ""),
    raceDate: scheduledAt ? ownerService.toDateInput(scheduledAt) : ownerService.toDateInput(tournament.startDate),
    raceTime: scheduledAt ? ownerService.toTimeInput(scheduledAt) : "",
    location: tournament.location || race.track || "",
    reward: remunerationAmount,
    message: message,
    status: "Chờ xử lý",
  });

  res.status(201).json(apiSuccess(mapInvitation(invitation)));
}

async function getJockeyInvitation(req, res) {
  var row = await JockeyInvitation.findOne({ _id: req.params.id, ownerId: req.user.id }).exec();
  if (!row) return res.status(404).json({ success: false, message: "Not found", data: null });
  res.json(apiSuccess(mapInvitation(row)));
}

async function cancelJockeyInvitation(req, res) {
  var row = await JockeyInvitation.findOne({ _id: req.params.id, ownerId: req.user.id }).exec();
  if (!row) throw apiError("Không tìm thấy lời mời", 404);
  if (row.status !== "Chờ xử lý") {
    throw apiError("Chỉ có thể hủy lời mời đang chờ xử lý", 400);
  }
  row.status = "Đã hủy";
  row.cancelledAt = new Date();
  await row.save();
  res.json(apiSuccess(mapInvitation(row)));
}

module.exports = {
  getDashboard: getDashboard,
  getResults: getResults,
  getProfile: getProfile,
  updateProfile: updateProfile,
  listHorses: listHorses,
  listRaceRegistrations: listRaceRegistrations,
  listJockeyInvitations: listJockeyInvitations,
  createJockeyInvitation: createJockeyInvitation,
  getJockeyInvitation: getJockeyInvitation,
  cancelJockeyInvitation: cancelJockeyInvitation,
};
