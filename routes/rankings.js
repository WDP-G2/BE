var express = require("express");
var router = express.Router();
var Horse = require("../models/horse");
var User = require("../models/user");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess } = require("../utils/apiResponse");

router.get(
  "/",
  asyncHandler(async function (req, res) {
    var horses = await Horse.find({ approvalStatus: "APPROVED" })
      .sort({ wins: -1, races: -1 })
      .limit(50)
      .exec();
    var jockeys = await User.find({ role: "JOCKEY", active: { $ne: false } })
      .sort({ fullName: 1 })
      .limit(50)
      .exec();

    res.json(apiSuccess({
      horses: horses.map(function (h) {
        return { id: String(h._id), name: h.name, wins: h.wins || 0, races: h.races || 0 };
      }),
      jockeys: jockeys.map(function (j) {
        return { id: String(j._id), name: j.fullName || j.username, role: j.role };
      }),
    }));
  }),
);

module.exports = router;
