var express = require("express");
var router = express.Router();
var Tournament = require("../models/tournament");
var JockeyInvitation = require("../models/jockeyInvitation");
var mongoose = require("mongoose");
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");

router.use(authenticate, requireRole("JOCKEY"));

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
    res.json(apiSuccess({ wins: 0, races: 0, recentRaces: [] }));
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
    res.json(apiSuccess({ userId: req.user.id, bio: "", licenseNumber: "" }));
  }),
);

router.get(
  "/invitations",
  asyncHandler(async function (req, res) {
    var rows = await JockeyInvitation.find({ jockeyId: req.user.id }).sort({ createdAt: -1 }).exec();
    res.json(apiSuccess(rows.map(function (r) { return Object.assign({}, r.toObject(), { id: String(r._id) }); })));
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
    res.json(apiSuccess(row));
  }),
);

router.put(
  "/invitations/:id/reject",
  asyncHandler(async function (req, res) {
    var row = await JockeyInvitation.findOneAndUpdate(
      { _id: req.params.id, jockeyId: req.user.id },
      { $set: { status: "Đã từ chối", respondedAt: new Date() } },
      { new: true },
    ).exec();
    if (!row) throw apiError("Không tìm thấy lời mời", 404);
    res.json(apiSuccess(row));
  }),
);

module.exports = router;
