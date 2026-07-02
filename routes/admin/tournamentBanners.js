var express = require("express");
var router = express.Router();
var multer = require("multer");
var { authenticate, requireRole } = require("../../middleware/auth");
var asyncHandler = require("../../utils/asyncHandler");
var { apiSuccess, apiError } = require("../../utils/apiResponse");
var {
  uploadBufferToCloudinary,
  isCloudinaryError,
} = require("../../utils/cloudinaryUpload");

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
  asyncHandler(async function (req, res) {
    if (!req.file) {
      throw apiError("Vui lòng chọn ảnh banner", 400);
    }

    try {
      var uploaded = await uploadBufferToCloudinary(
        req.file,
        "horse-racing/tournaments",
      );
      var bannerUrl = uploaded ? uploaded.secure_url || uploaded.url || "" : "";
      res.status(201).json(apiSuccess({ bannerUrl: bannerUrl }));
    } catch (error) {
      if (isCloudinaryError(error)) {
        throw apiError(String(error.message || error), 400);
      }
      throw error;
    }
  }),
);

module.exports = router;
