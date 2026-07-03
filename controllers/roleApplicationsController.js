var RoleApplication = require("../models/roleApplication");
var { apiSuccess } = require("../utils/apiResponse");

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

async function listMine(req, res) {
  var apps = await RoleApplication.find({ userId: req.user.id }).sort({ createdAt: -1 }).exec();
  res.json(apiSuccess(apps.map(mapApplication)));
}

async function applyOwner(req, res) {
  var app = await RoleApplication.create({
    userId: req.user.id,
    role: "OWNER",
    status: "PENDING",
    fullName: req.body.fullName || req.user.fullName,
    phone: req.body.phone || "",
    note: req.body.note || "",
    profileData: req.body,
  });
  res.status(201).json(apiSuccess(mapApplication(app), "Nộp hồ sơ chủ ngựa thành công"));
}

async function applyJockey(req, res) {
  var app = await RoleApplication.create({
    userId: req.user.id,
    role: "JOCKEY",
    status: "PENDING",
    fullName: req.body.fullName || req.user.fullName,
    phone: req.body.phone || "",
    profileData: req.body,
  });
  res.status(201).json(apiSuccess(mapApplication(app), "Nộp hồ sơ kỵ sĩ thành công"));
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
  applySpectator: applySpectator,
};
