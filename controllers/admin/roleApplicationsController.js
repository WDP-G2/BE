var RoleApplication = require("../../models/roleApplication");
var User = require("../../models/user");
var { apiSuccess, apiError } = require("../../utils/apiResponse");

function mapApplication(app) {
  return Object.assign({}, app.profileData || {}, {
    id: String(app._id),
    profileId: String(app._id),
    userId: String(app.userId),
    role: app.role,
    status: app.status,
    fullName: app.fullName,
    phone: app.phone,
    note: app.note,
    profileData: app.profileData || {},
    rejectReason: app.rejectReason || "",
    reviewedAt: app.reviewedAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  });
}

async function list(req, res) {
  var filter = {};
  if (req.query.role) filter.role = String(req.query.role).toUpperCase();
  if (req.query.status) filter.status = String(req.query.status).toUpperCase();

  var apps = await RoleApplication.find(filter).sort({ createdAt: -1 }).exec();
  res.json(apiSuccess(apps.map(mapApplication)));
}

async function approve(req, res) {
  var app = await RoleApplication.findById(req.params.id).exec();
  if (!app) throw apiError("Không tìm thấy hồ sơ", 404);

  app.status = "APPROVED";
  app.reviewedBy = req.user.id;
  app.reviewedAt = new Date();
  await app.save();

  await User.findByIdAndUpdate(app.userId, {
    $set: {
      role: app.role,
      pendingRole: null,
      roleApprovalStatus: "APPROVED",
      roleReviewReason: "",
      roleReviewedBy: req.user.id,
      roleReviewedAt: new Date(),
    },
  }).exec();
  res.json(apiSuccess(mapApplication(app), "Duyệt hồ sơ thành công"));
}

async function reject(req, res) {
  var app = await RoleApplication.findById(req.params.id).exec();
  if (!app) throw apiError("Không tìm thấy hồ sơ", 404);

  app.status = "REJECTED";
  app.rejectReason = req.body.reason || req.body.note || "";
  app.reviewedBy = req.user.id;
  app.reviewedAt = new Date();
  await app.save();

  await User.findByIdAndUpdate(app.userId, {
    $set: {
      roleApprovalStatus: "REJECTED",
      roleReviewReason: app.rejectReason,
      roleReviewedBy: req.user.id,
      roleReviewedAt: new Date(),
    },
  }).exec();

  res.json(apiSuccess(mapApplication(app), "Từ chối hồ sơ thành công"));
}

module.exports = {
  list: list,
  approve: approve,
  reject: reject,
};
