var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");
var RoleApplication = require("../models/roleApplication");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var { mapInvitation } = require("../utils/jockeyInvitationMapper");
var {
  buildJockeyPerformancePayload,
  buildProfileResponse,
} = require("../utils/jockeyProfile");
var { normalizeRaceStatus } = require("../services/jockeyRaceService");

async function getDashboard(req, res) {
  var performancePayload = await buildJockeyPerformancePayload(req.user.id);
  res.json(
    apiSuccess({
      role: "JOCKEY",
      raceCount: performancePayload.raceCount,
      wins: performancePayload.wins,
      winRate:
        performancePayload.raceCount > 0
          ? Number(
              (
                (performancePayload.wins / performancePayload.raceCount) *
                100
              ).toFixed(1),
            )
          : 0,
      totalJockeyPayout: performancePayload.totalJockeyPayout,
      totalPrizePayout: performancePayload.totalPrizePayout,
    }),
  );
}

async function listRaces(req, res) {
  var tournaments = await Tournament.find({
    "registrations.jockeyId": req.user.id,
  }).exec();
  var rows = [];

  tournaments.forEach(function (t) {
    (t.registrations || []).forEach(function (reg) {
      if (String(reg.jockeyId) !== String(req.user.id)) return;

      var race = null;
      if (reg.raceId) {
        race = (t.races || []).find(function (item) {
          return String(item._id) === String(reg.raceId);
        });
      }
      if (!race && (t.races || []).length) {
        race = t.races[0];
      }

      rows.push({
        id: race ? String(race._id) : String(reg.raceId || ""),
        tournamentId: String(t._id),
        tournamentName: t.name || "",
        name: race?.name || reg.horseName || "",
        status: normalizeRaceStatus(reg.status, race?.status),
        scheduledStartAt: race?.scheduledAt || null,
        venueName: t.name || "",
        venueAddress: t.location || "",
        horseName: reg.horseName || "",
        ownerName: reg.ownerName || "",
      });
    });
  });

  res.json(apiSuccess(rows));
}

async function getPerformance(req, res) {
  var performancePayload = await buildJockeyPerformancePayload(req.user.id);
  res.json(apiSuccess(performancePayload));
}

async function getPrizes(req, res) {
  var tournaments = await Tournament.find({
    "registrations.jockeyId": req.user.id,
  })
    .lean()
    .exec();

  var rows = [];
  tournaments.forEach(function (tournament) {
    (tournament.races || []).forEach(function (race) {
      var prizeByRank = {};
      (Array.isArray(race.prizes) ? race.prizes : []).forEach(function (
        prize,
      ) {
        prizeByRank[Number(prize.rank)] = Number(prize.amount || 0);
      });

      (race.results || []).forEach(function (result) {
        if (String(result.jockeyId || "") !== String(req.user.id)) return;
      });
    });
  });

  res.json(apiSuccess([]));
}

async function getProfile(req, res) {
  var app = await RoleApplication.findOne({
    userId: req.user.id,
    role: "JOCKEY",
    status: "APPROVED",
  })
    .sort({ createdAt: -1 })
    .exec();

  var performancePayload = await buildJockeyPerformancePayload(req.user.id);
  res.json(
    apiSuccess(buildProfileResponse(app, req.user, performancePayload)),
  );
}

async function updateProfile(req, res) {
  var bio = req.body.bio;
  var licenseNumber = req.body.licenseNumber;
  var experienceYears = req.body.experienceYears;
  var specialties = req.body.specialties;
  var heightCm = req.body.heightCm;
  var weightKg = req.body.weightKg;
  var hirePrice = req.body.hirePrice;
  var awards = req.body.awards;
  var achievements = req.body.achievements;

  var setFields = {};
  if (bio !== undefined) setFields["profileData.bio"] = bio;
  if (licenseNumber !== undefined)
    setFields["profileData.licenseNumber"] = licenseNumber;
  if (experienceYears !== undefined)
    setFields["profileData.experienceYears"] = Number(experienceYears);
  if (specialties !== undefined)
    setFields["profileData.specialties"] = specialties;
  if (heightCm !== undefined)
    setFields["profileData.heightCm"] = Number(heightCm);
  if (weightKg !== undefined)
    setFields["profileData.weightKg"] = Number(weightKg);
  if (hirePrice !== undefined)
    setFields["profileData.hirePrice"] = Number(hirePrice);
  if (awards !== undefined) setFields["profileData.awards"] = awards;
  if (achievements !== undefined)
    setFields["profileData.achievements"] = achievements;

  var app = await RoleApplication.findOneAndUpdate(
    { userId: req.user.id, role: "JOCKEY", status: "APPROVED" },
    { $set: setFields },
    { new: true, sort: { createdAt: -1 } },
  ).exec();

  if (!app) {
    app = await RoleApplication.create({
      userId: req.user.id,
      role: "JOCKEY",
      status: "APPROVED",
      fullName: req.user.fullName || req.user.username || "",
      profileData: {
        bio: bio || "",
        licenseNumber: licenseNumber || "",
        experienceYears: Number(experienceYears || 0),
        specialties: specialties || "",
        heightCm: Number(heightCm || 0),
        weightKg: Number(weightKg || 0),
        hirePrice: Number(hirePrice || 0),
        awards: awards || "",
        achievements: achievements || "",
      },
    });
  }

  var performancePayload = await buildJockeyPerformancePayload(req.user.id);
  res.json(
    apiSuccess(buildProfileResponse(app, req.user, performancePayload)),
  );
}

async function listInvitations(req, res) {
  var rows = await JockeyInvitation.find({ jockeyId: req.user.id })
    .sort({ createdAt: -1 })
    .exec();
  res.json(apiSuccess(rows.map(mapInvitation)));
}

async function acceptInvitation(req, res) {
  var row = await JockeyInvitation.findOneAndUpdate(
    { _id: req.params.id, jockeyId: req.user.id },
    { $set: { status: "Đã chấp nhận", respondedAt: new Date() } },
    { new: true },
  ).exec();
  if (!row) throw apiError("Không tìm thấy lời mời", 404);
  res.json(apiSuccess(mapInvitation(row)));
}

async function rejectInvitation(req, res) {
  var responseNote = (req.body && req.body.note) || "";
  var row = await JockeyInvitation.findOneAndUpdate(
    { _id: req.params.id, jockeyId: req.user.id },
    { $set: { status: "Đã từ chối", respondedAt: new Date(), responseNote } },
    { new: true },
  ).exec();
  if (!row) throw apiError("Không tìm thấy lời mời", 404);
  res.json(apiSuccess(mapInvitation(row)));
}

module.exports = {
  getDashboard: getDashboard,
  listRaces: listRaces,
  getPerformance: getPerformance,
  getPrizes: getPrizes,
  getProfile: getProfile,
  updateProfile: updateProfile,
  listInvitations: listInvitations,
  acceptInvitation: acceptInvitation,
  rejectInvitation: rejectInvitation,
};
