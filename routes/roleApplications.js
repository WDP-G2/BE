var express = require("express");
var router = express.Router();
var multer = require("multer");
var { authenticate } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var roleApplicationsController = require("../controllers/roleApplicationsController");

var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.use(authenticate);

router.get("/me", asyncHandler(roleApplicationsController.listMine));
router.post(
  "/owner",
  upload.fields([{ name: "verificationDocument", maxCount: 1 }]),
  asyncHandler(roleApplicationsController.applyOwner),
);
router.post(
  "/jockey",
  upload.fields([
    { name: "licenseDocument", maxCount: 1 },
    { name: "avatar", maxCount: 1 },
    { name: "achievements", maxCount: 1 },
  ]),
  asyncHandler(roleApplicationsController.applyJockey),
);
router.post(
  "/referee",
  upload.fields([{ name: "certificationDocument", maxCount: 1 }]),
  asyncHandler(roleApplicationsController.applyReferee),
);
router.post("/spectator", asyncHandler(roleApplicationsController.applySpectator));

module.exports = router;
