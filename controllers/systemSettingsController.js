var api = require("../utils/apiResponse");
var authService = require("../services/authService");
var service = require("../services/systemSettingsService");
var adminService = require("../services/adminService");

async function updatedBy(req) {
  var user = await authService.currentUser(req);
  return user ? user.username || user.email || "SYSTEM" : "SYSTEM";
}

async function publicBranding(req, res, next) {
  try {
    return api.ok(res, await service.getPublicBranding());
  } catch (err) {
    next(err);
  }
}

async function getSettings(req, res, next) {
  try {
    return api.ok(res, await service.getSettings());
  } catch (err) {
    next(err);
  }
}

function update(section) {
  return async function (req, res, next) {
    try {
      var user = await authService.currentUser(req);
      var data = await service.update(section, req.body || {}, user ? user.username || user.email || "SYSTEM" : "SYSTEM");
      await adminService.recordAudit(
        user,
        "SYSTEM_SETTINGS_UPDATED",
        "SYSTEM_SETTINGS",
        section,
        "System settings updated: " + section,
        null,
        req.body || {},
      );
      return api.ok(
        res,
        data,
        "System settings updated",
      );
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  getSettings: getSettings,
  publicBranding: publicBranding,
  update: update,
};
