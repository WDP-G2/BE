var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var roleApplicationsController = require("../../controllers/admin/roleApplicationsController");

router.use(authenticate, requireRole("ADMIN"));

router.get("/", asyncHandler(roleApplicationsController.list));
router.put("/:id/approve", asyncHandler(roleApplicationsController.approve));
router.put("/:id/reject", asyncHandler(roleApplicationsController.reject));

module.exports = router;
