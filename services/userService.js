var User = require("../models/user");
var authService = require("./authService");

async function listUsers(filter) {
  var query = {};
  if (filter && filter.role) query.role = String(filter.role).toUpperCase();
  if (filter && filter.active === true) query.active = { $ne: false };
  if (filter && filter.active === false) query.active = false;

  var users = await User.find(query).sort({ createdAt: -1 }).exec();
  return users.map(authService.publicUser);
}

async function getUser(id) {
  var user = await User.findById(id).exec();
  return authService.publicUser(user);
}

async function setActive(id, active) {
  var user = await User.findByIdAndUpdate(
    id,
    { active: active, updatedAt: new Date() },
    { new: true },
  ).exec();
  return authService.publicUser(user);
}

async function setRole(id, role) {
  role = String(role || "USER").toUpperCase();
  var update = { role: role, updatedAt: new Date() };
  if (role === "USER") {
    update.pendingRole = null;
    update.roleApprovalStatus = "NONE";
    update.roleReviewReason = "";
    update.roleReviewedBy = null;
    update.roleReviewedAt = null;
  } else {
    update.pendingRole = role;
    update.roleApprovalStatus = "APPROVED";
    update.roleReviewReason = "";
  }
  var user = await User.findByIdAndUpdate(
    id,
    update,
    { new: true },
  ).exec();
  return authService.publicUser(user);
}

async function updateProfile(id, payload) {
  var allowed = {};
  ["name", "username", "fullName", "phone", "email", "avatarUrl", "location"].forEach(function (key) {
    if (payload[key] !== undefined) allowed[key] = payload[key];
  });
  allowed.updatedAt = new Date();

  var user = await User.findByIdAndUpdate(id, allowed, { new: true }).exec();
  return authService.publicUser(user);
}

module.exports = {
  getUser: getUser,
  listUsers: listUsers,
  setActive: setActive,
  setRole: setRole,
  updateProfile: updateProfile,
};
