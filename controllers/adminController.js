var api = require("../utils/apiResponse");
var service = require("../services/adminService");

async function payoutDebts(req, res, next) {
  try {
    return api.ok(res, await service.payoutDebts());
  } catch (err) {
    next(err);
  }
}

async function auditLogs(req, res, next) {
  try {
    return api.ok(res, await service.auditLogs(req.query || {}));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  auditLogs: auditLogs,
  payoutDebts: payoutDebts,
};
