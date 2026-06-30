var express = require("express");
var multer = require("multer");
var controller = require("../../controllers/tournamentController");

var router = express.Router();
var upload = multer({ storage: multer.memoryStorage() });

router.post("/admin/tournament-banners", upload.any(), controller.uploadBanner);
router.put("/admin/tournaments/:id/banner", upload.any(), controller.uploadBanner);
router.post("/admin/tournaments", controller.create);
router.put("/admin/tournaments/:id", controller.update);
router.delete("/admin/tournaments/:id", controller.remove);
router.post("/admin/tournaments/:id/races", controller.createRace);
router.put("/admin/races/:raceId", controller.updateRace);
router.delete("/admin/races/:raceId", controller.deleteRace);
router.put("/admin/tournaments/:id/races", controller.replaceRaces);
router.put("/admin/tournaments/:id/status", controller.updateStatus);
router.put("/admin/tournaments/:id/open-registration", controller.openRegistration);
router.put("/admin/tournaments/:id/close-registration", controller.closeRegistration);
router.put("/admin/tournaments/:id/finalize", controller.finalize);
router.get("/admin/tournaments", controller.list);
router.get("/admin/tournaments/:id", controller.get);
router.get("/admin/tournaments/:id/statistics", controller.statistics);
router.get("/admin/tournaments/:id/payouts", controller.payouts);
router.get("/admin/tournaments/:id/venues", controller.venues);
router.get("/tournaments", controller.list);
router.get("/tournaments/:id", controller.get);
router.get("/tournaments/:id/races", controller.races);
router.get("/tournaments/:id/leaderboard", controller.leaderboard);

module.exports = router;
