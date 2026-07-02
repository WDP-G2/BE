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
var { mapInvitation } = require("../utils/jockeyInvitationMapper");
var {
  buildJockeyPerformancePayload,
  buildProfileResponse,
} = require("../utils/jockeyProfile");

var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.use(authenticate, requireRole("JOCKEY"));

function normalizeRaceStatus(registrationStatus, raceStatus) {
  var reg = String(registrationStatus || "")
    .trim()
    .toLowerCase();
  var race = String(raceStatus || "")
    .trim()
    .toLowerCase();

  if (
    reg === "từ chối" ||
    reg === "rejected" ||
    reg === "cancelled" ||
    race === "cancelled" ||
    race === "đã hủy"
  ) {
    return "CANCELLED";
  }

  if (
    reg === "đang chạy" ||
    reg === "racing" ||
    reg === "đang diễn ra" ||
    race === "đang chạy" ||
    race === "đang diễn ra" ||
    race === "ongoing"
  ) {
    return "ONGOING";
  }

  if (
    reg === "hoàn thành" ||
    reg === "completed" ||
    reg === "đã kết thúc" ||
    race === "hoàn thành" ||
    race === "completed" ||
    race === "đã kết thúc"
  ) {
    return "COMPLETED";
  }

  return "SCHEDULED";
}

router.get(
  "/dashboard",
  asyncHandler(async function (req, res) {
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
  }),
);

router.get(
  "/races",
  asyncHandler(async function (req, res) {
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
  }),
);

router.get(
  "/performance",
  asyncHandler(async function (req, res) {
    var performancePayload = await buildJockeyPerformancePayload(req.user.id);
    res.json(apiSuccess(performancePayload));
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
    })
      .sort({ createdAt: -1 })
      .exec();

    var performancePayload = await buildJockeyPerformancePayload(req.user.id);
    res.json(
      apiSuccess(buildProfileResponse(app, req.user, performancePayload)),
    );
  }),
);

router.put(
  "/profile",
  upload.none(),
  asyncHandler(async function (req, res) {
    var {
      bio,
      licenseNumber,
      experienceYears,
      specialties,
      heightCm,
      weightKg,
      hirePrice,
      awards,
      achievements,
    } = req.body;

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

    var performancePayload = await buildJockeyPerformancePayload(req.user.id);
    res.json(
      apiSuccess(buildProfileResponse(app, req.user, performancePayload)),
    );
  }),
);

router.get(
  "/invitations",
  asyncHandler(async function (req, res) {
    var rows = await JockeyInvitation.find({ jockeyId: req.user.id })
      .sort({ createdAt: -1 })
      .exec();
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
