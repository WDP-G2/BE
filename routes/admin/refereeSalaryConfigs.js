var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var refereeSalaryConfigsController = require("../../controllers/admin/refereeSalaryConfigsController");

router.use(authenticate, requireRole("ADMIN"));

router.get("/", asyncHandler(refereeSalaryConfigsController.list));
router.post("/", asyncHandler(refereeSalaryConfigsController.create));
router.get("/:id", asyncHandler(refereeSalaryConfigsController.getById));
router.put("/:id", asyncHandler(refereeSalaryConfigsController.update));
router.delete("/:id", asyncHandler(refereeSalaryConfigsController.remove));

module.exports = router;
