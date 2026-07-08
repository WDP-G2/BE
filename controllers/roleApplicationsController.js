var RoleApplication = require("../models/roleApplication");
var { apiSuccess } = require("../utils/apiResponse");
var { uploadBufferToCloudinary } = require("../utils/cloudinaryUpload");

var ROLE_APPLICATION_FOLDER = "horse-racing/role-applications";

function mapApplication(app) {
  return {
    id: String(app._id),
    userId: String(app.userId),
    role: app.role,
    status: app.status,
    fullName: app.fullName,
    phone: app.phone,
    note: app.note,
    profileData: app.profileData || {},
    createdAt: app.createdAt,
  };
}

async function uploadFieldFile(files, fieldName) {
  var file = files && files[fieldName] && files[fieldName][0];
  if (!file) return "";
  var uploaded = await uploadBufferToCloudinary(file, ROLE_APPLICATION_FOLDER);
  return uploaded ? uploaded.secure_url || uploaded.url || "" : "";
}

async function listMine(req, res) {
  var apps = await RoleApplication.find({ userId: req.user.id }).sort({ createdAt: -1 }).exec();
  res.json(apiSuccess(apps.map(mapApplication)));
}

async function applyOwner(req, res) {
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
  res.status(201).json(apiSuccess(mapApplication(app), "Nộp hồ sơ chủ ngựa thành công"));
}

async function applyJockey(req, res) {
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
  res.status(201).json(apiSuccess(mapApplication(app), "Nộp hồ sơ kỵ sĩ thành công"));
}

async function applyReferee(req, res) {
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
  res.status(201).json(apiSuccess(mapApplication(app), "Nộp hồ sơ trọng tài thành công"));
}

async function applySpectator(req, res) {
  var app = await RoleApplication.create({
    userId: req.user.id,
    role: "SPECTATOR",
    status: "PENDING",
    fullName: req.body.fullName || req.user.fullName,
    phone: req.body.phone || "",
    profileData: req.body,
  });
  res.status(201).json(apiSuccess(mapApplication(app), "Nộp hồ sơ khán giả thành công"));
}

module.exports = {
  listMine: listMine,
  applyOwner: applyOwner,
  applyJockey: applyJockey,
  applyReferee: applyReferee,
  applySpectator: applySpectator,
};
