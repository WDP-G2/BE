var express = require("express");
var controller = require("../../controllers/locationController");

var router = express.Router();

router.get("/admin/provinces", controller.listProvinces);
router.post("/admin/provinces", controller.createProvince);
router.put("/admin/provinces/:id", controller.updateProvince);
router.delete("/admin/provinces/:id", controller.deleteProvince);
router.put("/admin/provinces/:id/active", controller.setProvinceActive);
router.get("/admin/provinces/:provinceId/venues", controller.listVenues);
router.post("/admin/provinces/:provinceId/venues", controller.createVenue);
router.put("/admin/venues/:venueId", controller.updateVenue);
router.delete("/admin/venues/:venueId", controller.deleteVenue);
router.put("/admin/venues/:venueId/active", controller.setVenueActive);

module.exports = router;
