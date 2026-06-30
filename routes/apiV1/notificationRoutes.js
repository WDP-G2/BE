var express = require("express");
var controller = require("../../controllers/notificationController");

var router = express.Router();

router.post("/admin/notification-campaigns", controller.createCampaign);
router.get("/admin/notification-campaigns", controller.listCampaigns);
router.get("/admin/notification-campaigns/audience-count", controller.audienceCount);
router.get("/admin/notification-campaigns/:id", controller.getCampaign);

router.get("/notifications", controller.listMine);
router.get("/notifications/unread-count", controller.unreadCount);
router.put("/notifications/:id/read", controller.markRead);
router.put("/notifications/read-all", controller.markAllRead);
router.get("/admin/notifications", controller.adminList);

module.exports = router;
