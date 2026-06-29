var express = require("express");
var router = express.Router();
var User = require("../../models/user");
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var { toPublicUser } = require("../../utils/userMapper");

router.use(authenticate, requireRole("ADMIN"));

router.get(
  "/",
  asyncHandler(async function (req, res) {
    var users = await User.find({}).sort({ createdAt: -1 }).exec();
    res.json(apiSuccess(users.map(toPublicUser)));
  }),
);

router.get(
  "/active",
  asyncHandler(async function (req, res) {
    var users = await User.find({ active: { $ne: false } }).sort({ fullName: 1 }).exec();
    res.json(apiSuccess(users.map(toPublicUser)));
  }),
);

router.get(
  "/deactivated",
  asyncHandler(async function (req, res) {
    var users = await User.find({ active: false }).sort({ updatedAt: -1 }).exec();
    res.json(apiSuccess(users.map(toPublicUser)));
  }),
);

router.get(
  "/:id",
  asyncHandler(async function (req, res) {
    var user = await User.findById(req.params.id).exec();
    if (!user) throw apiError("Không tìm thấy người dùng", 404);
    res.json(apiSuccess(toPublicUser(user)));
  }),
);

router.put(
  "/:id/activate",
  asyncHandler(async function (req, res) {
    var user = await User.findByIdAndUpdate(req.params.id, { $set: { active: true } }, { new: true }).exec();
    if (!user) throw apiError("Không tìm thấy người dùng", 404);
    res.json(apiSuccess(toPublicUser(user), "Kích hoạt tài khoản thành công"));
  }),
);

router.put(
  "/:id/deactivate",
  asyncHandler(async function (req, res) {
    var user = await User.findByIdAndUpdate(req.params.id, { $set: { active: false } }, { new: true }).exec();
    if (!user) throw apiError("Không tìm thấy người dùng", 404);
    res.json(apiSuccess(toPublicUser(user), "Vô hiệu hóa tài khoản thành công"));
  }),
);

router.put(
  "/:id/role",
  asyncHandler(async function (req, res) {
    var role = String(req.body.role || "").toUpperCase();
    if (!role) throw apiError("Thiếu role", 400);
    var user = await User.findByIdAndUpdate(req.params.id, { $set: { role: role } }, { new: true }).exec();
    if (!user) throw apiError("Không tìm thấy người dùng", 404);
    res.json(apiSuccess(toPublicUser(user), "Cập nhật vai trò thành công"));
  }),
);

module.exports = router;
