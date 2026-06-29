var express = require("express");
var router = express.Router();
var RoleApplication = require("../../models/roleApplication");
var User = require("../../models/user");
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var { toPublicUser } = require("../../utils/userMapper");

router.use(authenticate, requireRole("ADMIN"));

function mapApplication(app) {
  return {
    id: String(app._id),
    profileId: String(app._id),
    userId: String(app.userId),
    role: app.role,
    status: app.status,
    fullName: app.fullName,
    phone: app.phone,
    note: app.note,
    profileData: app.profileData || {},
    licenseNumber: app.profileData?.licenseNumber || "",
    specialty: app.profileData?.specialty || "",
    experienceYears: app.profileData?.experienceYears || 0,
    rejectReason: app.rejectReason || "",
    reviewedAt: app.reviewedAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

router.get(
  "/",
  asyncHandler(async function (req, res) {
    var filter = {};
    if (req.query.role) filter.role = String(req.query.role).toUpperCase();
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();

    var apps = await RoleApplication.find(filter).sort({ createdAt: -1 }).exec();
    res.json(apiSuccess(apps.map(mapApplication)));
  }),
);

router.put(
  "/:id/approve",
  asyncHandler(async function (req, res) {
    var app = await RoleApplication.findById(req.params.id).exec();
    if (!app) throw apiError("Không tìm thấy hồ sơ", 404);

    app.status = "APPROVED";
    app.reviewedBy = req.user.id;
    app.reviewedAt = new Date();
    await app.save();

    await User.findByIdAndUpdate(app.userId, { $set: { role: app.role } }).exec();
    res.json(apiSuccess(mapApplication(app), "Duyệt hồ sơ thành công"));
  }),
);

router.put(
  "/:id/reject",
  asyncHandler(async function (req, res) {
    var app = await RoleApplication.findById(req.params.id).exec();
    if (!app) throw apiError("Không tìm thấy hồ sơ", 404);

    app.status = "REJECTED";
    app.rejectReason = req.body.reason || req.body.note || "";
    app.reviewedBy = req.user.id;
    app.reviewedAt = new Date();
    await app.save();

    res.json(apiSuccess(mapApplication(app), "Từ chối hồ sơ thành công"));
  }),
);

module.exports = router;
