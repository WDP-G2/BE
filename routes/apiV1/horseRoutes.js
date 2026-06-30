var express = require("express");
var multer = require("multer");
var controller = require("../../controllers/horseController");

var router = express.Router();
var upload = multer({ storage: multer.memoryStorage() });

router.get("/horses/approved", controller.listApproved);
router.post("/owner/horses", upload.any(), controller.createOwnerHorse);
router.get("/owner/horses", controller.listOwnerHorses);
router.get("/owner/horses/:id", controller.getHorse);
router.get("/horses/:id", controller.getHorse);
router.put("/owner/horses/:id", upload.any(), controller.updateOwnerHorse);
router.delete("/owner/horses/:id", controller.deleteOwnerHorse);
router.get("/admin/horses", controller.listAdminHorses);
router.put("/admin/horses/:id/approve", controller.approveHorse);
router.put("/admin/horses/:id/reject", controller.rejectHorse);
router.put("/admin/horses/:id/suspend", controller.suspendHorse);

module.exports = router;
