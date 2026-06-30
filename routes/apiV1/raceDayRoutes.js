var express = require("express");
var multer = require("multer");
var controller = require("../../controllers/raceDayController");
var refereeController = require("../../controllers/refereeController");
var dashboardController = require("../../controllers/dashboardController");

var router = express.Router();
var upload = multer({ storage: multer.memoryStorage() });

router.post("/races/:id/registrations", controller.register);
router.get("/owner/race-registrations", controller.ownerRegistrations);
router.put("/owner/race-registrations/:id/withdraw", controller.withdraw);
router.get("/admin/tournaments/:id/race-registrations", controller.adminRegistrations);
router.put("/admin/race-registrations/:id/approve", controller.approve);
router.put("/admin/race-registrations/:id/reject", controller.reject);
router.put("/admin/tournaments/:id/schedule", controller.schedule);
router.put("/admin/races/:id/cancel", controller.cancel);
router.get("/admin/races/:id/participants", controller.participants);
router.get("/admin/races/:id/referee-payment", refereeController.racePayment);

router.get("/referee/races", dashboardController.refereeRaces);
router.get("/referee/races/today", dashboardController.refereeTodayRaces);
router.get("/referee/payments", refereeController.refereePayments);
router.get("/referee/races/:id/participants", controller.participants);
router.put("/referee/races/:id/participants/:participantId/gate", controller.gate);
router.put("/referee/races/:id/participants/:participantId/check-in", controller.checkIn);
router.put("/referee/races/:id/start", controller.start);
router.post("/referee/races/:id/results/finalize", controller.finalize);

router.get("/races/:id/results", controller.results);
router.post("/races/:id/complaints", upload.any(), controller.complaint);
router.get("/owner/race-complaints", controller.ownerComplaints);
router.get("/admin/race-complaints", controller.adminComplaints);
router.put("/admin/race-complaints/:id/resolve", controller.resolveComplaint);
router.put("/admin/tournaments/:id/jockey-challenge/finalize", controller.finalizeJockeyChallenge);
router.get("/tournaments/:id/jockey-challenge", controller.getJockeyChallenge);

module.exports = router;
