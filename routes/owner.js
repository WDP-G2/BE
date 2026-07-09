var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var { horseAssetFields } = require("../middleware/horseUpload");
var ownerController = require("../controllers/ownerController");
var horsesController = require("../controllers/horsesController");
var raceRegistrationsController = require("../controllers/raceRegistrationsController");

router.use(authenticate, requireRole("OWNER"));

router.get("/profile", asyncHandler(ownerController.getProfile));
router.put("/profile", asyncHandler(ownerController.updateProfile));
router.get("/results", asyncHandler(ownerController.getResults));
router.get("/dashboard", asyncHandler(ownerController.getDashboard));
router.get("/horses", asyncHandler(ownerController.listHorses));
router.post("/horses", horseAssetFields, asyncHandler(horsesController.create));
router.put("/horses/:identifier", horseAssetFields, asyncHandler(horsesController.update));
router.delete("/horses/:identifier", asyncHandler(horsesController.remove));
router.get("/race-registrations", asyncHandler(ownerController.listRaceRegistrations));
router.put(
  "/race-registrations/:id/withdraw",
  asyncHandler(raceRegistrationsController.withdrawRegistration),
);
router.get("/jockey-invitations", asyncHandler(ownerController.listJockeyInvitations));
router.post("/jockey-invitations", asyncHandler(ownerController.createJockeyInvitation));
router.get("/jockey-invitations/:id", asyncHandler(ownerController.getJockeyInvitation));
router.put("/jockey-invitations/:id/cancel", asyncHandler(ownerController.cancelJockeyInvitation));

module.exports = router;
