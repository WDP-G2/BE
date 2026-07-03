var express = require("express");
var router = express.Router();
var { authenticate, requireRole } = require("../middleware/auth");
var invitationsController = require("../controllers/invitationsController");

router.post("/", authenticate, requireRole("OWNER", "ADMIN"), invitationsController.create);
router.get("/me", authenticate, requireRole("JOCKEY", "ADMIN"), invitationsController.listMine);
router.get("/sent", authenticate, requireRole("OWNER", "ADMIN"), invitationsController.listSent);
router.patch(
  "/:id/respond",
  authenticate,
  requireRole("JOCKEY", "ADMIN"),
  invitationsController.respond,
);

module.exports = router;
