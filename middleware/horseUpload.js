var multer = require("multer");

var IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
var DOCUMENT_MIME_TYPES = IMAGE_MIME_TYPES.concat([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function fileFilter(req, file, cb) {
  var allowed =
    file.fieldname === "document" || file.fieldname === "licenseImage"
      ? DOCUMENT_MIME_TYPES
      : IMAGE_MIME_TYPES;

  if (allowed.indexOf(file.mimetype) === -1) {
    return cb(new Error("File type is not allowed for " + file.fieldname));
  }

  cb(null, true);
}

var upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: { fileSize: 12 * 1024 * 1024 },
});

var horseAssetFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "licenseImage", maxCount: 1 },
  { name: "document", maxCount: 1 },
]);

module.exports = {
  horseAssetFields: horseAssetFields,
};
