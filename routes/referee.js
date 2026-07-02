var express = require("express");
var router = express.Router();
var multer = require("multer");
var Tournament = require("../models/tournament");
var User = require("../models/user");
var RefereeInvitation = require("../models/refereeInvitation");
var Violation = require("../models/violation");
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var {
  findRaceContext,
  listAllRaces,
  mapRaceSummary,
  getApprovedParticipants,
  mapParticipant,
  applyRefereeAssignment,
} = require("../services/tournamentRaceService");
var { mapInvitation } = require("../utils/refereeInvitationMapper");
var { mapViolation } = require("../utils/violationMapper");
var {
  uploadBufferToCloudinary,
  isCloudinaryError,
} = require("../utils/cloudinaryUpload");

var evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

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
    var now = Date.now();
    var upcomingRows = rows.filter(function (row) {
      var scheduledAt = row.race.scheduledAt;
      return scheduledAt && new Date(scheduledAt).getTime() >= now;
    });

    res.json(apiSuccess({
      role: "REFEREE",
      assignedRaceCount: rows.length,
      pendingCheckInCount: 0,
      checkedInCount: 0,
      upcomingRaces: rows.slice(0, 5).map(mapRaceSummary),
      businessSummary: {
        upcomingRaceCount: upcomingRows.length,
      },
      alerts: [],
      upcoming: upcomingRows.slice(0, 5).map(function (row) {
        var summary = mapRaceSummary(row);
        return {
          id: summary.id,
          title: summary.name,
          at: summary.scheduledAt,
          status: summary.statusCode,
        };
      }),
    }));
  }),
);

async function getCheckInCount(refereeId, checkInStatus) {
  var rows = await getAssignedRaceRows(refereeId);
  return rows.reduce(function (total, row) {
    var participants = getApprovedParticipants(row.tournament, row.raceId);
    return total + participants.filter(function (participant) {
      return (participant.checkInStatus || "PENDING") === checkInStatus;
    }).length;
  }, 0);
}

router.get(
  "/dashboard/checked-in-count",
  asyncHandler(async function (req, res) {
    var count = await getCheckInCount(req.user.id, "CHECKED_IN");
    res.json(apiSuccess({ count: count }));
  }),
);

router.get(
  "/dashboard/pending-check-in-count",
  asyncHandler(async function (req, res) {
    var count = await getCheckInCount(req.user.id, "PENDING");
    res.json(apiSuccess({ count: count }));
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

router.get(
  "/invitations",
  asyncHandler(async function (req, res) {
    var rows = await RefereeInvitation.find({ refereeId: req.user.id })
      .sort({ createdAt: -1 })
      .exec();
    res.json(apiSuccess(rows.map(mapInvitation)));
  }),
);

router.put(
  "/invitations/:id/accept",
  asyncHandler(async function (req, res) {
    var invitation = await RefereeInvitation.findOne({
      _id: req.params.id,
      refereeId: req.user.id,
    }).exec();
    if (!invitation) throw apiError("Không tìm thấy lời mời", 404);
    if (invitation.status !== "Chờ xử lý") {
      throw apiError("Lời mời này đã được phản hồi", 400);
    }

    var ctx = await findRaceContext(invitation.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
    if (ctx.race.refereeId && String(ctx.race.refereeId) !== String(req.user.id)) {
      throw apiError("Cuộc đua đã được phân công cho trọng tài khác", 409);
    }

    await applyRefereeAssignment(ctx.race, req.user.id, invitation.salaryConfigId);
    await ctx.tournament.save();

    invitation.status = "Đã chấp nhận";
    invitation.respondedAt = new Date();
    await invitation.save();

    res.json(apiSuccess(mapInvitation(invitation), "Đã chấp nhận lời mời"));
  }),
);

router.put(
  "/invitations/:id/reject",
  asyncHandler(async function (req, res) {
    var invitation = await RefereeInvitation.findOne({
      _id: req.params.id,
      refereeId: req.user.id,
    }).exec();
    if (!invitation) throw apiError("Không tìm thấy lời mời", 404);
    if (invitation.status !== "Chờ xử lý") {
      throw apiError("Lời mời này đã được phản hồi", 400);
    }

    invitation.status = "Đã từ chối";
    invitation.respondedAt = new Date();
    if (req.body.note) invitation.responseNote = req.body.note;
    await invitation.save();

    res.json(apiSuccess(mapInvitation(invitation), "Đã từ chối lời mời"));
  }),
);

async function assertOwnRace(raceId, refereeId) {
  var ctx = await findRaceContext(raceId);
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  if (!ctx.race.refereeId || String(ctx.race.refereeId) !== String(refereeId)) {
    throw apiError("Bạn không được phân công cuộc đua này", 403);
  }
  return ctx;
}

router.post(
  "/races/:raceId/violations",
  evidenceUpload.single("evidence"),
  asyncHandler(async function (req, res) {
    try {
      var ctx = await assertOwnRace(req.params.raceId, req.user.id);
      var horseNo = Number(req.body.horseNo);
      var approved = getApprovedParticipants(ctx.tournament, ctx.race._id);
      var participant = req.body.participantId
        ? approved.find(function (reg) {
            return String(reg._id) === String(req.body.participantId);
          })
        : approved.find(function (reg) {
            return Number(reg.gateNumber) === horseNo;
          });

      var evidence = [];
      if (req.file) {
        var resourceType = (req.file.mimetype || "").startsWith("video/") ? "video" : "image";
        var uploaded = await uploadBufferToCloudinary(
          req.file,
          "horse-racing/violations",
          resourceType,
        );
        if (uploaded) {
          evidence.push({
            url: uploaded.secure_url || uploaded.url || "",
            name: req.file.originalname || "",
            size: req.file.size || 0,
            mimeType: req.file.mimetype || "",
            publicId: uploaded.public_id || "",
          });
        }
      }

      var violation = await Violation.create({
        raceId: ctx.race._id,
        tournamentId: ctx.tournament._id,
        raceName: ctx.race.name,
        refereeId: req.user.id,
        refereeName: req.user.fullName || req.user.username,
        participantId: participant ? participant._id : null,
        horseNo: Number.isFinite(horseNo) ? horseNo : null,
        horseName: participant ? participant.horseName : req.body.horseName || "",
        jockeyName: participant ? participant.jockeyName : req.body.jockeyName || "",
        type: req.body.type || "Khác",
        severity: req.body.severity || "Phạt nhẹ",
        description: req.body.description || "",
        penalty: req.body.penalty || "",
        occurredAt: req.body.occurredAt || "",
        evidence: evidence,
      });

      res.json(apiSuccess(mapViolation(violation), "Đã ghi nhận vi phạm"));
    } catch (err) {
      if (isCloudinaryError(err)) {
        throw apiError("Không tải lên được bằng chứng: " + String(err.message || err), 400);
      }
      throw err;
    }
  }),
);

router.get(
  "/races/:raceId/violations",
  asyncHandler(async function (req, res) {
    await assertOwnRace(req.params.raceId, req.user.id);
    var rows = await Violation.find({ raceId: req.params.raceId })
      .sort({ createdAt: -1 })
      .exec();
    res.json(apiSuccess(rows.map(mapViolation)));
  }),
);

router.get(
  "/violations",
  asyncHandler(async function (req, res) {
    var rows = await Violation.find({ refereeId: req.user.id })
      .sort({ createdAt: -1 })
      .exec();
    res.json(apiSuccess(rows.map(mapViolation)));
  }),
);

router.put(
  "/violations/:id",
  evidenceUpload.single("evidence"),
  asyncHandler(async function (req, res) {
    try {
      var violation = await Violation.findOne({
        _id: req.params.id,
        refereeId: req.user.id,
      }).exec();
      if (!violation) throw apiError("Không tìm thấy vi phạm", 404);

      if (req.body.type !== undefined) violation.type = req.body.type;
      if (req.body.severity !== undefined) violation.severity = req.body.severity;
      if (req.body.description !== undefined) violation.description = req.body.description;
      if (req.body.penalty !== undefined) violation.penalty = req.body.penalty;
      if (req.body.occurredAt !== undefined) violation.occurredAt = req.body.occurredAt;

      if (req.file) {
        var resourceType = (req.file.mimetype || "").startsWith("video/") ? "video" : "image";
        var uploaded = await uploadBufferToCloudinary(
          req.file,
          "horse-racing/violations",
          resourceType,
        );
        if (uploaded) {
          violation.evidence = [
            {
              url: uploaded.secure_url || uploaded.url || "",
              name: req.file.originalname || "",
              size: req.file.size || 0,
              mimeType: req.file.mimetype || "",
              publicId: uploaded.public_id || "",
            },
          ];
        }
      }

      await violation.save();
      res.json(apiSuccess(mapViolation(violation), "Đã cập nhật vi phạm"));
    } catch (err) {
      if (isCloudinaryError(err)) {
        throw apiError("Không tải lên được bằng chứng: " + String(err.message || err), 400);
      }
      throw err;
    }
  }),
);

module.exports = router;
