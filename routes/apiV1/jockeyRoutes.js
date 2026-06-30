var express = require("express");
var multer = require("multer");
var controller = require("../../controllers/jockeyController");

var router = express.Router();
var upload = multer({ storage: multer.memoryStorage() });

router.get("/jockey/profile", controller.getMyProfile);
router.put("/jockey/profile", upload.any(), controller.updateMyProfile);
router.get("/jockeys/available", controller.availableJockeys);
router.get("/jockeys/:id", controller.getApprovedJockeyProfile);
router.get("/admin/jockey-profiles", controller.adminJockeyProfiles);

router.post("/owner/jockey-invitations", controller.createInvitation);
router.get("/owner/jockey-invitations", controller.ownerInvitations);
router.get("/owner/jockey-invitations/:id", controller.ownerInvitation);
router.get("/owners/me/jockeys", controller.ownerAcceptedJockeys);
router.put("/owner/jockey-invitations/:id/cancel", controller.cancelInvitation);
router.get("/jockey/invitations", controller.jockeyInvitations);
router.get("/jockey/invitations/:id", controller.jockeyInvitation);
router.put("/jockey/invitations/:id/accept", controller.acceptInvitation);
router.put("/jockey/invitations/:id/reject", controller.rejectInvitation);

router.get("/owner/horse-teams/eligible", controller.eligibleHorseTeams);
router.get("/admin/tournaments/:id/eligible-horse-teams", controller.adminEligibleHorseTeams);
router.get("/rankings", controller.rankings);

module.exports = router;
