var multer = require("multer");
var { isCloudinaryError } = require("../utils/cloudinaryUpload");

var upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: function (req, file, cb) {
    var allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.indexOf(file.mimetype) === -1) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 8 * 1024 * 1024 },
});

function handleUploadError(error, res, next) {
  var message = String(error && error.message ? error.message : error);
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: message });
  }
  if (message === "Only image files are allowed") {
    return res.status(400).json({ error: message });
  }
  if (isCloudinaryError(error)) {
    return res.status(502).json({ error: message });
  }
  next(error);
}

function uploadNewsImage(req, res, next) {
  upload.single("image")(req, res, function (error) {
    if (error) {
      return handleUploadError(error, res, next);
    }
    next();
  });
}

module.exports = {
  uploadNewsImage: uploadNewsImage,
  handleUploadError: handleUploadError,
};
