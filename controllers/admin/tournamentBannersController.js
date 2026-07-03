var { apiSuccess, apiError } = require("../../utils/apiResponse");
var {
  uploadBufferToCloudinary,
  isCloudinaryError,
} = require("../../utils/cloudinaryUpload");

async function upload(req, res) {
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
}

module.exports = {
  upload: upload,
};
