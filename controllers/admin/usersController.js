var User = require("../../models/user");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var { toPublicUser } = require("../../utils/userMapper");

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

async function getById(req, res) {
  var user = await User.findById(req.params.id).exec();
  if (!user) throw apiError("Không tìm thấy người dùng", 404);
  res.json(apiSuccess(toPublicUser(user)));
}

async function activate(req, res) {
  var user = await User.findByIdAndUpdate(req.params.id, { $set: { active: true } }, { new: true }).exec();
  if (!user) throw apiError("Không tìm thấy người dùng", 404);
  res.json(apiSuccess(toPublicUser(user), "Kích hoạt tài khoản thành công"));
}

async function deactivate(req, res) {
  var user = await User.findByIdAndUpdate(req.params.id, { $set: { active: false } }, { new: true }).exec();
  if (!user) throw apiError("Không tìm thấy người dùng", 404);
  res.json(apiSuccess(toPublicUser(user), "Vô hiệu hóa tài khoản thành công"));
}

async function updateRole(req, res) {
  var role = String(req.body.role || "").toUpperCase();
  if (!role) throw apiError("Thiếu role", 400);
  var user = await User.findByIdAndUpdate(req.params.id, { $set: { role: role } }, { new: true }).exec();
  if (!user) throw apiError("Không tìm thấy người dùng", 404);
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
