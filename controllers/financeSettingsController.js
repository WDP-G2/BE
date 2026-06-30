var api = require("../utils/apiResponse");
var authService = require("../services/authService");
var service = require("../services/financeSettingsService");
var adminService = require("../services/adminService");

async function updatedBy(req) {
  var user = await authService.currentUser(req);
  return user ? user.username || user.email || "SYSTEM" : "SYSTEM";
}

async function getSettings(req, res, next) {
  try {
    return api.ok(res, await service.getSettings());
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    var user = await authService.currentUser(req);
    var data = await service.updateSettings(req.body || {}, user ? user.username || user.email || "SYSTEM" : "SYSTEM");
    await adminService.recordAudit(user, "FINANCE_SETTINGS_UPDATED", "FINANCE_SETTINGS", "singleton", "Finance settings updated", null, req.body || {});
    return api.ok(
      res,
      data,
      "Finance settings updated",
    );
  } catch (err) {
    next(err);
  }
}

async function getPrizeShares(req, res, next) {
  try {
    return api.ok(res, await service.getPrizeShares());
  } catch (err) {
    next(err);
  }
}

async function updatePrizeShares(req, res, next) {
  try {
    var user = await authService.currentUser(req);
    var data = await service.updatePrizeShares(req.body || {}, user ? user.username || user.email || "SYSTEM" : "SYSTEM");
    await adminService.recordAudit(user, "RACE_PRIZE_SHARES_UPDATED", "FINANCE_SETTINGS", "race-prize-shares", "Race prize shares updated", null, req.body || {});
    return api.ok(
      res,
      data,
      "Race prize shares updated",
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPrizeShares: getPrizeShares,
  getSettings: getSettings,
  updatePrizeShares: updatePrizeShares,
  updateSettings: updateSettings,
};
