var Tournament = require("../models/tournament");
var { executeOperation, requirePositiveInteger, asInteger } = require("./walletLedger");
var { apiError } = require("../utils/apiResponse");
var featureFlags = require("./financialFeatureFlags");

function nonNegativeInteger(value, label) {
  var amount = asInteger(value, label);
  if (amount < 0) throw apiError(label + " không được âm", 400);
  return amount;
}

async function getContext(registrationId) {
  var tournament = await Tournament.findOne({ "registrations._id": registrationId }).exec();
  if (!tournament) throw apiError("Không tìm thấy đăng ký", 404);
  var registration = tournament.registrations.id(registrationId);
  var race = registration && registration.raceId ? tournament.races.id(registration.raceId) : null;
  if (!registration || !race) throw apiError("Đăng ký không gắn với cuộc đua hợp lệ", 409);
  return { tournament: tournament, registration: registration, race: race };
}

async function approve(input) {
  featureFlags.assertEnabled("REGISTRATION");
  if (!String(input.idempotencyKey || "").trim()) throw apiError("Thiếu Idempotency-Key", 400);
  var ctx = await getContext(input.registrationId);
  if (ctx.registration.status === "Đã duyệt" && ctx.registration.paymentStatus === "CHARGED") return ctx;
  if (ctx.registration.status !== "Chờ duyệt") throw apiError("Chỉ đăng ký chờ duyệt mới được duyệt", 409);
  if (!ctx.registration.ownerId) throw apiError("Đăng ký thiếu chủ ngựa", 409);

  var entryFee = nonNegativeInteger(ctx.race.entryFee, "Phí đăng ký");
  var deposit = nonNegativeInteger(ctx.race.deposit, "Tiền cọc");
  var total = entryFee + deposit;
  if (total <= 0) {
    // Keep one zero-value operation out of the ledger; status update is still conditional.
    var noCharge = await Tournament.findOneAndUpdate(
      { _id: ctx.tournament._id, registrations: { $elemMatch: { _id: ctx.registration._id, status: "Chờ duyệt" } } },
      { $set: {
        "registrations.$.status": "Đã duyệt",
        "registrations.$.entryFeeAmount": 0,
        "registrations.$.depositAmount": 0,
        "registrations.$.paymentStatus": "CHARGED",
        "registrations.$.depositStatus": "NONE",
        "registrations.$.reviewNote": input.note || "",
        "registrations.$.reviewedBy": input.adminId,
        "registrations.$.reviewedAt": new Date(),
      } },
      { new: true },
    ).exec();
    if (!noCharge) throw apiError("Đăng ký đã được xử lý", 409);
    return { tournament: noCharge, registration: noCharge.registrations.id(input.registrationId), race: noCharge.races.id(ctx.race._id) };
  }

  var postings = [{
    ownerType: "USER",
    userId: ctx.registration.ownerId,
    transactionType: "ENTRY_FEE",
    availableDelta: -total,
    holdDelta: deposit,
    description: "Thu phí đăng ký và giữ tiền cọc",
  }];
  if (entryFee > 0) postings.push({ ownerType: "SYSTEM", transactionType: "ENTRY_FEE", availableDelta: entryFee, holdDelta: 0, description: "Thu phí đăng ký cuộc đua" });

  var result = await executeOperation({
    idempotencyKey: "registration:approve:" + ctx.registration._id,
    type: "REGISTRATION_APPROVE",
    referenceType: "REGISTRATION",
    referenceId: String(ctx.registration._id),
    actorId: input.adminId,
    metadata: { requestKey: String(input.idempotencyKey || ""), entryFeeAmount: entryFee, depositAmount: deposit },
    postings: postings,
    mutateDomain: async function (session, operation) {
      var updated = await Tournament.findOneAndUpdate(
        { _id: ctx.tournament._id, registrations: { $elemMatch: { _id: ctx.registration._id, status: "Chờ duyệt", paymentStatus: { $in: ["UNCHARGED", null] } } } },
        { $set: {
          "registrations.$.status": "Đã duyệt",
          "registrations.$.entryFeeAmount": entryFee,
          "registrations.$.depositAmount": deposit,
          "registrations.$.paymentStatus": "CHARGED",
          "registrations.$.depositStatus": deposit > 0 ? "HELD" : "NONE",
          "registrations.$.paymentOperationId": operation._id,
          "registrations.$.reviewNote": input.note || "",
          "registrations.$.reviewedBy": input.adminId,
          "registrations.$.reviewedAt": new Date(),
        } },
        { new: true, session: session },
      ).exec();
      if (!updated) throw apiError("Đăng ký đã được xử lý", 409);
    },
  });

  var tournament = await Tournament.findOne({ "registrations.paymentOperationId": result.operation._id }).exec();
  return { tournament: tournament, registration: tournament.registrations.id(input.registrationId), race: tournament.races.id(ctx.race._id) };
}

async function reject(input) {
  var ctx = await getContext(input.registrationId);
  if (ctx.registration.status === "Từ chối") return ctx;
  if (ctx.registration.status !== "Chờ duyệt" || ctx.registration.paymentStatus === "CHARGED") {
    throw apiError("Không thể từ chối đăng ký đã thu tiền", 409);
  }
  var tournament = await Tournament.findOneAndUpdate(
    { _id: ctx.tournament._id, registrations: { $elemMatch: { _id: ctx.registration._id, status: "Chờ duyệt", paymentStatus: { $ne: "CHARGED" } } } },
    { $set: { "registrations.$.status": "Từ chối", "registrations.$.reviewNote": input.note || "Không đạt điều kiện duyệt", "registrations.$.reviewedBy": input.adminId, "registrations.$.reviewedAt": new Date() } },
    { new: true },
  ).exec();
  if (!tournament) throw apiError("Đăng ký đã được xử lý", 409);
  return { tournament: tournament, registration: tournament.registrations.id(input.registrationId), race: tournament.races.id(ctx.race._id) };
}

module.exports = { approve: approve, reject: reject, getContext: getContext };
