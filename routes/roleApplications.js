var express = require("express");
var router = express.Router();
var RoleApplication = require("../models/roleApplication");
var { authenticate } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");

router.use(authenticate);

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

router.get(
  "/me",
  asyncHandler(async function (req, res) {
    var apps = await RoleApplication.find({ userId: req.user.id }).sort({ createdAt: -1 }).exec();
    res.json(apiSuccess(apps.map(mapApplication)));
  }),
);

router.post(
  "/owner",
  asyncHandler(async function (req, res) {
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
  }),
);

router.post(
  "/jockey",
  asyncHandler(async function (req, res) {
    var app = await RoleApplication.create({
      userId: req.user.id,
      role: "JOCKEY",
      status: "PENDING",
      fullName: req.body.fullName || req.user.fullName,
      phone: req.body.phone || "",
      profileData: req.body,
    });
    res.status(201).json(apiSuccess(mapApplication(app), "Nộp hồ sơ kỵ sĩ thành công"));
  }),
);

router.post(
  "/spectator",
  asyncHandler(async function (req, res) {
    var app = await RoleApplication.create({
      userId: req.user.id,
      role: "SPECTATOR",
      status: "PENDING",
      fullName: req.body.fullName || req.user.fullName,
      phone: req.body.phone || "",
      profileData: req.body,
    });
    res.status(201).json(apiSuccess(mapApplication(app), "Nộp hồ sơ khán giả thành công"));
  }),
);

module.exports = router;
