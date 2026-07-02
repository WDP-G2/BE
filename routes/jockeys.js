var express = require("express");
var router = express.Router();
var User = require("../models/user");
var RoleApplication = require("../models/roleApplication");
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var {
  buildJockeyPerformancePayload,
  buildProfileResponse,
} = require("../utils/jockeyProfile");

router.use(authenticate, requireRole("OWNER", "ADMIN"));

async function findLatestApprovedApplications() {
  var apps = await RoleApplication.find({ role: "JOCKEY", status: "APPROVED" })
    .sort({ createdAt: -1 })
    .exec();
  var latestByUser = {};
  apps.forEach(function (app) {
    var uid = String(app.userId);
    if (!latestByUser[uid]) latestByUser[uid] = app;
  });
  return latestByUser;
}

router.get(
  "/available",
  asyncHandler(async function (req, res) {
    var latestByUser = await findLatestApprovedApplications();
    var userIds = Object.keys(latestByUser);
    var users = await User.find({
      _id: { $in: userIds },
      role: "JOCKEY",
      active: { $ne: false },
    }).exec();

    var results = await Promise.all(
      users.map(async function (user) {
        var app = latestByUser[String(user._id)];
        var performancePayload = await buildJockeyPerformancePayload(user._id);
        return buildProfileResponse(app, user, performancePayload);
      }),
    );

    res.json(apiSuccess(results));
  }),
);

router.get(
  "/:id",
  asyncHandler(async function (req, res) {
    var user = await User.findOne({ _id: req.params.id, role: "JOCKEY" }).exec();
    if (!user) throw apiError("Không tìm thấy jockey", 404);

    var app = await RoleApplication.findOne({
      userId: user._id,
      role: "JOCKEY",
      status: "APPROVED",
    })
      .sort({ createdAt: -1 })
      .exec();
    if (!app) throw apiError("Jockey chưa có hồ sơ đã duyệt", 404);

    var performancePayload = await buildJockeyPerformancePayload(user._id);
    res.json(apiSuccess(buildProfileResponse(app, user, performancePayload)));
  }),
);

module.exports = router;
