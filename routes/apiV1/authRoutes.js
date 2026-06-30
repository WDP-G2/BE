var express = require("express");
var controller = require("../../controllers/authController");

var router = express.Router();

router.post("/auth/register", controller.register);
router.post("/auth/login", controller.login);
router.get("/auth/me", controller.me);
router.put("/auth/password", controller.updatePassword);
router.post("/auth/logout", controller.logout);
router.post("/auth/forgot-password", controller.forgotPassword);
router.post("/auth/reset-password", controller.resetPassword);
router.post("/auth/google", controller.googleLogin);
router.post("/auth/facebook", controller.facebookLogin);
router.post("/auth/2fa/verify", controller.verifyTwoFactor);
router.post("/auth/2fa/resend", controller.resendTwoFactor);

module.exports = router;
