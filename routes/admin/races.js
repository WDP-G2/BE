var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var racesController = require("../../controllers/admin/racesController");

router.use(authenticate, requireRole("ADMIN"));

router.get("/tournaments/:id/race-registrations", asyncHandler(racesController.listTournamentRegistrations));
router.put("/race-registrations/:id/approve", asyncHandler(racesController.approveRegistration));
router.put("/race-registrations/:id/reject", asyncHandler(racesController.rejectRegistration));
router.put("/races/:raceId/cancel", asyncHandler(racesController.cancelRace));
router.get("/races/:raceId/participants", asyncHandler(racesController.listParticipants));
router.put("/races/:raceId/referee", asyncHandler(racesController.assignReferee));
router.post("/races/:raceId/referee-invitations", asyncHandler(racesController.createRefereeInvitation));
router.get("/races/:raceId/referee-invitations", asyncHandler(racesController.listRefereeInvitations));
router.put("/referee-invitations/:id/cancel", asyncHandler(racesController.cancelRefereeInvitation));
router.post("/races/:raceId/bet-market", asyncHandler(racesController.createBetMarket));
router.put("/races/:raceId", asyncHandler(racesController.updateRace));
router.delete("/races/:raceId", asyncHandler(racesController.deleteRace));
router.get("/races/:raceId/referee-payment", asyncHandler(racesController.getRefereePayment));

module.exports = router;
