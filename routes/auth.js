var express = require("express");
var router = express.Router();
var { authenticate } = require("../middleware/auth");
var authController = require("../controllers/authController");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/me", authenticate, authController.getMe);
router.post("/logout", authenticate, authController.logout);
router.put("/password", authenticate, authController.changePassword);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/google", authController.googleLogin);
router.post("/facebook", authController.facebookLogin);

module.exports = router;
