var RefereeInvitation = require("../models/refereeInvitation");
var Violation = require("../models/violation");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var {
  findRaceContext,
  mapRaceSummary,
  getApprovedParticipants,
  mapParticipant,
  applyRefereeAssignment,
  assertRaceReadyToStart,
  prizeAmountForRank,
  backfillResultFinalizedAt,
} = require("../services/tournamentRaceService");
var tm = require("../utils/tournamentMapper");
var tournamentStatusSync = require("../services/tournamentStatusSync");
var { mapInvitation } = require("../utils/refereeInvitationMapper");
var { mapViolation } = require("../utils/violationMapper");
var {
  uploadBufferToCloudinary,
  isCloudinaryError,
} = require("../utils/cloudinaryUpload");
var refereeService = require("../services/refereeService");
var { payReferee } = require("../services/walletLedger");

async function getDashboard(req, res) {
  var rows = await refereeService.getAssignedRaceRows(req.user.id);
  await tournamentStatusSync.repairRaceStatusesForRows(rows);
  var now = Date.now();
  var summaries = rows.map(mapRaceSummary);
  var upcomingSummaries = summaries.filter(function (summary) {
    return (
      summary.scheduledStartAt &&
      new Date(summary.scheduledStartAt).getTime() >= now
    );
  });

  var checkedInCount = summaries.reduce(function (sum, summary) {
    return sum + summary.checkedInCount;
  }, 0);
  var pendingCheckInCount = summaries.reduce(function (sum, summary) {
    return sum + summary.pendingCheckInCount;
  }, 0);

  res.json(apiSuccess({
    role: "REFEREE",
    assignedRaceCount: rows.length,
    pendingCheckInCount: pendingCheckInCount,
    checkedInCount: checkedInCount,
    upcomingRaces: summaries.slice(0, 5),
    businessSummary: {
      upcomingRaceCount: upcomingSummaries.length,
    },
    alerts: refereeService.buildDashboardAlerts(summaries, now).slice(0, 10),
    upcoming: upcomingSummaries.slice(0, 5).map(function (summary) {
      return {
        id: summary.id,
        title: summary.name,
        at: summary.scheduledStartAt,
        status: summary.statusCode,
      };
    }),
  }));
}

async function getCheckedInCount(req, res) {
  var count = await refereeService.getCheckInCount(req.user.id, "CHECKED_IN");
  res.json(apiSuccess({ count: count }));
}

async function getPendingCheckInCount(req, res) {
  var count = await refereeService.getCheckInCount(req.user.id, "PENDING");
  res.json(apiSuccess({ count: count }));
}

async function listRaces(req, res) {
  var rows = await refereeService.getAssignedRaceRows(req.user.id);
  var tournamentsToSave = new Map();
  rows.forEach(function (row) {
    if (row.tournament && backfillResultFinalizedAt(row.tournament)) {
      tournamentsToSave.set(String(row.tournament._id), row.tournament);
    }
  });
  if (tournamentsToSave.size) {
    await Promise.all(
      Array.from(tournamentsToSave.values()).map(function (tournament) {
        return tournament.save();
      }),
    );
  }
  await tournamentStatusSync.repairRaceStatusesForRows(rows);
  res.json(apiSuccess(rows.map(mapRaceSummary)));
}

async function listPayments(req, res) {
  var rows = await refereeService.getAssignedRaceRows(req.user.id);
  res.json(apiSuccess(rows.map(function (row) {
    return {
      raceId: String(row.race._id),
      raceName: row.race.name,
      tournamentName: row.tournamentName,
      amount: Number(row.race.refereePaymentAmount || 0),
      status: row.race.refereePaymentStatus || "NONE",
    };
  })));
}

async function listParticipants(req, res) {
  var ctx = await findRaceContext(req.params.raceId);
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  if (!ctx.race.refereeId || String(ctx.race.refereeId) !== String(req.user.id)) {
    throw apiError("Bạn không được phân công cuộc đua này", 403);
  }
  res.json(apiSuccess(getApprovedParticipants(ctx.tournament, ctx.race._id).map(mapParticipant)));
}

async function updateParticipantGate(req, res) {
  var ctx = await findRaceContext(req.params.raceId);
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  var reg = ctx.tournament.registrations.id(req.params.participantId);
  if (!reg) throw apiError("Không tìm thấy người tham gia", 404);
  reg.gateNumber = Number(req.body.gateNumber);
  await ctx.tournament.save();
  res.json(apiSuccess(mapParticipant(reg), "Cập nhật cổng xuất phát thành công"));
}

async function checkInParticipant(req, res) {
  var ctx = await findRaceContext(req.params.raceId);
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  if (tm.toRaceStatusCode(ctx.race.status) !== "SCHEDULED") {
    throw apiError("Chỉ check-in được khi cuộc đua ở trạng thái Sắp diễn ra", 409);
  }
  var reg = ctx.tournament.registrations.id(req.params.participantId);
  if (!reg) throw apiError("Không tìm thấy người tham gia", 404);
  reg.checkInStatus = req.body.status === "ABSENT" ? "ABSENT" : "CHECKED_IN";
  reg.participantStatus = reg.checkInStatus === "ABSENT" ? "ABSENT" : "CHECKED_IN";
  if (req.body.note) reg.notes = req.body.note;
  await ctx.tournament.save();
  res.json(apiSuccess(mapParticipant(reg), "Check-in thành công"));
}

async function startRace(req, res) {
  var ctx = await findRaceContext(req.params.raceId);
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  if (!ctx.race.refereeId || String(ctx.race.refereeId) !== String(req.user.id)) {
    throw apiError("Bạn không được phân công cuộc đua này", 403);
  }
  if (ctx.tournament.status !== "Đang diễn ra") {
    throw apiError(
      "Giải đấu chưa được bắt đầu. Vui lòng chờ ban tổ chức chuyển giải sang trạng thái Đang diễn ra.",
      409,
    );
  }

  tournamentStatusSync.ensureRaceScheduledForStart(ctx.tournament, ctx.race);
  if (ctx.tournament.isModified()) {
    await ctx.tournament.save();
  }

  if (tm.toRaceStatusCode(ctx.race.status) !== "SCHEDULED") {
    throw apiError(
      "Chỉ có thể bắt đầu cuộc đua khi cuộc đua ở trạng thái Sắp diễn ra. Admin cần lên lịch giải trước.",
      409,
    );
  }
  try {
    assertRaceReadyToStart(ctx.tournament, ctx.race);
  } catch (err) {
    throw apiError(err.message || "Cuộc đua chưa sẵn sàng để bắt đầu", err.status || 400);
  }
  ctx.race.status = "Đang chạy";
  await ctx.tournament.save();
  res.json(apiSuccess(mapRaceSummary({
    tournament: ctx.tournament,
    race: ctx.race,
    tournamentId: String(ctx.tournament._id),
    tournamentName: ctx.tournament.name,
  }), "Bắt đầu cuộc đua"));
}

async function finalizeResults(req, res) {
  var ctx = await findRaceContext(req.params.raceId);
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
  if (!ctx.race.refereeId || String(ctx.race.refereeId) !== String(req.user.id)) {
    throw apiError("Bạn không được phân công cuộc đua này", 403);
  }
  if (!refereeService.RACE_STATUS_ONGOING_ALIASES[ctx.race.status]) {
    if (ctx.tournament.status === "Đang diễn ra") {
      if (tournamentStatusSync.repairRacesForOngoingTournament(ctx.tournament)) {
        await ctx.tournament.save();
      }
      tournamentStatusSync.ensureRaceScheduledForStart(ctx.tournament, ctx.race);
      if (tm.toRaceStatusCode(ctx.race.status) === "SCHEDULED") {
        try {
          assertRaceReadyToStart(ctx.tournament, ctx.race);
          ctx.race.status = "Đang chạy";
        } catch (err) {
          throw apiError(err.message || "Cuộc đua chưa sẵn sàng để chốt kết quả", err.status || 400);
        }
      }
    }
    if (!refereeService.RACE_STATUS_ONGOING_ALIASES[ctx.race.status]) {
      throw apiError("Only ongoing races can be finalized", 409);
    }
  }

  var entries = Array.isArray(req.body.results) ? req.body.results : [];
  if (!entries.length) {
    throw apiError("Thiếu kết quả cuộc đua", 400);
  }

  var raceId = String(ctx.race._id);
  var savedResults = [];

  entries.forEach(function (item, index) {
    var participantId = String(item.participantId || "").trim();
    if (!participantId) {
      throw apiError("Thiếu mã ngựa tham gia", 400);
    }

    var reg = ctx.tournament.registrations.id(participantId);
    if (!reg || String(reg.raceId) !== raceId) {
      throw apiError("Không tìm thấy ngựa tham gia trong cuộc đua", 400);
    }

    var isDisqualified = String(item.status || "").toUpperCase() === "DISQUALIFIED";
    var rank = isDisqualified ? 0 : Number(item.rank || index + 1);
    var finishMs = Number(item.finishTimeMillis || 0);

    reg.participantStatus = isDisqualified ? "DISQUALIFIED" : "FINISHED";
    if (!isDisqualified) {
      reg.status = "Hoàn thành";
    }
    if (item.note) {
      reg.notes = item.note;
    }

    savedResults.push({
      position: isDisqualified ? 0 : rank,
      horseName: reg.horseName || "—",
      participantId: reg._id,
      jockeyId: reg.jockeyId || null,
      jockeyName: reg.jockeyName || "",
      time: finishMs > 0 ? String(finishMs) : "—",
      points: 0,
      notes: item.note || "",
    });
  });

  savedResults.sort(function (first, second) {
    if (!first.position) return 1;
    if (!second.position) return -1;
    return first.position - second.position;
  });

  ctx.race.results = savedResults;
  ctx.race.status = "Hoàn thành";
  ctx.race.resultFinalizedAt = new Date();

  if (
    ctx.race.refereePaymentStatus === "HELD" &&
    Number(ctx.race.refereePaymentAmount || 0) > 0
  ) {
    await payReferee(ctx.race.refereeId, ctx.race.refereePaymentAmount, {
      referenceType: "RACE",
      referenceId: raceId,
      description: "Thù lao trọng tài - " + (ctx.race.name || ""),
    });
    ctx.race.refereePaymentStatus = "PAID";
  }

  await ctx.tournament.save();

  res.json(
    apiSuccess(
      savedResults.map(function (row) {
        return {
          participantId: String(row.participantId),
          horseName: row.horseName,
          jockeyUsername: row.jockeyName,
          rank: row.position || null,
          finishTimeMillis: row.time && row.time !== "—" ? Number(row.time) : 0,
          status: row.position ? "FINISHED" : "DISQUALIFIED",
          prizeAmount: prizeAmountForRank(ctx.race, row.position),
          note: row.notes || "",
        };
      }),
      "Chốt kết quả thành công",
    ),
  );
}

async function listInvitations(req, res) {
  var rows = await RefereeInvitation.find({ refereeId: req.user.id })
    .sort({ createdAt: -1 })
    .exec();
  res.json(apiSuccess(rows.map(mapInvitation)));
}

async function acceptInvitation(req, res) {
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
}

async function rejectInvitation(req, res) {
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
}

async function createViolation(req, res) {
  try {
    var ctx = await refereeService.assertOwnRace(req.params.raceId, req.user.id);
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
}

async function listRaceViolations(req, res) {
  await refereeService.assertOwnRace(req.params.raceId, req.user.id);
  var rows = await Violation.find({ raceId: req.params.raceId })
    .sort({ createdAt: -1 })
    .exec();
  res.json(apiSuccess(rows.map(mapViolation)));
}

async function listMyViolations(req, res) {
  var rows = await Violation.find({ refereeId: req.user.id })
    .sort({ createdAt: -1 })
    .exec();
  res.json(apiSuccess(rows.map(mapViolation)));
}

async function updateViolation(req, res) {
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
}

module.exports = {
  getDashboard: getDashboard,
  getCheckedInCount: getCheckedInCount,
  getPendingCheckInCount: getPendingCheckInCount,
  listRaces: listRaces,
  listPayments: listPayments,
  listParticipants: listParticipants,
  updateParticipantGate: updateParticipantGate,
  checkInParticipant: checkInParticipant,
  startRace: startRace,
  finalizeResults: finalizeResults,
  listInvitations: listInvitations,
  acceptInvitation: acceptInvitation,
  rejectInvitation: rejectInvitation,
  createViolation: createViolation,
  listRaceViolations: listRaceViolations,
  listMyViolations: listMyViolations,
  updateViolation: updateViolation,
};
