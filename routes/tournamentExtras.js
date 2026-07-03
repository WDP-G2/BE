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

    var entries = [];
    (tournament.races || []).forEach(function (race) {
      var prizeByRank = {};
      (Array.isArray(race.prizes) ? race.prizes : []).forEach(function (prize) {
        prizeByRank[Number(prize.rank)] = Number(prize.amount || 0);
      });

      (race.results || []).forEach(function (result) {
        entries.push({
          id: String(result._id),
          raceId: String(race._id),
          participantId: result.jockeyId ? String(result.jockeyId) : String(result._id),
          raceRank: result.position,
          horseName: result.horseName,
          raceName: race.name,
          jockeyUsername: result.jockeyName || "",
          prizeAmount: prizeByRank[Number(result.position)] || 0,
        });
      });
    });

    entries.sort(function (a, b) {
      return (a.raceRank || 0) - (b.raceRank || 0) || b.prizeAmount - a.prizeAmount;
    });

    res.json(apiSuccess({ entries: entries }));
  }),
);

module.exports = router;
