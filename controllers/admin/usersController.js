var mongoose = require("mongoose");
var User = require("../../models/user");
var RoleApplication = require("../../models/roleApplication");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var { toPublicUser } = require("../../utils/userMapper");

async function upsertApprovedRoleApplication(user, adminId) {
  if (!user || !["JOCKEY", "OWNER", "REFEREE"].includes(user.role)) return;

  await RoleApplication.findOneAndUpdate(
    { userId: user._id, role: user.role },
    {
      $set: {
        status: "APPROVED",
        fullName: user.fullName || user.name || user.username || "",
        phone: user.phone || "",
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
      $setOnInsert: {
        userId: user._id,
        role: user.role,
        profileData: {},
      },
    },
    { upsert: true, new: true },
  ).exec();
}

async function list(req, res) {
  var users = await User.find({}).sort({ createdAt: -1 }).exec();
  res.json(apiSuccess(users.map(toPublicUser)));
}

async function listActive(req, res) {
  var users = await User.find({ active: { $ne: false } }).sort({ fullName: 1 }).exec();
  res.json(apiSuccess(users.map(toPublicUser)));
}

async function listDeactivated(req, res) {
  var users = await User.find({ active: false }).sort({ updatedAt: -1 }).exec();
  res.json(apiSuccess(users.map(toPublicUser)));
}

async function findUserOrThrow(id) {
  if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
    throw apiError("Không tìm thấy người dùng", 404);
  }
  var user = await User.findById(id).exec();
  if (!user) throw apiError("Không tìm thấy người dùng", 404);
  return user;
}

function assertCanToggleActive(user) {
  if (user.role === "ADMIN") {
    throw apiError("Không thể khóa tài khoản Admin", 400);
  }
}

async function getById(req, res) {
  var user = await findUserOrThrow(req.params.id);
  res.json(apiSuccess(toPublicUser(user)));
}

async function activate(req, res) {
  var user = await findUserOrThrow(req.params.id);
  user.active = true;
  await user.save();
  res.json(apiSuccess(toPublicUser(user), "Kích hoạt tài khoản thành công"));
}

async function deactivate(req, res) {
  var user = await findUserOrThrow(req.params.id);
  assertCanToggleActive(user);
  user.active = false;
  await user.save();
  res.json(apiSuccess(toPublicUser(user), "Vô hiệu hóa tài khoản thành công"));
}

async function updateRole(req, res) {
  var role = String(req.body.role || "").toUpperCase();
  if (!role) throw apiError("Thiếu role", 400);
  var user = await User.findByIdAndUpdate(req.params.id, { $set: { role: role } }, { new: true }).exec();
  if (!user) throw apiError("Không tìm thấy người dùng", 404);
  await upsertApprovedRoleApplication(user, req.user.id);
  res.json(apiSuccess(toPublicUser(user), "Cập nhật vai trò thành công"));
}

module.exports = {
  list: list,
  listActive: listActive,
  listDeactivated: listDeactivated,
  getById: getById,
  activate: activate,
  deactivate: deactivate,
  updateRole: updateRole,
};
