var express = require("express");
var router = express.Router();

var { authenticate, requireRole } = require("../middleware/auth");
var { horseAssetFields } = require("../middleware/horseUpload");
var horsesController = require("../controllers/horsesController");

router.get("/", horsesController.list);
router.get("/approved", horsesController.listApproved);
router.get("/:identifier", horsesController.getByIdentifier);

router.post(
  "/",
  authenticate,
  requireRole("ADMIN", "OWNER"),
  horseAssetFields,
  horsesController.create,
);

router.patch(
  "/:identifier",
  authenticate,
  requireRole("ADMIN", "OWNER"),
  horseAssetFields,
  horsesController.update,
);

router.delete(
  "/:identifier",
  authenticate,
  requireRole("ADMIN", "OWNER"),
  horsesController.remove,
);

module.exports = router;
