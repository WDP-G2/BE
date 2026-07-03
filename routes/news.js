var express = require("express");
var router = express.Router();

var { authenticate, requireRole } = require("../middleware/auth");
var { uploadNewsImage } = require("../middleware/newsUpload");
var newsController = require("../controllers/newsController");

router.get("/", newsController.list);
router.get("/featured", newsController.listFeatured);
router.get("/all", newsController.listAllPublished);
router.get("/:identifier/related", newsController.getRelated);
router.get("/:identifier", newsController.getByIdentifier);

router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  uploadNewsImage,
  newsController.create,
);

router.patch(
  "/:identifier",
  authenticate,
  requireRole("ADMIN"),
  uploadNewsImage,
  newsController.update,
);

router.delete(
  "/:identifier",
  authenticate,
  requireRole("ADMIN"),
  newsController.remove,
);

module.exports = router;
