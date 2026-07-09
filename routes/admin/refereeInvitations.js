var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var controller = require("../../controllers/admin/refereeInvitationsController");

router.use(authenticate, requireRole("ADMIN"));

router.get("/", asyncHandler(controller.listInvitations));
router.post("/", asyncHandler(controller.createInvitation));
router.get("/:id", asyncHandler(controller.getInvitation));
router.put("/:id/cancel", asyncHandler(controller.cancelInvitation));

module.exports = router;
