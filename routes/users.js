var express = require("express");
var router = express.Router();
var multer = require("multer");
var { authenticate, requireRole } = require("../middleware/auth");
var usersController = require("../controllers/usersController");

var avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

/* GET users listing (without passwords). */
router.get("/", usersController.listUsers);

/* POST /users/register - register a new user */
router.post("/register", usersController.register);

/* POST /users/login - authenticate user and return JWT */
router.post("/login", usersController.login);

/* GET /users/jockeys/directory - all jockeys with stats for horse owner */
router.get(
  "/jockeys/directory",
  authenticate,
  requireRole("OWNER", "ADMIN"),
  usersController.getJockeyDirectory,
);

/* GET /users/jockeys - public jockey accounts */
router.get("/jockeys", usersController.getPublicJockeys);

/* GET /users/me/profile - current user profile */
router.get("/me/profile", authenticate, usersController.getMyProfile);

/* PUT /users/me/profile - update current user profile (supports optional avatar upload) */
router.put(
  "/me/profile",
  authenticate,
  avatarUpload.single("avatar"),
  usersController.updateMyProfile,
);

/* GET /users/me - current authenticated user */
router.get("/me", usersController.getMe);

router.get("/:id", usersController.getUserById);

module.exports = router;
