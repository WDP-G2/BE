var express = require("express");
var multer = require("multer");
var router = express.Router();

var { authenticate, requireRole } = require("../middleware/auth");
var horsesController = require("../controllers/horsesController");

function fileFilter(req, file, cb) {
  var allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (allowed.indexOf(file.mimetype) === -1) {
    return cb(new Error("Only image files are allowed"));
  }
  cb(null, true);
}

var upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

var horseAssetFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "licenseImage", maxCount: 1 },
  { name: "document", maxCount: 1 },
]);

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
