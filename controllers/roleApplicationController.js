var api = require("../utils/apiResponse");
var service = require("../services/roleApplicationService");

function submit(role) {
  return async function (req, res, next) {
    try { return api.ok(res, await service.submit(req, role, req.body || {}), "Application submitted"); } catch (err) { next(err); }
  };
}
async function listAll(req, res, next) {
  try { return api.ok(res, await service.list({})); } catch (err) { next(err); }
}
async function listByRole(req, res, next) {
  try { return api.ok(res, await service.list({ role: String(req.params.role || "").toUpperCase() })); } catch (err) { next(err); }
}
async function listByStatus(req, res, next) {
  try { return api.ok(res, await service.list({ status: String(req.params.status || "").toUpperCase() })); } catch (err) { next(err); }
}
async function approve(req, res, next) {
  try {
    var item = await service.approve(req, req.params.profileId);
    return item ? api.ok(res, item, "Application approved") : api.fail(res, 404, "Application not found");
  } catch (err) { next(err); }
}
async function reject(req, res, next) {
  try {
    var item = await service.reject(req, req.params.profileId, req.body || {});
    return item ? api.ok(res, item, "Application rejected") : api.fail(res, 404, "Application not found");
  } catch (err) { next(err); }
}
async function kycOcr(req, res, next) {
  try { return api.ok(res, await service.kycOcr(req, req.body || {})); } catch (err) { next(err); }
}
async function faceMatch(req, res, next) {
  try { return api.ok(res, await service.faceMatch(req, req.params.kycVerificationId, req.body || {})); } catch (err) { next(err); }
}
async function mine(req, res, next) {
  try { return api.ok(res, await service.getMyApplication(req)); } catch (err) { next(err); }
}

module.exports = {
  approve: approve,
  faceMatch: faceMatch,
  kycOcr: kycOcr,
  listAll: listAll,
  listByRole: listByRole,
  listByStatus: listByStatus,
  mine: mine,
  reject: reject,
  submit: submit,
};
