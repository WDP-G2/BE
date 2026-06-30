var express = require("express");
var controller = require("../../controllers/dashboardController");

var router = express.Router();

router.get("/users/me/dashboard", controller.currentUserDashboard);
router.get("/owner/dashboard", controller.ownerDashboard);
router.get("/owner/races", controller.ownerRaces);
router.get("/owner/prizes", controller.ownerPrizes);
router.get("/jockey/dashboard", controller.jockeyDashboard);
router.get("/jockey/races", controller.jockeyRaces);
router.get("/jockey/performance", controller.jockeyPerformance);
router.get("/jockey/prizes", controller.jockeyPrizes);
router.get("/referee/dashboard", controller.refereeDashboard);
router.get("/referee/races", controller.refereeRaces);
router.get("/referee/races/today", controller.refereeTodayRaces);
router.get("/referee/dashboard/checked-in-count", controller.refereeCheckedInCount);
router.get("/referee/dashboard/pending-check-in-count", controller.refereePendingCheckInCount);
router.get("/spectator/dashboard", controller.spectatorDashboard);
router.get("/admin/dashboard", controller.adminDashboard);
router.get("/admin/races", controller.adminRaces);
router.get("/admin/dashboard/summary", controller.summary);
router.get("/admin/dashboard/revenue", controller.revenue);
router.get("/admin/dashboard/tournament-registrations", controller.tournamentRegistrations);
router.get("/admin/dashboard/top-horses", controller.topHorses);
router.get("/admin/dashboard/quick-insights", controller.quickInsights);
router.get("/admin/dashboard/tournament-race-counts", controller.tournamentRaceCounts);
router.get("/admin/dashboard/featured-tournaments", controller.featuredTournaments);

module.exports = router;
