var User = require("../../models/user");
var RefereeInvitation = require("../../models/refereeInvitation");
var RefereeSalaryConfig = require("../../models/refereeSalaryConfig");
var {
  findRaceContext,
} = require("../../services/tournamentRaceService");
var { mapInvitation } = require("../../utils/refereeInvitationMapper");
var { apiSuccess, apiError } = require("../../utils/apiResponse");

function isObjectId(value) {
  return Boolean(value && String(value).match(/^[a-fA-F0-9]{24}$/));
}

async function enrichInvitation(invitation) {
  var mapped = mapInvitation(invitation);
  var salaryAmount = null;
  var salaryConfigName = null;

  if (invitation.salaryConfigId) {
    var config = await RefereeSalaryConfig.findById(invitation.salaryConfigId).exec();
    if (config) {
      salaryAmount = Number(config.amount || 0);
      salaryConfigName = config.name || "";
    }
  }

  var raceScheduledStartAt = null;
  if (invitation.raceDate) {
    raceScheduledStartAt = invitation.raceTime
      ? invitation.raceDate + "T" + invitation.raceTime + ":00"
      : invitation.raceDate;
  }

  return Object.assign({}, mapped, {
    refereeUsername: invitation.refereeName || mapped.refereeName || "",
    raceScheduledStartAt: raceScheduledStartAt,
    raceScheduledEndAt: null,
    venueId: null,
    venueName: invitation.tournamentLocation || "",
    venueAddress: invitation.tournamentLocation || "",
    salaryConfigName: salaryConfigName,
    salaryAmount: salaryAmount,
    raceType: "Chung",
  });
}

async function createInvitation(req, res) {
  var raceId = req.body.raceId;
  var refereeId = req.body.refereeId;
  var salaryConfigId = req.body.salaryConfigId;
  var message = String(req.body.message || "").trim();

  if (!isObjectId(raceId)) throw apiError("Cuộc đua không hợp lệ", 400);
  if (!isObjectId(refereeId)) throw apiError("Trọng tài không hợp lệ", 400);

  var ctx = await findRaceContext(raceId);
  if (!ctx) throw apiError("Không tìm thấy cuộc đua", 404);

  var referee = await User.findById(refereeId).exec();
  if (!referee || referee.role !== "REFEREE") {
    throw apiError("Trọng tài không hợp lệ", 400);
  }
  if (referee.active === false) {
    throw apiError("Tài khoản trọng tài đã bị khóa", 400);
  }

  if (salaryConfigId && !isObjectId(salaryConfigId)) {
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
    return res.json(
      apiSuccess(await enrichInvitation(existing), "Lời mời đang chờ phản hồi"),
    );
  }

  var invitation = await RefereeInvitation.create({
    raceId: ctx.race._id,
    tournamentId: ctx.tournament._id,
    tournamentName: ctx.tournament.name,
    tournamentLocation: ctx.tournament.location || "",
    raceName: ctx.race.name,
    raceDate: ctx.race.scheduledAt
      ? ctx.race.scheduledAt.toISOString().slice(0, 10)
      : "",
    raceTime: ctx.race.scheduledAt
      ? ctx.race.scheduledAt.toISOString().slice(11, 16)
      : "",
    refereeId: referee._id,
    refereeName: referee.fullName || referee.username || "",
    salaryConfigId: salaryConfigId || null,
    message: message,
    status: "Chờ xử lý",
  });

  res
    .status(201)
    .json(apiSuccess(await enrichInvitation(invitation), "Đã gửi lời mời trọng tài"));
}

async function listInvitations(req, res) {
  var rows = await RefereeInvitation.find({}).sort({ createdAt: -1 }).exec();
  var mapped = [];
  for (var i = 0; i < rows.length; i += 1) {
    mapped.push(await enrichInvitation(rows[i]));
  }
  res.json(apiSuccess(mapped));
}

async function getInvitation(req, res) {
  if (!isObjectId(req.params.id)) throw apiError("Không tìm thấy lời mời", 404);
  var invitation = await RefereeInvitation.findById(req.params.id).exec();
  if (!invitation) throw apiError("Không tìm thấy lời mời", 404);
  res.json(apiSuccess(await enrichInvitation(invitation)));
}

async function cancelInvitation(req, res) {
  if (!isObjectId(req.params.id)) throw apiError("Không tìm thấy lời mời", 404);
  var invitation = await RefereeInvitation.findById(req.params.id).exec();
  if (!invitation) throw apiError("Không tìm thấy lời mời", 404);
  if (invitation.status !== "Chờ xử lý") {
    throw apiError("Chỉ có thể hủy lời mời đang chờ xử lý", 400);
  }
  invitation.status = "Đã hủy";
  invitation.cancelledAt = new Date();
  await invitation.save();
  res.json(apiSuccess(await enrichInvitation(invitation), "Đã hủy lời mời"));
}

module.exports = {
  createInvitation: createInvitation,
  listInvitations: listInvitations,
  getInvitation: getInvitation,
  cancelInvitation: cancelInvitation,
};
