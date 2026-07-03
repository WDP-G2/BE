var express = require("express");
var router = express.Router();
var multer = require("multer");
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var tournamentBannersController = require("../../controllers/admin/tournamentBannersController");

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

router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  upload.single("banner"),
  asyncHandler(tournamentBannersController.upload),
);

module.exports = router;
