var express = require("express");
var router = express.Router();
var Tournament = require("../models/tournament");
var { BetMarket, Bet } = require("../models/betting");
var { WalletTransaction } = require("../models/wallet");
var Notification = require("../models/notification");
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { apiSuccess, apiError } = require("../utils/apiResponse");
var { getUserWallet, mapWallet } = require("../services/walletLedger");

router.use(authenticate, requireRole("SPECTATOR"));

router.get(
  "/dashboard",
  asyncHandler(async function (req, res) {
    var wallet = await getUserWallet(req.user.id);
    var openTournaments = await Tournament.countDocuments({
      status: { $in: ["Đang mở đăng ký", "Đang diễn ra"] },
    }).exec();
    var openMarkets = await BetMarket.countDocuments({ status: "OPEN" }).exec();
    var myBets = await Bet.find({ userId: req.user.id }).exec();
    var totalStake = myBets.reduce(function (s, b) { return s + Number(b.stakeAmount || 0); }, 0);
    var totalPayout = myBets.reduce(function (s, b) { return s + Number(b.netProfitAmount || 0); }, 0);
    var betsByStatus = {};
    myBets.forEach(function (b) {
      betsByStatus[b.status] = (betsByStatus[b.status] || 0) + 1;
    });

    var txs = await WalletTransaction.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(5).exec();
    var notes = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(5).exec();

    res.json(apiSuccess({
      role: "SPECTATOR",
      account: { id: req.user.id, fullName: req.user.fullName, email: req.user.email },
      wallet: mapWallet(wallet),
      businessSummary: {
        openTournamentCount: openTournaments,
        openBetMarketCount: openMarkets,
        totalBetStake: totalStake,
        totalBetPayout: totalPayout,
        betsByStatus: betsByStatus,
        predictionEnabled: false,
        marketplaceEnabled: true,
      },
      alerts: [],
      upcoming: [],
      quickLinks: [
        { label: "Tournaments", route: "/spectator/tournaments", enabled: true },
        { label: "Betting", route: "/spectator/betting", enabled: true },
        { label: "Wallet", route: "/spectator/wallet", enabled: true },
        { label: "Notifications", route: "/spectator/notifications", enabled: true },
      ],
      recentTransactions: txs.map(function (tx) {
        return { type: tx.type, amount: tx.amount, createdAt: tx.createdAt, description: tx.description };
      }),
      recentNotifications: notes.map(function (n) {
        return { id: String(n._id), title: n.title, message: n.message, createdAt: n.createdAt };
      }),
    }));
  }),
);

module.exports = router;
