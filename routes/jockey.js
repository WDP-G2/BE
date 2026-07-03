var express = require("express");
var router = express.Router();
var multer = require("multer");
var { authenticate, requireRole } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var jockeyController = require("../controllers/jockeyController");

var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.use(authenticate, requireRole("JOCKEY"));

router.get("/dashboard", asyncHandler(jockeyController.getDashboard));
router.get("/races", asyncHandler(jockeyController.listRaces));
router.get("/performance", asyncHandler(jockeyController.getPerformance));
router.get("/prizes", asyncHandler(jockeyController.getPrizes));
router.get("/profile", asyncHandler(jockeyController.getProfile));
router.put("/profile", upload.none(), asyncHandler(jockeyController.updateProfile));
router.get("/invitations", asyncHandler(jockeyController.listInvitations));
router.put("/invitations/:id/accept", asyncHandler(jockeyController.acceptInvitation));
router.put("/invitations/:id/reject", asyncHandler(jockeyController.rejectInvitation));

module.exports = router;
