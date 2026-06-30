var api = require("../utils/apiResponse");
var service = require("../services/refereeService");

function wrap(fn) {
  return async function (req, res, next) {
    try { await fn(req, res); } catch (err) { next(err); }
  };
}

module.exports = {
  createInvitation: wrap(async function (req, res) {
    return api.ok(res, await service.createInvitation(req, req.body || {}), "Invitation created");
  }),
  adminInvitations: wrap(async function (req, res) {
    return api.ok(res, await service.listInvitations({}));
  }),
  getInvitation: wrap(async function (req, res) {
    var item = await service.getInvitation(req.params.id);
    return item ? api.ok(res, item) : api.fail(res, 404, "Invitation not found");
  }),
  cancelInvitation: wrap(async function (req, res) {
    var item = await service.cancelInvitation(req, req.params.id);
    return item ? api.ok(res, item, "Invitation cancelled") : api.fail(res, 404, "Invitation not found");
  }),
  refereeInvitations: wrap(async function (req, res) {
    var user = await service.currentUser(req);
    return api.ok(res, await service.listInvitations({ refereeId: user._id }));
  }),
  acceptInvitation: wrap(async function (req, res) {
    var item = await service.acceptInvitation(req, req.params.id, req.body || {});
    return item ? api.ok(res, item, "Invitation accepted") : api.fail(res, 404, "Invitation not found");
  }),
  rejectInvitation: wrap(async function (req, res) {
    var item = await service.rejectInvitation(req, req.params.id, req.body || {});
    return item ? api.ok(res, item, "Invitation rejected") : api.fail(res, 404, "Invitation not found");
  }),
  createSalaryConfig: wrap(async function (req, res) {
    return api.ok(res, await service.createSalaryConfig(req, req.body || {}), "Salary config created");
  }),
  salaryConfigs: wrap(async function (req, res) {
    return api.ok(res, await service.listSalaryConfigs());
  }),
  getSalaryConfig: wrap(async function (req, res) {
    var item = await service.getSalaryConfig(req.params.id);
    return item ? api.ok(res, item) : api.fail(res, 404, "Salary config not found");
  }),
  updateSalaryConfig: wrap(async function (req, res) {
    var item = await service.updateSalaryConfig(req, req.params.id, req.body || {});
    return item ? api.ok(res, item, "Salary config updated") : api.fail(res, 404, "Salary config not found");
  }),
  deleteSalaryConfig: wrap(async function (req, res) {
    await service.deleteSalaryConfig(req, req.params.id);
    return api.ok(res, null, "Salary config deleted");
  }),
  racePayment: wrap(async function (req, res) {
    var item = await service.getRacePayment(req.params.id);
    return item ? api.ok(res, item) : api.fail(res, 404, "Referee payment not found");
  }),
  refereePayments: wrap(async function (req, res) {
    var user = await service.currentUser(req);
    return api.ok(res, await service.refereePayments(user._id));
  }),
};
