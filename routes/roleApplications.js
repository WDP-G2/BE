var express = require("express");
var router = express.Router();
var { authenticate } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var roleApplicationsController = require("../controllers/roleApplicationsController");

router.use(authenticate);

router.get("/me", asyncHandler(roleApplicationsController.listMine));
router.post("/owner", asyncHandler(roleApplicationsController.applyOwner));
router.post("/jockey", asyncHandler(roleApplicationsController.applyJockey));
router.post("/spectator", asyncHandler(roleApplicationsController.applySpectator));

module.exports = router;
