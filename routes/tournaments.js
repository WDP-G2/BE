var express = require("express");
var router = express.Router();
var multer = require("multer");
var { authenticate, requireRole } = require("../middleware/auth");
var tournamentsController = require("../controllers/tournamentsController");

function fileFilter(req, file, cb) {
  var allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (allowed.indexOf(file.mimetype) === -1) {
    return cb(new Error("Only image files are allowed"));
  }
  cb(null, true);
}

var upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.get("/", tournamentsController.list);
router.get("/owner/open", tournamentsController.listOwnerOpen);
router.get(
  "/owner/registrations",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  tournamentsController.listOwnerRegistrations,
);
router.get(
  "/jockey/registrations",
  authenticate,
  requireRole("JOCKEY", "ADMIN"),
  tournamentsController.listJockeyRegistrations,
);
router.put(
  "/:identifier/status",
  authenticate,
  requireRole("ADMIN"),
  tournamentsController.updateStatus,
);
router.put(
  "/:identifier/schedule",
  authenticate,
  requireRole("ADMIN"),
  tournamentsController.schedule,
);
router.get("/:identifier", tournamentsController.getByIdentifier);
router.get("/:identifier/venues", tournamentsController.getVenues);
router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  upload.single("banner"),
  tournamentsController.create,
);
router.patch(
  "/:identifier",
  authenticate,
  requireRole("ADMIN"),
  upload.single("banner"),
  tournamentsController.update,
);
router.put(
  "/:identifier",
  authenticate,
  requireRole("ADMIN"),
  tournamentsController.replace,
);
router.delete(
  "/:identifier",
  authenticate,
  requireRole("ADMIN"),
  tournamentsController.remove,
);
router.patch(
  "/:identifier/config",
  authenticate,
  requireRole("ADMIN"),
  tournamentsController.patchConfig,
);
router.get("/:identifier/races", tournamentsController.listRaces);
router.get(
  "/:identifier/races/:raceId/owner-options",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  tournamentsController.getOwnerRaceOptions,
);
router.post(
  "/:identifier/races",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  tournamentsController.createRace,
);
router.put(
  "/:identifier/races",
  authenticate,
  requireRole("ADMIN"),
  tournamentsController.replaceRaces,
);
router.get("/:identifier/races/:raceId", tournamentsController.getRace);
router.patch(
  "/:identifier/races/:raceId",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  tournamentsController.updateRace,
);
router.delete(
  "/:identifier/races/:raceId",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  tournamentsController.deleteRace,
);
router.get("/:identifier/registrations", tournamentsController.listRegistrations);
router.post(
  "/:identifier/owner/registrations",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  tournamentsController.createOwnerRegistration,
);
router.patch(
  "/:identifier/registrations/:registrationId",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  tournamentsController.updateRegistration,
);
router.post(
  "/:identifier/races/:raceId/results",
  authenticate,
  requireRole("ADMIN", "REFEREE"),
  tournamentsController.recordRaceResults,
);
router.get("/:identifier/results", tournamentsController.getResults);

module.exports = router;
