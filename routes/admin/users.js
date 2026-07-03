var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var usersController = require("../../controllers/admin/usersController");

router.use(authenticate, requireRole("ADMIN"));

router.get("/", asyncHandler(usersController.list));
router.get("/active", asyncHandler(usersController.listActive));
router.get("/deactivated", asyncHandler(usersController.listDeactivated));
router.get("/:id", asyncHandler(usersController.getById));
router.put("/:id/activate", asyncHandler(usersController.activate));
router.put("/:id/deactivate", asyncHandler(usersController.deactivate));
router.put("/:id/role", asyncHandler(usersController.updateRole));

module.exports = router;
