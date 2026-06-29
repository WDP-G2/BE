var express = require("express");
var router = express.Router();
var Tournament = require("../models/tournament");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");

router.get(
  "/:id/leaderboard",
  asyncHandler(async function (req, res) {
    var tournament = await Tournament.findById(req.params.id).exec();
    if (!tournament) throw apiError("Không tìm thấy giải đấu", 404);

    var pointsByHorse = {};
    (tournament.races || []).forEach(function (race) {
      (race.results || []).forEach(function (result) {
        var key = result.horseName;
        if (!key) return;
        if (!pointsByHorse[key]) {
          pointsByHorse[key] = {
            horseName: key,
            jockeyName: result.jockeyName || "",
            totalPoints: 0,
            wins: 0,
          };
        }
        pointsByHorse[key].totalPoints += Number(result.points || 0);
        if (Number(result.position) === 1) pointsByHorse[key].wins += 1;
      });
    });

    var rows = Object.values(pointsByHorse).sort(function (a, b) {
      return b.totalPoints - a.totalPoints || b.wins - a.wins;
    });

    res.json(apiSuccess(rows));
  }),
);

module.exports = router;
