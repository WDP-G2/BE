var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var settingsController = require("../../controllers/admin/settingsController");

router.use(authenticate, requireRole("ADMIN"));

router.get("/system-settings", asyncHandler(settingsController.getSystemSettings));
router.put("/system-settings/fees", asyncHandler(settingsController.updateFees));
router.put("/system-settings/rules", asyncHandler(settingsController.updateRules));
router.put("/system-settings/race-distances", asyncHandler(settingsController.updateRaceDistances));
router.put("/system-settings/violation-types", asyncHandler(settingsController.updateViolationTypes));
router.put("/system-settings/violation-rules", asyncHandler(settingsController.updateViolationRules));
router.get("/provinces", asyncHandler(settingsController.listProvinces));
router.post("/provinces", asyncHandler(settingsController.createProvince));
router.put("/provinces/:id", asyncHandler(settingsController.updateProvince));
router.delete("/provinces/:id", asyncHandler(settingsController.deleteProvince));
router.put("/provinces/:id/active", asyncHandler(settingsController.setProvinceActive));
router.get("/provinces/:provinceId/venues", asyncHandler(settingsController.listVenues));
router.post("/provinces/:provinceId/venues", asyncHandler(settingsController.createVenue));
router.put("/venues/:venueId", asyncHandler(settingsController.updateVenue));
router.delete("/venues/:venueId", asyncHandler(settingsController.deleteVenue));
router.put("/venues/:venueId/active", asyncHandler(settingsController.setVenueActive));

module.exports = router;
