var express = require("express");
var router = express.Router();
var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");
var RoleApplication = require("../models/roleApplication");
var multer = require("multer");
var mongoose = require("mongoose");
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");

var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.use(authenticate, requireRole("JOCKEY"));

// Status mapping BE Vietnamese → FE English
var STATUS_TO_CODE = {
  "Chờ xử lý": "PENDING",
  "Đã chấp nhận": "ACCEPTED",
  "Đã từ chối": "REJECTED",
  "Đã hủy": "CANCELLED",
};

function mapInvitation(doc) {
  var obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(obj._id || ""),
    ownerId: String(obj.ownerId || ""),
    ownerUsername: obj.ownerName || "",
    jockeyId: String(obj.jockeyId || ""),
    jockeyUsername: obj.jockeyName || "",
    horseId: String(obj.horseId || ""),
    horseName: obj.horseName || "",
    raceId: obj.raceId ? String(obj.raceId) : null,
    raceName: obj.raceLabel || "",
    raceScheduledStartAt: obj.raceDate && obj.raceTime
      ? obj.raceDate + "T" + obj.raceTime + ":00.000Z"
      : obj.raceDate || null,
    raceScheduledEndAt: null,
    venueId: null,
    venueName: obj.location || "",
    venueAddress: obj.location || "",
    tournamentId: obj.tournamentId ? String(obj.tournamentId) : null,
    tournamentName: obj.tournamentName || "",
    status: STATUS_TO_CODE[obj.status] || "PENDING",
    remunerationAmount: obj.reward || 0,
    taxAmount: 0,
    jockeyPayoutAmount: obj.reward || 0,
    message: obj.message || "",
    responseNote: obj.responseNote || "",
    createdAt: obj.createdAt || null,
    updatedAt: obj.updatedAt || null,
    respondedAt: obj.respondedAt || null,
    cancelledAt: obj.cancelledAt || null,
  };
}

function buildProfileResponse(app, user) {
  var pd = (app && app.profileData) || {};
  return {
    id: app ? String(app._id) : null,
    userId: user.id,
    fullName: (app && app.fullName) || user.fullName || user.username || "",
    username: user.username || "",
    email: user.email || "",
    licenseNumber: pd.licenseNumber || "",
    experienceYears: Number(pd.experienceYears || 0),
    heightCm: Number(pd.heightCm || 0),
    weightKg: Number(pd.weightKg || 0),
    hirePrice: Number(pd.hirePrice || 0),
    bio: pd.bio || "",
    awards: pd.awards || "",
    achievements: pd.achievements || "",
    specialties: pd.specialties || "",
    avatarUrl: pd.avatarUrl || "",
    licenseDocumentUrl: pd.licenseDocumentUrl || "",
    status: app ? (app.status || "APPROVED") : "NO_APPROVED_PROFILE",
    performance: {
      totalRaces: 0,
      wins: 0,
      winRate: 0,
    },
    raceHistory: [],
  };
}

router.get(
  "/dashboard",
  asyncHandler(async function (req, res) {
    var jockeyId = new mongoose.Types.ObjectId(req.user.id);
    var regs = await Tournament.aggregate([
      { $unwind: "$registrations" },
      { $match: { "registrations.jockeyId": jockeyId } },
      { $count: "total" },
    ]);
    res.json(apiSuccess({
      role: "JOCKEY",
      raceCount: regs[0]?.total || 0,
    }));
  }),
);

router.get(
  "/races",
  asyncHandler(async function (req, res) {
    var tournaments = await Tournament.find({ "registrations.jockeyId": req.user.id }).exec();
    var rows = [];
    tournaments.forEach(function (t) {
      (t.registrations || []).forEach(function (reg) {
        if (String(reg.jockeyId) === String(req.user.id)) {
          var race = (t.races || []).find(function (r) { return String(r._id) === String(reg.raceId); });
          rows.push({
            id: race ? String(race._id) : String(reg.raceId),
            tournamentId: String(t._id),
            tournamentName: t.name,
            raceName: race?.name || reg.horseName,
            status: reg.status,
            scheduledAt: race?.scheduledAt,
          });
        }
      });
    });
    res.json(apiSuccess(rows));
  }),
);

router.get(
  "/performance",
  asyncHandler(async function (req, res) {
    res.json(apiSuccess({
      firstPlaces: 0,
      raceCount: 0,
      wins: 0,
      races: 0,
      totalJockeyPayout: 0,
      totalPrizePayout: 0,
      recentRaces: [],
    }));
  }),
);

router.get(
  "/prizes",
  asyncHandler(async function (req, res) {
    res.json(apiSuccess([]));
  }),
);

router.get(
  "/profile",
  asyncHandler(async function (req, res) {
    var app = await RoleApplication.findOne({
      userId: req.user.id,
      role: "JOCKEY",
      status: "APPROVED",
    }).sort({ createdAt: -1 }).exec();

    res.json(apiSuccess(buildProfileResponse(app, req.user)));
  }),
);

router.put(
  "/profile",
  upload.none(),
  asyncHandler(async function (req, res) {
    var { bio, licenseNumber, experienceYears, specialties, heightCm, weightKg, hirePrice, awards, achievements } = req.body;

    var setFields = {};
    if (bio !== undefined) setFields["profileData.bio"] = bio;
    if (licenseNumber !== undefined) setFields["profileData.licenseNumber"] = licenseNumber;
    if (experienceYears !== undefined) setFields["profileData.experienceYears"] = Number(experienceYears);
    if (specialties !== undefined) setFields["profileData.specialties"] = specialties;
    if (heightCm !== undefined) setFields["profileData.heightCm"] = Number(heightCm);
    if (weightKg !== undefined) setFields["profileData.weightKg"] = Number(weightKg);
    if (hirePrice !== undefined) setFields["profileData.hirePrice"] = Number(hirePrice);
    if (awards !== undefined) setFields["profileData.awards"] = awards;
    if (achievements !== undefined) setFields["profileData.achievements"] = achievements;

    var app = await RoleApplication.findOneAndUpdate(
      { userId: req.user.id, role: "JOCKEY", status: "APPROVED" },
      { $set: setFields },
      { new: true, sort: { createdAt: -1 } },
    ).exec();

    if (!app) {
      // No approved application — create a stub so jockey can still save basic info
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

    res.json(apiSuccess(buildProfileResponse(app, req.user)));
  }),
);

router.get(
  "/invitations",
  asyncHandler(async function (req, res) {
    var rows = await JockeyInvitation.find({ jockeyId: req.user.id }).sort({ createdAt: -1 }).exec();
    res.json(apiSuccess(rows.map(mapInvitation)));
  }),
);

router.put(
  "/invitations/:id/accept",
  asyncHandler(async function (req, res) {
    var row = await JockeyInvitation.findOneAndUpdate(
      { _id: req.params.id, jockeyId: req.user.id },
      { $set: { status: "Đã chấp nhận", respondedAt: new Date() } },
      { new: true },
    ).exec();
    if (!row) throw apiError("Không tìm thấy lời mời", 404);
    res.json(apiSuccess(mapInvitation(row)));
  }),
);

router.put(
  "/invitations/:id/reject",
  asyncHandler(async function (req, res) {
    var responseNote = (req.body && req.body.note) || "";
    var row = await JockeyInvitation.findOneAndUpdate(
      { _id: req.params.id, jockeyId: req.user.id },
      { $set: { status: "Đã từ chối", respondedAt: new Date(), responseNote } },
      { new: true },
    ).exec();
    if (!row) throw apiError("Không tìm thấy lời mời", 404);
    res.json(apiSuccess(mapInvitation(row)));
  }),
);

module.exports = router;
