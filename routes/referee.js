var express = require("express");
var router = express.Router();
var Tournament = require("../models/tournament");
var User = require("../models/user");
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var {
  findRaceContext,
  listAllRaces,
  mapRaceSummary,
  getApprovedParticipants,
  mapParticipant,
} = require("../services/tournamentRaceService");

router.use(authenticate, requireRole("REFEREE"));

async function getAssignedRaceRows(refereeId) {
  return listAllRaces(function (row) {
    return row.race.refereeId && String(row.race.refereeId) === String(refereeId);
  });
}

router.get(
  "/dashboard",
  asyncHandler(async function (req, res) {
    var rows = await getAssignedRaceRows(req.user.id);
    res.json(apiSuccess({
      role: "REFEREE",
      assignedRaceCount: rows.length,
      pendingCheckInCount: 0,
      checkedInCount: 0,
      upcomingRaces: rows.slice(0, 5).map(mapRaceSummary),
    }));
  }),
);

router.get(
  "/dashboard/checked-in-count",
  asyncHandler(async function (req, res) {
    res.json(apiSuccess({ count: 0 }));
  }),
);

router.get(
  "/dashboard/pending-check-in-count",
  asyncHandler(async function (req, res) {
    res.json(apiSuccess({ count: 0 }));
  }),
);

router.get(
  "/races",
  asyncHandler(async function (req, res) {
    var rows = await getAssignedRaceRows(req.user.id);
    res.json(apiSuccess(rows.map(mapRaceSummary)));
  }),
);

router.get(
  "/payments",
  asyncHandler(async function (req, res) {
    var rows = await getAssignedRaceRows(req.user.id);
    res.json(apiSuccess(rows.map(function (row) {
      return {
        raceId: String(row.race._id),
        raceName: row.race.name,
        tournamentName: row.tournamentName,
        amount: Number(row.race.refereePaymentAmount || 0),
        status: row.race.refereePaymentStatus || "NONE",
      };
    })));
  }),
);

router.get(
  "/races/:raceId/participants",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
    if (!ctx.race.refereeId || String(ctx.race.refereeId) !== String(req.user.id)) {
      throw apiError("Bạn không được phân công cuộc đua này", 403);
    }
    res.json(apiSuccess(getApprovedParticipants(ctx.tournament, ctx.race._id).map(mapParticipant)));
  }),
);

router.put(
  "/races/:raceId/participants/:participantId/gate",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
    var reg = ctx.tournament.registrations.id(req.params.participantId);
    if (!reg) throw apiError("Không tìm thấy người tham gia", 404);
    reg.gateNumber = Number(req.body.gateNumber);
    await ctx.tournament.save();
    res.json(apiSuccess(mapParticipant(reg), "Cập nhật cổng xuất phát thành công"));
  }),
);

router.put(
  "/races/:raceId/participants/:participantId/check-in",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
    var reg = ctx.tournament.registrations.id(req.params.participantId);
    if (!reg) throw apiError("Không tìm thấy người tham gia", 404);
    reg.checkInStatus = req.body.status === "ABSENT" ? "ABSENT" : "CHECKED_IN";
    reg.participantStatus = reg.checkInStatus === "ABSENT" ? "ABSENT" : "CHECKED_IN";
    if (req.body.note) reg.notes = req.body.note;
    await ctx.tournament.save();
    res.json(apiSuccess(mapParticipant(reg), "Check-in thành công"));
  }),
);

router.put(
  "/races/:raceId/start",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
    ctx.race.status = "Đang chạy";
    await ctx.tournament.save();
    res.json(apiSuccess(mapRaceSummary({
      tournament: ctx.tournament,
      race: ctx.race,
      tournamentId: String(ctx.tournament._id),
      tournamentName: ctx.tournament.name,
    }), "Bắt đầu cuộc đua"));
  }),
);

router.post(
  "/races/:raceId/results/finalize",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
    var results = Array.isArray(req.body.results) ? req.body.results : [];
    ctx.race.results = results.map(function (item, index) {
      return {
        position: Number(item.rank || index + 1),
        horseName: item.horseName || "—",
        jockeyName: item.jockeyUsername || "",
        time: item.finishTimeMillis ? String(item.finishTimeMillis) : "—",
        points: 0,
        notes: item.note || "",
      };
    });
    ctx.race.status = "Hoàn thành";
    await ctx.tournament.save();
    res.json(apiSuccess(ctx.race.results, "Chốt kết quả thành công"));
  }),
);

module.exports = router;
