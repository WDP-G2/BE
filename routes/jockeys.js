var express = require("express");
var router = express.Router();
var User = require("../models/user");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");

function mapJockey(user) {
  return {
    id: String(user._id),
    userId: String(user._id),
    username: user.username || "",
    fullName: user.fullName || user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    role: user.role,
    active: user.active !== false,
    avatarUrl: user.avatarUrl || "",
    location: user.location || "",
  };
}

router.get(
  "/available",
  asyncHandler(async function (req, res) {
    var jockeys = await User.find({ role: "JOCKEY", active: { $ne: false } })
      .sort({ fullName: 1, username: 1 })
      .exec();
    res.json(apiSuccess(jockeys.map(mapJockey)));
  }),
);

router.get(
  "/:id",
  asyncHandler(async function (req, res) {
    var jockey = await User.findOne({ _id: req.params.id, role: "JOCKEY" }).exec();
    if (!jockey) {
      throw apiError("Không tìm thấy kỵ sĩ", 404);
    }
    res.json(apiSuccess(mapJockey(jockey)));
  }),
);

module.exports = router;
