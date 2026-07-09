var RoleApplication = require("../models/roleApplication");
var User = require("../models/user");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var { uploadBufferToCloudinary } = require("../utils/cloudinaryUpload");

var ROLE_APPLICATION_FOLDER = "horse-racing/role-applications";

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

function pickApplication(apps, role) {
  var list = apps || [];
  var filtered = role
    ? list.filter(function (app) {
        return app.role === role;
      })
    : list;
  if (!filtered.length) return null;

  var approved = filtered.find(function (app) {
    return app.status === "APPROVED";
  });
  if (approved) return approved;

  var pending = filtered.find(function (app) {
    return app.status === "PENDING";
  });
  if (pending) return pending;

  return filtered[0];
}

async function uploadFieldFile(files, fieldName) {
  var file = files && files[fieldName] && files[fieldName][0];
  if (!file) return "";
  var uploaded = await uploadBufferToCloudinary(file, ROLE_APPLICATION_FOLDER);
  return uploaded ? uploaded.secure_url || uploaded.url || "" : "";
}

async function markUserPendingApproval(userId, role) {
  await User.findByIdAndUpdate(userId, {
    $set: {
      pendingRole: role,
      roleApprovalStatus: "PENDING",
      roleReviewReason: "",
      roleReviewedBy: null,
      roleReviewedAt: null,
    },
  }).exec();
}

async function assertCanApply(userId, role) {
  var user = await User.findById(userId).exec();
  if (!user) throw apiError("Không tìm thấy người dùng", 404);
  if (user.active === false) {
    throw apiError("Tài khoản đã bị khóa", 403);
  }
  if (user.role && user.role !== "USER" && user.roleApprovalStatus === "APPROVED") {
    throw apiError("Tài khoản đã có vai trò được duyệt", 409);
  }
  if (user.roleApprovalStatus === "PENDING" && user.pendingRole && user.pendingRole !== role) {
    throw apiError("Bạn đang có yêu cầu vai trò khác chờ duyệt", 409);
  }

  var existingPending = await RoleApplication.findOne({
    userId: userId,
    role: role,
    status: "PENDING",
  }).exec();
  if (existingPending) {
    throw apiError("Hồ sơ vai trò này đang chờ quản trị viên duyệt", 409);
  }
}

async function listMine(req, res) {
  var filter = { userId: req.user.id };
  var role = req.query.role ? String(req.query.role).toUpperCase() : "";
  if (role) filter.role = role;

  var apps = await RoleApplication.find(filter).sort({ createdAt: -1 }).exec();
  var mapped = apps.map(mapApplication);

  if (role) {
    var selected = pickApplication(mapped, role);
    if (selected) {
      return res.json(apiSuccess(selected));
    }

    var user = await User.findById(req.user.id).exec();
    if (user && user.role === role) {
      return res.json(
        apiSuccess({
          role: user.role,
          status: user.roleApprovalStatus === "PENDING" ? "PENDING" : "APPROVED",
          fullName: user.fullName || user.name || user.username || "",
          phone: user.phone || "",
          address: user.location || "",
        }),
      );
    }

    return res.json(apiSuccess(null));
  }

  res.json(apiSuccess(mapped));
}

async function applyOwner(req, res) {
  await assertCanApply(req.user.id, "OWNER");
  var verificationDocumentUrl = await uploadFieldFile(req.files, "verificationDocument");

  var app = await RoleApplication.create({
    userId: req.user.id,
    role: "OWNER",
    status: "PENDING",
    fullName: req.body.fullName || req.user.fullName,
    phone: req.body.phone || "",
    note: req.body.note || "",
    profileData: Object.assign({}, req.body, {
      verificationDocumentUrl: verificationDocumentUrl,
    }),
  });
  await markUserPendingApproval(req.user.id, "OWNER");
  res.status(201).json(apiSuccess(mapApplication(app), "Đã gửi hồ sơ chủ ngựa — chờ quản trị viên duyệt"));
}

async function applyJockey(req, res) {
  await assertCanApply(req.user.id, "JOCKEY");
  var avatarUrl = await uploadFieldFile(req.files, "avatar");
  var licenseDocumentUrl = await uploadFieldFile(req.files, "licenseDocument");
  var achievementsUrl = await uploadFieldFile(req.files, "achievements");

  var app = await RoleApplication.create({
    userId: req.user.id,
    role: "JOCKEY",
    status: "PENDING",
    fullName: req.body.fullName || req.user.fullName,
    phone: req.body.phone || "",
    profileData: Object.assign({}, req.body, {
      avatarUrl: avatarUrl,
      licenseDocumentUrl: licenseDocumentUrl,
      achievements: achievementsUrl,
    }),
  });
  await markUserPendingApproval(req.user.id, "JOCKEY");
  res.status(201).json(apiSuccess(mapApplication(app), "Đã gửi hồ sơ kỵ sĩ — chờ quản trị viên duyệt"));
}

async function applyReferee(req, res) {
  await assertCanApply(req.user.id, "REFEREE");
  var certificationDocumentUrl = await uploadFieldFile(req.files, "certificationDocument");

  var app = await RoleApplication.create({
    userId: req.user.id,
    role: "REFEREE",
    status: "PENDING",
    fullName: req.body.fullName || req.user.fullName,
    phone: req.body.phone || "",
    profileData: Object.assign({}, req.body, {
      certificationDocumentUrl: certificationDocumentUrl,
    }),
  });
  await markUserPendingApproval(req.user.id, "REFEREE");
  res.status(201).json(apiSuccess(mapApplication(app), "Đã gửi hồ sơ trọng tài — chờ quản trị viên duyệt"));
}

async function applySpectator(req, res) {
  await assertCanApply(req.user.id, "SPECTATOR");
  var app = await RoleApplication.create({
    userId: req.user.id,
    role: "SPECTATOR",
    status: "PENDING",
    fullName: req.body.fullName || req.user.fullName,
    phone: req.body.phone || "",
    profileData: req.body,
  });
  await markUserPendingApproval(req.user.id, "SPECTATOR");
  res.status(201).json(apiSuccess(mapApplication(app), "Đã gửi hồ sơ khán giả — chờ quản trị viên duyệt"));
}

module.exports = {
  listMine: listMine,
  applyOwner: applyOwner,
  applyJockey: applyJockey,
  applyReferee: applyReferee,
  applySpectator: applySpectator,
};
