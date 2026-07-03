var crypto = require("crypto");

var CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
var CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
var CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

function requireCloudinaryConfig() {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary is not configured");
  }
}

function signCloudinaryParams(params) {
  var payload = Object.keys(params)
    .sort()
    .map(function (key) {
      return key + "=" + params[key];
    })
    .join("&");

  return crypto
    .createHash("sha1")
    .update(payload + CLOUDINARY_API_SECRET)
    .digest("hex");
}

function uploadBufferToCloudinary(file, folder, resourceType) {
  return new Promise(function (resolve, reject) {
    if (!file || !file.buffer) {
      return resolve(null);
    }

    try {
      requireCloudinaryConfig();
    } catch (error) {
      return reject(error);
    }

    var timestamp = Math.floor(Date.now() / 1000).toString();
    var params = {
      folder: folder,
      timestamp: timestamp,
    };
    var signature = signCloudinaryParams(params);
    var formData = new FormData();

    formData.append(
      "file",
      new Blob([file.buffer], {
        type: file.mimetype || "application/octet-stream",
      }),
      file.originalname || "upload.jpg",
    );
    formData.append("api_key", CLOUDINARY_API_KEY);
    formData.append("timestamp", timestamp);
    formData.append("folder", folder);
    formData.append("signature", signature);

    fetch(
      "https://api.cloudinary.com/v1_1/" +
        encodeURIComponent(CLOUDINARY_CLOUD_NAME) +
        "/" + (resourceType || "image") + "/upload",
      {
        method: "POST",
        body: formData,
      },
    )
      .then(function (response) {
        return response.text().then(function (text) {
          if (!response.ok) {
            throw new Error(text || "Cloudinary upload failed");
          }
          return text ? JSON.parse(text) : {};
        });
      })
      .then(resolve)
      .catch(reject);
  });
}

function destroyCloudinaryAsset(publicId, resourceType) {
  if (!publicId) return Promise.resolve();

  try {
    requireCloudinaryConfig();
  } catch (error) {
    return Promise.reject(error);
  }

  var timestamp = Math.floor(Date.now() / 1000).toString();
  var params = {
    public_id: publicId,
    timestamp: timestamp,
  };
  var signature = signCloudinaryParams(params);
  var formData = new FormData();

  formData.append("public_id", publicId);
  formData.append("api_key", CLOUDINARY_API_KEY);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);

  return fetch(
    "https://api.cloudinary.com/v1_1/" +
      encodeURIComponent(CLOUDINARY_CLOUD_NAME) +
      "/" + (resourceType || "image") + "/destroy",
    {
      method: "POST",
      body: formData,
    },
  ).then(function (response) {
    return response.text().then(function (text) {
      if (!response.ok) {
        throw new Error(text || "Cloudinary delete failed");
      }
      return text ? JSON.parse(text) : {};
    });
  });
}

function isCloudinaryError(error) {
  var message = String(error && error.message ? error.message : error);
  return (
    message.indexOf("Cloudinary is not configured") !== -1 ||
    message.indexOf("Invalid cloud_name") !== -1 ||
    message.toLowerCase().indexOf("cloudinary") !== -1
  );
}

module.exports = {
  requireCloudinaryConfig: requireCloudinaryConfig,
  signCloudinaryParams: signCloudinaryParams,
  uploadBufferToCloudinary: uploadBufferToCloudinary,
  destroyCloudinaryAsset: destroyCloudinaryAsset,
  isCloudinaryError: isCloudinaryError,
};
