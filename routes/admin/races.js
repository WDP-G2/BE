var express = require("express");
var router = express.Router();
var Tournament = require("../../models/tournament");
var User = require("../../models/user");
var RefereeInvitation = require("../../models/refereeInvitation");
var { BetMarket } = require("../../models/betting");
var {
  findRaceContext,
  getApprovedParticipants,
  mapParticipant,
  mapRaceSummary,
  applyRefereeAssignment,
} = require("../../services/tournamentRaceService");
var { mapInvitation } = require("../../utils/refereeInvitationMapper");
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var tournamentsRouter = require("../tournaments");
var { mapTournament, applyRaceFieldsUpdate } = tournamentsRouter;

router.use(authenticate, requireRole("ADMIN"));

function mapRegistration(tournament, reg) {
  return {
    id: String(reg._id),
    tournamentId: String(tournament._id),
    tournamentName: tournament.name,
    raceId: reg.raceId ? String(reg.raceId) : null,
    ownerId: reg.ownerId ? String(reg.ownerId) : null,
    ownerName: reg.ownerName,
    horseId: reg.horseId ? String(reg.horseId) : null,
    horseName: reg.horseName,
    jockeyId: reg.jockeyId ? String(reg.jockeyId) : null,
    jockeyName: reg.jockeyName,
    status: reg.status,
    registeredAt: reg.registeredAt,
  };
}

router.get(
  "/tournaments/:id/race-registrations",
  asyncHandler(async function (req, res) {
    var tournament = await Tournament.findById(req.params.id).exec();
    if (!tournament) throw apiError("Không tìm thấy giải đấu", 404);
    res.json(apiSuccess((tournament.registrations || []).map(function (reg) {
      return mapRegistration(tournament, reg);
    })));
  }),
);

router.put(
  "/race-registrations/:id/approve",
  asyncHandler(async function (req, res) {
    var tournament = await Tournament.findOne({ "registrations._id": req.params.id }).exec();
    if (!tournament) throw apiError("Không tìm thấy đăng ký", 404);
    var reg = tournament.registrations.id(req.params.id);
    reg.status = "Đã duyệt";
    await tournament.save();
    res.json(apiSuccess(mapRegistration(tournament, reg), "Duyệt đăng ký thành công"));
  }),
);

router.put(
  "/race-registrations/:id/reject",
  asyncHandler(async function (req, res) {
    var tournament = await Tournament.findOne({ "registrations._id": req.params.id }).exec();
    if (!tournament) throw apiError("Không tìm thấy đăng ký", 404);
    var reg = tournament.registrations.id(req.params.id);
    reg.status = "Từ chối";
    if (req.body.note) reg.notes = req.body.note;
    await tournament.save();
    res.json(apiSuccess(mapRegistration(tournament, reg), "Từ chối đăng ký thành công"));
  }),
);

router.get(
  "/races/:raceId/participants",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);
    var rows = getApprovedParticipants(ctx.tournament, ctx.race._id).map(mapParticipant);
    res.json(apiSuccess(rows));
  }),
);

router.put(
  "/races/:raceId/referee",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);

    var refereeId = req.body.refereeId;
    var salaryConfigId = req.body.salaryConfigId;
    if (!refereeId || !String(refereeId).match(/^[a-fA-F0-9]{24}$/)) {
      throw apiError("Trọng tài không hợp lệ", 400);
    }
    var referee = await User.findById(refereeId).exec();
    if (!referee || referee.role !== "REFEREE") throw apiError("Trọng tài không hợp lệ", 400);

    if (salaryConfigId && !String(salaryConfigId).match(/^[a-fA-F0-9]{24}$/)) {
      throw apiError("Cấu hình lương trọng tài không hợp lệ", 400);
    }

    await applyRefereeAssignment(ctx.race, referee._id, salaryConfigId);
    await ctx.tournament.save();

    res.json(
      apiSuccess(
        Object.assign(mapRaceSummary({
          tournament: ctx.tournament,
          race: ctx.race,
          tournamentId: String(ctx.tournament._id),
          tournamentName: ctx.tournament.name,
        }), {
          refereeName: referee.fullName || referee.username,
        }),
        "Phân công trọng tài thành công",
      ),
    );
  }),
);

router.post(
  "/races/:raceId/referee-invitations",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);

    var refereeId = req.body.refereeId;
    var salaryConfigId = req.body.salaryConfigId;
    if (!refereeId || !String(refereeId).match(/^[a-fA-F0-9]{24}$/)) {
      throw apiError("Trọng tài không hợp lệ", 400);
    }
    var referee = await User.findById(refereeId).exec();
    if (!referee || referee.role !== "REFEREE") throw apiError("Trọng tài không hợp lệ", 400);

    if (salaryConfigId && !String(salaryConfigId).match(/^[a-fA-F0-9]{24}$/)) {
      throw apiError("Cấu hình lương trọng tài không hợp lệ", 400);
    }

    if (ctx.race.refereeId && String(ctx.race.refereeId) !== String(refereeId)) {
      throw apiError("Cuộc đua đã có trọng tài. Không thể mời trọng tài khác.", 409);
    }

    var existing = await RefereeInvitation.findOne({
      raceId: ctx.race._id,
      refereeId: refereeId,
      status: "Chờ xử lý",
    }).exec();
    if (existing) {
      return res.json(apiSuccess(mapInvitation(existing), "Lời mời đang chờ phản hồi"));
    }

    var invitation = await RefereeInvitation.create({
      raceId: ctx.race._id,
      tournamentId: ctx.tournament._id,
      tournamentName: ctx.tournament.name,
      tournamentLocation: ctx.tournament.location || "",
      raceName: ctx.race.name,
      raceDate: ctx.race.scheduledAt ? ctx.race.scheduledAt.toISOString().slice(0, 10) : "",
      raceTime: ctx.race.scheduledAt ? ctx.race.scheduledAt.toISOString().slice(11, 16) : "",
      refereeId: referee._id,
      refereeName: referee.fullName || referee.username || "",
      salaryConfigId: salaryConfigId || null,
      message: req.body.message || "",
      status: "Chờ xử lý",
    });

    res.status(201).json(apiSuccess(mapInvitation(invitation), "Đã gửi lời mời trọng tài"));
  }),
);

router.get(
  "/races/:raceId/referee-invitations",
  asyncHandler(async function (req, res) {
    var rows = await RefereeInvitation.find({ raceId: req.params.raceId })
      .sort({ createdAt: -1 })
      .exec();
    res.json(apiSuccess(rows.map(mapInvitation)));
  }),
);

router.put(
  "/referee-invitations/:id/cancel",
  asyncHandler(async function (req, res) {
    var invitation = await RefereeInvitation.findById(req.params.id).exec();
    if (!invitation) throw apiError("Không tìm thấy lời mời", 404);
    if (invitation.status !== "Chờ xử lý") {
      throw apiError("Chỉ có thể hủy lời mời đang chờ xử lý", 400);
    }
    invitation.status = "Đã hủy";
    invitation.cancelledAt = new Date();
    await invitation.save();
    res.json(apiSuccess(mapInvitation(invitation), "Đã hủy lời mời"));
  }),
);

router.post(
  "/races/:raceId/bet-market",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);

    var existing = await BetMarket.findOne({ raceId: ctx.race._id }).exec();
    if (existing) {
      return res.json(apiSuccess({ id: String(existing._id), raceId: String(existing.raceId), status: existing.status }, "Market đã tồn tại"));
    }

    var participants = getApprovedParticipants(ctx.tournament, ctx.race._id).map(mapParticipant);
    var market = await BetMarket.create({
      raceId: ctx.race._id,
      tournamentId: ctx.tournament._id,
      raceName: ctx.race.name,
      tournamentName: ctx.tournament.name,
      status: "DRAFT",
      minStake: Number(req.body.minStake || 10000),
      maxStake: Number(req.body.maxStake || 5000000),
      note: req.body.note || "",
      options: participants.map(function (p) {
        return {
          participantId: p.participantId,
          horseId: p.horseId,
          horseName: p.horseName,
          jockeyId: p.jockeyId,
          jockeyUsername: p.jockeyUsername,
          gateNumber: p.gateNumber,
          status: "ACTIVE",
        };
      }),
      createdBy: req.user.id,
    });

    res.status(201).json(apiSuccess({ id: String(market._id), raceId: String(market.raceId), status: market.status }, "Tạo bet market thành công"));
  }),
);

router.put(
  "/races/:raceId",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);

    await applyRaceFieldsUpdate(ctx.race, req.body);
    await ctx.tournament.save();

    res.json(apiSuccess(mapTournament(ctx.tournament)));
  }),
);

router.delete(
  "/races/:raceId",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);

    ctx.race.deleteOne();
    await ctx.tournament.save();

    res.json(apiSuccess(mapTournament(ctx.tournament)));
  }),
);

router.get(
  "/races/:raceId/referee-payment",
  asyncHandler(async function (req, res) {
    var ctx = await findRaceContext(req.params.raceId);
    if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);

    var referee = ctx.race.refereeId
      ? await User.findById(ctx.race.refereeId).exec()
      : null;

    res.json(
      apiSuccess({
        raceId: String(ctx.race._id),
        refereeId: ctx.race.refereeId ? String(ctx.race.refereeId) : null,
        refereeName: referee ? referee.fullName || referee.username : null,
        salaryConfigId: ctx.race.salaryConfigId ? String(ctx.race.salaryConfigId) : null,
        amount: Number(ctx.race.refereePaymentAmount || 0),
        status: ctx.race.refereePaymentStatus || "NONE",
      }),
    );
  }),
);

module.exports = router;
