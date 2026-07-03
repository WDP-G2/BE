var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var horsesController = require("../../controllers/admin/horsesController");

router.use(authenticate, requireRole("ADMIN"));

router.get("/", asyncHandler(horsesController.list));
router.put("/:id/approve", asyncHandler(horsesController.approve));
router.put("/:id/reject", asyncHandler(horsesController.reject));
router.put("/:id/suspend", asyncHandler(horsesController.suspend));

module.exports = router;
