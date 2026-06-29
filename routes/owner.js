var express = require("express");
var router = express.Router();
var Tournament = require("../models/tournament");
var Horse = require("../models/horse");
var JockeyInvitation = require("../models/jockeyInvitation");
var mongoose = require("mongoose");
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess } = require("../utils/apiResponse");

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
    res.json(apiSuccess(rows.map(function (r) {
      return Object.assign({}, r.toObject(), { id: String(r._id) });
    })));
  }),
);

router.get(
  "/jockey-invitations/:id",
  asyncHandler(async function (req, res) {
    var row = await JockeyInvitation.findOne({ _id: req.params.id, ownerId: req.user.id }).exec();
    if (!row) return res.status(404).json({ success: false, message: "Not found", data: null });
    res.json(apiSuccess(Object.assign({}, row.toObject(), { id: String(row._id) })));
  }),
);

router.put(
  "/jockey-invitations/:id/cancel",
  asyncHandler(async function (req, res) {
    var row = await JockeyInvitation.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user.id },
      { $set: { status: "Đã từ chối" } },
      { new: true },
    ).exec();
    res.json(apiSuccess(row));
  }),
);

module.exports = router;
