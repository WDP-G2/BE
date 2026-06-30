var express = require("express");
var controller = require("../../controllers/systemSettingsController");

var router = express.Router();

router.get("/system-settings/branding", controller.publicBranding);
router.get("/admin/system-settings", controller.getSettings);
router.put("/admin/system-settings/fees", controller.update("fees"));
router.put("/admin/system-settings/rules", controller.update("rules"));
router.put("/admin/system-settings/email-templates", controller.update("emailTemplates"));
router.put("/admin/system-settings/security", controller.update("security"));
router.put("/admin/system-settings/branding", controller.update("branding"));
router.put("/admin/system-settings/race-distances", controller.update("raceDistances"));

module.exports = router;
