var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var ownerController = require("../controllers/ownerController");

router.use(authenticate, requireRole("OWNER"));

router.get("/dashboard", asyncHandler(ownerController.getDashboard));
router.get("/horses", asyncHandler(ownerController.listHorses));
router.get("/race-registrations", asyncHandler(ownerController.listRaceRegistrations));
router.get("/jockey-invitations", asyncHandler(ownerController.listJockeyInvitations));
router.post("/jockey-invitations", asyncHandler(ownerController.createJockeyInvitation));
router.get("/jockey-invitations/:id", asyncHandler(ownerController.getJockeyInvitation));
router.put("/jockey-invitations/:id/cancel", asyncHandler(ownerController.cancelJockeyInvitation));

module.exports = router;
