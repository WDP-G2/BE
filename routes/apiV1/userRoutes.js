var express = require("express");
var multer = require("multer");
var controller = require("../../controllers/userController");

var router = express.Router();
var upload = multer({ storage: multer.memoryStorage() });

router.get("/admin/users", controller.listAdminUsers);
router.get("/admin/users/active", controller.listActiveUsers);
router.get("/admin/users/deactivated", controller.listDeactivatedUsers);
router.get("/admin/users/:id", controller.getAdminUser);
router.put("/admin/users/:userId/deactivate", controller.deactivateUser);
router.put("/admin/users/:userId/activate", controller.activateUser);
router.put("/admin/users/:userId/role", controller.updateRole);

router.get("/users/me/profile", controller.meProfile);
router.put("/users/me/profile", upload.any(), controller.updateMeProfile);
router.get("/users/jockeys", controller.listJockeys);

module.exports = router;
