var express = require("express");
var router = express.Router();
var { authenticate } = require("../middleware/auth");
var asyncHandler = require("../utils/asyncHandler");
var notificationsController = require("../controllers/notificationsController");

router.use(authenticate);

router.get("/", asyncHandler(notificationsController.list));
router.get("/unread-count", asyncHandler(notificationsController.getUnreadCount));
router.put("/:id/read", asyncHandler(notificationsController.markRead));
router.put("/read-all", asyncHandler(notificationsController.markAllRead));

module.exports = router;
