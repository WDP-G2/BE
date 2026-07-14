var express = require("express");
var router = express.Router();
var multer = require("multer");
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var refereeController = require("../controllers/refereeController");

var evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.use(authenticate, requireRole("REFEREE"));

router.get("/dashboard", asyncHandler(refereeController.getDashboard));
router.get("/dashboard/checked-in-count", asyncHandler(refereeController.getCheckedInCount));
router.get("/dashboard/pending-check-in-count", asyncHandler(refereeController.getPendingCheckInCount));
router.get("/races", asyncHandler(refereeController.listRaces));
router.get("/payments", asyncHandler(refereeController.listPayments));
router.get("/races/:raceId/participants", asyncHandler(refereeController.listParticipants));
router.put(
  "/races/:raceId/participants/:participantId/gate",
  asyncHandler(refereeController.updateParticipantGate),
);
router.put(
  "/races/:raceId/participants/:participantId/check-in",
  asyncHandler(refereeController.checkInParticipant),
);
router.put("/races/:raceId/start", asyncHandler(refereeController.startRace));
router.post("/races/:raceId/simulation", asyncHandler(refereeController.generateSimulation));
router.post(
  "/races/:raceId/simulation/confirm",
  asyncHandler(refereeController.confirmSimulation),
);
router.post("/races/:raceId/results/finalize", asyncHandler(refereeController.finalizeResults));
router.get("/invitations", asyncHandler(refereeController.listInvitations));
router.put("/invitations/:id/accept", asyncHandler(refereeController.acceptInvitation));
router.put("/invitations/:id/reject", asyncHandler(refereeController.rejectInvitation));
router.post(
  "/races/:raceId/violations",
  evidenceUpload.single("evidence"),
  asyncHandler(refereeController.createViolation),
);
router.get("/races/:raceId/violations", asyncHandler(refereeController.listRaceViolations));
router.get("/violations", asyncHandler(refereeController.listMyViolations));
router.put(
  "/violations/:id",
  evidenceUpload.single("evidence"),
  asyncHandler(refereeController.updateViolation),
);

module.exports = router;
