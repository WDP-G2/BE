var express = require("express");
var router = express.Router();
var Tournament = require("../../models/tournament");
var User = require("../../models/user");
var Horse = require("../../models/horse");
var { BetMarket, Bet } = require("../../models/betting");
var { WalletTransaction } = require("../../models/wallet");
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var { apiSuccess } = require("../../utils/apiResponse");

router.use(authenticate, requireRole("ADMIN"));

router.get(
  "/summary",
  asyncHandler(async function (req, res) {
    var tournaments = await Tournament.find({}).exec();
    var raceCount = 0;
    var registrationCount = 0;
    var revenue = 0;

    tournaments.forEach(function (t) {
      raceCount += (t.races || []).length;
      registrationCount += (t.registrations || []).length;
      (t.registrations || []).forEach(function (reg) {
        if (reg.status === "Đã duyệt" || reg.status === "Hoàn thành") {
          revenue += Number(t.config?.entryFee || 0);
        }
      });
    });

    var activeUsers = await User.countDocuments({ active: { $ne: false } }).exec();

    res.json(
      apiSuccess({
        tournamentCount: tournaments.length,
        raceCount: raceCount,
        registrationCount: registrationCount,
        revenue: revenue,
        tournament: { value: tournaments.length, delta: "+0%" },
        race: { value: raceCount, delta: "+0%" },
        activeUser: { value: activeUsers, delta: "+0%" },
        revenueMetric: { value: revenue, delta: "+0%" },
      }),
    );
  }),
);

router.get(
  "/tournament-registrations",
  asyncHandler(async function (req, res) {
    var tournaments = await Tournament.find({}).sort({ updatedAt: -1 }).exec();
    var rows = [];

    tournaments.forEach(function (tournament) {
      var pending = (tournament.registrations || []).filter(function (r) {
        return r.status === "Chờ duyệt";
      }).length;
      rows.push({
        tournamentId: String(tournament._id),
        tournamentName: tournament.name,
        status: tournament.status,
        totalRegistrations: (tournament.registrations || []).length,
        pendingRegistrations: pending,
        raceCount: (tournament.races || []).length,
      });
    });

    res.json(apiSuccess(rows));
  }),
);

router.get(
  "/revenue",
  asyncHandler(async function (req, res) {
    var months = Math.max(1, Math.min(12, Number(req.query.months || 6)));
    var txs = await WalletTransaction.find({ type: { $in: ["DEPOSIT", "FEE"] } })
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();

    var now = new Date();
    var rows = [];
    for (var i = months - 1; i >= 0; i -= 1) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var label = "T" + (d.getMonth() + 1);
      var total = txs
        .filter(function (tx) {
          var created = new Date(tx.createdAt);
          return created.getFullYear() === d.getFullYear() && created.getMonth() === d.getMonth();
        })
        .reduce(function (sum, tx) {
          return sum + Math.abs(Number(tx.amount || 0));
        }, 0);
      rows.push({ month: label, value: total });
    }

    res.json(apiSuccess(rows));
  }),
);

router.get(
  "/top-horses",
  asyncHandler(async function (req, res) {
    var limit = Math.max(1, Math.min(20, Number(req.query.limit || 4)));
    var horses = await Horse.find({ approvalStatus: "APPROVED" })
      .sort({ wins: -1, races: -1 })
      .limit(limit)
      .exec();

    res.json(
      apiSuccess(
        horses.map(function (horse) {
          return {
            id: String(horse._id),
            name: horse.name,
            wins: horse.wins || 0,
            races: horse.races || 0,
          };
        }),
      ),
    );
  }),
);

module.exports = router;
