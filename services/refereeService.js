var Tournament = require("../models/tournament");
var User = require("../models/user");
var RefereeSalaryConfig = require("../models/refereeSalaryConfig");
var RefereeInvitation = require("../models/refereeInvitation");
var RefereeRacePayment = require("../models/refereeRacePayment");
var authService = require("./authService");
var walletService = require("./walletService");
var adminService = require("./adminService");

var PAYMENT_REFERENCE_TYPE = "REFEREE_RACE_PAYMENT";

async function currentUser(req) {
  var user = await authService.currentUser(req);
  if (!user || !user._id) {
    var err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return user;
}

function bad(message, status) {
  var err = new Error(message);
  err.status = status || 400;
  return err;
}

function amount(value) {
  var parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw bad("Salary amount must be greater than zero");
  return Math.round(parsed * 100) / 100;
}

async function findRace(raceId) {
  var tournament = await Tournament.findOne({ "races._id": raceId }).exec();
  if (!tournament) return null;
  return { tournament: tournament, race: tournament.races.id(raceId) };
}

async function userName(id) {
  var user = await User.findById(id).exec();
  return user ? user.username || user.fullName || user.email : "";
}

function mapSalaryConfig(config) {
  if (!config) return null;
  return {
    id: String(config._id),
    name: config.name,
    raceType: config.raceType,
    amount: config.amount,
    active: config.active !== false,
    createdBy: config.createdBy ? String(config.createdBy) : null,
    updatedBy: config.updatedBy ? String(config.updatedBy) : null,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

async function createSalaryConfig(req, payload) {
  var admin = await currentUser(req);
  if (!payload.name || !payload.raceType) throw bad("Salary config name and race type are required");
  var exists = await RefereeSalaryConfig.findOne({ name: new RegExp("^" + escapeRegExp(payload.name.trim()) + "$", "i") }).exec();
  if (exists) throw bad("Referee salary config name already exists", 409);
  var config = await RefereeSalaryConfig.create({
    name: payload.name.trim(),
    raceType: payload.raceType.trim(),
    amount: amount(payload.amount),
    active: payload.active !== false,
    createdBy: admin._id,
    updatedBy: admin._id,
  });
  await adminService.recordAudit(
    admin,
    "REFEREE_SALARY_CONFIG_CREATED",
    "REFEREE_SALARY_CONFIG",
    config._id,
    "Referee salary config created",
    config.amount,
    { name: config.name, raceType: config.raceType },
  );
  return mapSalaryConfig(config);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function listSalaryConfigs() {
  return (await RefereeSalaryConfig.find({}).sort({ createdAt: -1 }).exec()).map(mapSalaryConfig);
}

async function getSalaryConfig(id) {
  return mapSalaryConfig(await RefereeSalaryConfig.findById(id).exec());
}

async function updateSalaryConfig(req, id, payload) {
  var admin = await currentUser(req);
  var config = await RefereeSalaryConfig.findById(id).exec();
  if (!config) return null;
  if (!payload.name || !payload.raceType) throw bad("Salary config name and race type are required");
  var exists = await RefereeSalaryConfig.findOne({ name: new RegExp("^" + escapeRegExp(payload.name.trim()) + "$", "i") }).exec();
  if (exists && String(exists._id) !== String(id)) throw bad("Referee salary config name already exists", 409);
  config.name = payload.name.trim();
  config.raceType = payload.raceType.trim();
  config.amount = amount(payload.amount);
  config.active = payload.active !== false;
  config.updatedBy = admin._id;
  await config.save();
  await adminService.recordAudit(
    admin,
    "REFEREE_SALARY_CONFIG_UPDATED",
    "REFEREE_SALARY_CONFIG",
    config._id,
    "Referee salary config updated",
    config.amount,
    { name: config.name, raceType: config.raceType, active: config.active },
  );
  return mapSalaryConfig(config);
}

async function deleteSalaryConfig(req, id) {
  var admin = await currentUser(req);
  if (await RefereeRacePayment.exists({ salaryConfigId: id }).exec()) {
    throw bad("Referee salary config is already in use; deactivate it instead of deleting it");
  }
  var config = await RefereeSalaryConfig.findById(id).exec();
  await RefereeSalaryConfig.findByIdAndDelete(id).exec();
  if (config) {
    await adminService.recordAudit(
      admin,
      "REFEREE_SALARY_CONFIG_DELETED",
      "REFEREE_SALARY_CONFIG",
      id,
      "Referee salary config deleted",
      config.amount,
      { name: config.name, raceType: config.raceType },
    );
  }
}

async function reservePayment(adminId, raceInfo, refereeId, salaryConfig) {
  var existing = await RefereeRacePayment.findOne({ raceId: raceInfo.race._id }).exec();
  if (existing) return existing;
  var baseKey = "referee-race-payment:" + raceInfo.race._id;
  await walletService.holdAdmin(
    salaryConfig.amount,
    "ADJUSTMENT",
    PAYMENT_REFERENCE_TYPE,
    String(raceInfo.race._id),
    baseKey + ":admin-hold",
    JSON.stringify({ raceId: raceInfo.race._id, refereeId: refereeId }),
    "Referee salary reserved for race",
  );
  var payment = await RefereeRacePayment.create({
    tournamentId: raceInfo.tournament._id,
    raceId: raceInfo.race._id,
    refereeId: refereeId,
    salaryConfigId: salaryConfig._id,
    amount: salaryConfig.amount,
    status: "HELD",
    holdIdempotencyKey: baseKey + ":admin-hold",
    captureIdempotencyKey: baseKey + ":admin-capture",
    creditIdempotencyKey: baseKey + ":referee-credit",
    heldAt: new Date(),
  });
  await adminService.recordAudit(
    { _id: adminId },
    "REFEREE_SALARY_HELD",
    PAYMENT_REFERENCE_TYPE,
    raceInfo.race._id,
    "Referee salary reserved",
    salaryConfig.amount,
    { raceId: String(raceInfo.race._id), refereeId: String(refereeId) },
  );
  return payment;
}

async function mapInvitation(invitation) {
  if (!invitation) return null;
  var raceInfo = await findRace(invitation.raceId);
  var config = await RefereeSalaryConfig.findById(invitation.salaryConfigId).exec();
  return {
    id: String(invitation._id),
    adminId: String(invitation.adminId),
    adminUsername: await userName(invitation.adminId),
    refereeId: String(invitation.refereeId),
    refereeUsername: await userName(invitation.refereeId),
    raceId: String(invitation.raceId),
    raceName: raceInfo && raceInfo.race ? raceInfo.race.name : "",
    raceScheduledStartAt: raceInfo && raceInfo.race ? raceInfo.race.scheduledAt : null,
    raceScheduledEndAt: null,
    tournamentId: String(invitation.tournamentId),
    tournamentName: raceInfo && raceInfo.tournament ? raceInfo.tournament.name : "",
    salaryConfigId: String(invitation.salaryConfigId),
    salaryConfigName: config ? config.name : "",
    raceType: config ? config.raceType : "",
    salaryAmount: config ? config.amount : 0,
    status: invitation.status,
    message: invitation.message || "",
    responseNote: invitation.responseNote || "",
    respondedAt: invitation.respondedAt || null,
    cancelledAt: invitation.cancelledAt || null,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
}

async function createInvitation(req, payload) {
  var admin = await currentUser(req);
  var raceInfo = await findRace(payload.raceId);
  if (!raceInfo) throw bad("Race not found", 404);
  if (raceInfo.race.refereeId) throw bad("Race already has an assigned referee");
  var referee = await User.findById(payload.refereeId).exec();
  if (!referee) throw bad("Referee not found", 404);
  if (referee.role !== "REFEREE") throw bad("Invitation recipient must have REFEREE role");
  var config = await RefereeSalaryConfig.findById(payload.salaryConfigId).exec();
  if (!config) throw bad("Referee salary config not found", 404);
  if (config.active === false) throw bad("Referee salary config is inactive");
  var pending = await RefereeInvitation.findOne({ raceId: payload.raceId, refereeId: payload.refereeId, status: "PENDING" }).exec();
  if (pending) throw bad("A pending invitation already exists for this referee and race");
  return mapInvitation(await RefereeInvitation.create({
    adminId: admin._id,
    refereeId: referee._id,
    tournamentId: raceInfo.tournament._id,
    raceId: raceInfo.race._id,
    salaryConfigId: config._id,
    status: "PENDING",
    message: payload.message || "",
    createdBy: admin.username || admin.email,
    updatedBy: admin.username || admin.email,
  }));
}

async function listInvitations(filter) {
  var items = await RefereeInvitation.find(filter || {}).sort({ createdAt: -1 }).exec();
  var result = [];
  for (var i = 0; i < items.length; i += 1) result.push(await mapInvitation(items[i]));
  return result;
}

async function getInvitation(id) {
  return mapInvitation(await RefereeInvitation.findById(id).exec());
}

async function cancelInvitation(req, id) {
  var admin = await currentUser(req);
  var item = await RefereeInvitation.findById(id).exec();
  if (!item) return null;
  if (item.status !== "PENDING") throw bad("Only pending invitations can be updated");
  item.status = "CANCELLED";
  item.responseNote = "Invitation cancelled by admin";
  item.cancelledAt = new Date();
  item.updatedBy = admin.username || admin.email;
  await item.save();
  return mapInvitation(item);
}

async function acceptInvitation(req, id, payload) {
  var referee = await currentUser(req);
  var item = await RefereeInvitation.findById(id).exec();
  if (!item) return null;
  if (String(item.refereeId) !== String(referee._id)) throw bad("Cannot access another referee's invitation", 403);
  if (item.status !== "PENDING") throw bad("Only pending invitations can be updated");
  var raceInfo = await findRace(item.raceId);
  if (!raceInfo) throw bad("Race not found", 404);
  if (raceInfo.race.refereeId) throw bad("Race already has an assigned referee");
  var config = await RefereeSalaryConfig.findById(item.salaryConfigId).exec();
  await reservePayment(item.adminId, raceInfo, referee._id, config);
  raceInfo.race.refereeId = referee._id;
  await raceInfo.tournament.save();
  item.status = "ACCEPTED";
  item.responseNote = payload.note || "";
  item.respondedAt = new Date();
  item.updatedBy = referee.username || referee.email;
  await item.save();
  await RefereeInvitation.updateMany(
    { raceId: item.raceId, _id: { $ne: item._id }, status: "PENDING" },
    { $set: { status: "CANCELLED", responseNote: "Another referee accepted this race invitation", cancelledAt: new Date() } },
  ).exec();
  return mapInvitation(item);
}

async function rejectInvitation(req, id, payload) {
  var referee = await currentUser(req);
  var item = await RefereeInvitation.findById(id).exec();
  if (!item) return null;
  if (String(item.refereeId) !== String(referee._id)) throw bad("Cannot access another referee's invitation", 403);
  if (item.status !== "PENDING") throw bad("Only pending invitations can be updated");
  item.status = "REJECTED";
  item.responseNote = payload.note || "";
  item.respondedAt = new Date();
  item.updatedBy = referee.username || referee.email;
  await item.save();
  return mapInvitation(item);
}

async function mapPayment(payment) {
  if (!payment) return null;
  var raceInfo = await findRace(payment.raceId);
  var config = await RefereeSalaryConfig.findById(payment.salaryConfigId).exec();
  return {
    id: String(payment._id),
    raceId: String(payment.raceId),
    raceName: raceInfo && raceInfo.race ? raceInfo.race.name : "",
    tournamentId: String(payment.tournamentId),
    tournamentName: raceInfo && raceInfo.tournament ? raceInfo.tournament.name : "",
    refereeId: String(payment.refereeId),
    refereeUsername: await userName(payment.refereeId),
    salaryConfigId: String(payment.salaryConfigId),
    salaryConfigName: config ? config.name : "",
    raceType: config ? config.raceType : "",
    amount: payment.amount,
    status: payment.status,
    heldAt: payment.heldAt,
    paidAt: payment.paidAt || null,
    releasedAt: payment.releasedAt || null,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

async function getRacePayment(raceId) {
  return mapPayment(await RefereeRacePayment.findOne({ raceId: raceId }).exec());
}

async function refereePayments(refereeId) {
  var items = await RefereeRacePayment.find({ refereeId: refereeId }).sort({ createdAt: -1 }).exec();
  var result = [];
  for (var i = 0; i < items.length; i += 1) result.push(await mapPayment(items[i]));
  return result;
}

async function payForCompletedRace(raceId) {
  var payment = await RefereeRacePayment.findOne({ raceId: raceId }).exec();
  if (!payment || payment.status === "PAID") return payment;
  if (payment.status !== "HELD") throw bad("Referee salary is not available for payment");
  await walletService.captureAdmin(
    payment.amount,
    "ADJUSTMENT",
    PAYMENT_REFERENCE_TYPE,
    String(payment.raceId),
    payment.captureIdempotencyKey,
    JSON.stringify({ raceId: payment.raceId, refereeId: payment.refereeId }),
    "Referee salary paid for completed race",
  );
  await walletService.credit(
    payment.refereeId,
    payment.amount,
    "ADJUSTMENT",
    PAYMENT_REFERENCE_TYPE,
    String(payment.raceId),
    payment.creditIdempotencyKey,
    JSON.stringify({ raceId: payment.raceId, refereeId: payment.refereeId }),
    "Referee salary received for completed race",
  );
  payment.status = "PAID";
  payment.paidAt = new Date();
  await payment.save();
  return payment;
}

async function releaseForCancelledRace(adminId, raceId) {
  var payment = await RefereeRacePayment.findOne({ raceId: raceId }).exec();
  if (!payment || payment.status !== "HELD") return payment;
  await walletService.releaseAdmin(
    payment.amount,
    "ADJUSTMENT",
    PAYMENT_REFERENCE_TYPE,
    String(payment.raceId),
    payment.holdIdempotencyKey + ":release",
    JSON.stringify({ raceId: payment.raceId, refereeId: payment.refereeId }),
    "Referee salary released after race cancellation",
  );
  payment.status = "RELEASED";
  payment.releasedAt = new Date();
  await payment.save();
  await adminService.recordAudit(
    { _id: adminId || payment.refereeId },
    "REFEREE_SALARY_RELEASED",
    PAYMENT_REFERENCE_TYPE,
    payment.raceId,
    "Referee salary released after race cancellation",
    payment.amount,
    { raceId: String(payment.raceId), refereeId: String(payment.refereeId) },
  );
  return payment;
}

module.exports = {
  acceptInvitation: acceptInvitation,
  cancelInvitation: cancelInvitation,
  createInvitation: createInvitation,
  createSalaryConfig: createSalaryConfig,
  currentUser: currentUser,
  deleteSalaryConfig: deleteSalaryConfig,
  getInvitation: getInvitation,
  getRacePayment: getRacePayment,
  getSalaryConfig: getSalaryConfig,
  listInvitations: listInvitations,
  listSalaryConfigs: listSalaryConfigs,
  payForCompletedRace: payForCompletedRace,
  refereePayments: refereePayments,
  rejectInvitation: rejectInvitation,
  releaseForCancelledRace: releaseForCancelledRace,
  updateSalaryConfig: updateSalaryConfig,
};
