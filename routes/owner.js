var express = require("express");
var router = express.Router();
var Tournament = require("../models/tournament");
var Horse = require("../models/horse");
var User = require("../models/user");
var JockeyInvitation = require("../models/jockeyInvitation");
var mongoose = require("mongoose");
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var { mapInvitation } = require("../utils/jockeyInvitationMapper");

function findRaceAcrossTournaments(raceId) {
  return Tournament.findOne({ "races._id": raceId }).exec();
}

function buildHorseBreedLabel(horse) {
  var breed = horse.breed || "Chưa rõ giống";
  if (!horse.birthDate) return breed;
  var birth = new Date(horse.birthDate);
  if (Number.isNaN(birth.getTime())) return breed;
  var now = new Date();
  var age = now.getFullYear() - birth.getFullYear();
  var monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? breed + " · " + age + " tuổi" : breed;
}

function toDateInput(value) {
  if (!value) return "";
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toTimeInput(value) {
  if (!value) return "";
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(11, 16);
}

router.use(authenticate, requireRole("OWNER"));

router.get(
  "/dashboard",
  asyncHandler(async function (req, res) {
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
  }),
);

router.get(
  "/horses",
  asyncHandler(async function (req, res) {
    var horses = await Horse.find({ ownerId: req.user.id }).sort({ updatedAt: -1 }).exec();
    res.json(apiSuccess(horses));
  }),
);

router.get(
  "/race-registrations",
  asyncHandler(async function (req, res) {
    var tournaments = await Tournament.find({ "registrations.ownerId": req.user.id }).exec();
    var rows = [];
    tournaments.forEach(function (t) {
      (t.registrations || []).forEach(function (reg) {
        if (String(reg.ownerId) === String(req.user.id)) {
          rows.push(Object.assign({}, reg.toObject(), {
            id: String(reg._id),
            tournamentId: String(t._id),
            tournamentName: t.name,
          }));
        }
      });
    });
    res.json(apiSuccess(rows));
  }),
);

router.get(
  "/jockey-invitations",
  asyncHandler(async function (req, res) {
    var rows = await JockeyInvitation.find({ ownerId: req.user.id }).sort({ createdAt: -1 }).exec();
    res.json(apiSuccess(rows.map(mapInvitation)));
  }),
);

router.post(
  "/jockey-invitations",
  asyncHandler(async function (req, res) {
    var horseId = req.body.horseId || "";
    var raceId = req.body.raceId || "";
    var jockeyId = req.body.jockeyId || "";
    var message = req.body.message || "";
    var remunerationAmount = Number(req.body.remunerationAmount || 0);

    if (!horseId || !raceId || !jockeyId) {
      throw apiError("horseId, raceId và jockeyId là bắt buộc", 400);
    }

    var [jockey, horse, tournament] = await Promise.all([
      User.findById(jockeyId).exec(),
      Horse.findOne({ _id: horseId, ownerId: req.user.id }).exec(),
      findRaceAcrossTournaments(raceId),
    ]);

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
      horseBreed: buildHorseBreedLabel(horse),
      horseAge: horse.age,
      tournamentId: tournament._id,
      tournamentName: tournament.name,
      raceId: race._id,
      raceLabel: "Race R" + (race.raceNumber || "") + " · " + (race.name || ""),
      raceDate: scheduledAt ? toDateInput(scheduledAt) : toDateInput(tournament.startDate),
      raceTime: scheduledAt ? toTimeInput(scheduledAt) : "",
      location: tournament.location || race.track || "",
      reward: remunerationAmount,
      message: message,
      status: "Chờ xử lý",
    });

    res.status(201).json(apiSuccess(mapInvitation(invitation)));
  }),
);

router.get(
  "/jockey-invitations/:id",
  asyncHandler(async function (req, res) {
    var row = await JockeyInvitation.findOne({ _id: req.params.id, ownerId: req.user.id }).exec();
    if (!row) return res.status(404).json({ success: false, message: "Not found", data: null });
    res.json(apiSuccess(mapInvitation(row)));
  }),
);

router.put(
  "/jockey-invitations/:id/cancel",
  asyncHandler(async function (req, res) {
    var row = await JockeyInvitation.findOne({ _id: req.params.id, ownerId: req.user.id }).exec();
    if (!row) throw apiError("Không tìm thấy lời mời", 404);
    if (row.status !== "Chờ xử lý") {
      throw apiError("Chỉ có thể hủy lời mời đang chờ xử lý", 400);
    }
    row.status = "Đã hủy";
    row.cancelledAt = new Date();
    await row.save();
    res.json(apiSuccess(mapInvitation(row)));
  }),
);

module.exports = router;
