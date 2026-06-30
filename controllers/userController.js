var authService = require("../services/authService");
var userService = require("../services/userService");
var adminService = require("../services/adminService");
var api = require("../utils/apiResponse");

async function record(req, action, userId, reason, metadata) {
  var admin = await authService.currentUser(req);
  await adminService.recordAudit(admin, action, "USER", userId, reason, null, metadata || {});
}

async function listAdminUsers(req, res, next) {
  try {
    return api.ok(res, await userService.listUsers({}));
  } catch (err) {
    next(err);
  }
}

async function listActiveUsers(req, res, next) {
  try {
    return api.ok(res, await userService.listUsers({ active: true }));
  } catch (err) {
    next(err);
  }
}

async function listDeactivatedUsers(req, res, next) {
  try {
    return api.ok(res, await userService.listUsers({ active: false }));
  } catch (err) {
    next(err);
  }
}

async function getAdminUser(req, res, next) {
  try {
    var user = await userService.getUser(req.params.id);
    return user ? api.ok(res, user) : api.fail(res, 404, "User not found");
  } catch (err) {
    next(err);
  }
}

async function deactivateUser(req, res, next) {
  try {
    var user = await userService.setActive(req.params.userId, false);
    await record(req, "USER_DEACTIVATED", req.params.userId, "User deactivated");
    return api.ok(
      res,
      user,
      "User deactivated",
    );
  } catch (err) {
    next(err);
  }
}

async function activateUser(req, res, next) {
  try {
    var user = await userService.setActive(req.params.userId, true);
    await record(req, "USER_ACTIVATED", req.params.userId, "User activated");
    return api.ok(
      res,
      user,
      "User activated",
    );
  } catch (err) {
    next(err);
  }
}

async function updateRole(req, res, next) {
  try {
    var user = await userService.setRole(req.params.userId, req.body.role);
    await record(req, "USER_ROLE_UPDATED", req.params.userId, "User role updated", { role: req.body.role });
    return api.ok(
      res,
      user,
      "Role updated",
    );
  } catch (err) {
    next(err);
  }
}

async function meProfile(req, res) {
  var user = await authService.currentUser(req);
  if (!user) return api.fail(res, 401, "Unauthorized");
  return api.ok(res, authService.publicUser(user));
}

async function updateMeProfile(req, res, next) {
  try {
    var user = await authService.currentUser(req);
    if (!user || !user._id) return api.fail(res, 401, "Unauthorized");
    return api.ok(
      res,
      await userService.updateProfile(user._id, req.body || {}),
      "Profile updated",
    );
  } catch (err) {
    next(err);
  }
}

async function listJockeys(req, res, next) {
  try {
    return api.ok(res, await userService.listUsers({ role: "JOCKEY" }));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  activateUser: activateUser,
  deactivateUser: deactivateUser,
  getAdminUser: getAdminUser,
  listActiveUsers: listActiveUsers,
  listAdminUsers: listAdminUsers,
  listDeactivatedUsers: listDeactivatedUsers,
  listJockeys: listJockeys,
  meProfile: meProfile,
  updateMeProfile: updateMeProfile,
  updateRole: updateRole,
};
