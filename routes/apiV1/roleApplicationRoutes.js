var express = require("express");
var multer = require("multer");
var controller = require("../../controllers/roleApplicationController");

var router = express.Router();
var upload = multer({ storage: multer.memoryStorage() });

router.get("/admin/role-applications", controller.listAll);
router.get("/admin/role-applications/role/:role", controller.listByRole);
router.get("/admin/role-applications/status/:status", controller.listByStatus);
router.put("/admin/role-applications/:profileId/approve", controller.approve);
router.put("/admin/role-applications/:profileId/reject", controller.reject);

router.post("/role-applications/owner", upload.any(), controller.submit("OWNER"));
router.post("/role-applications/jockey", upload.any(), controller.submit("JOCKEY"));
router.post("/role-applications/spectator", controller.submit("SPECTATOR"));
router.post("/role-applications/referee", upload.any(), controller.submit("REFEREE"));
router.post("/role-applications/kyc/ocr", upload.any(), controller.kycOcr);
router.post("/role-applications/kyc/:kycVerificationId/face-match", upload.any(), controller.faceMatch);
router.get("/role-applications/me", controller.mine);

module.exports = router;
