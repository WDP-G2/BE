var express = require("express");
var crypto = require("crypto");
var multer = require("multer");
var router = express.Router();
var News = require("../models/news");
var { authenticate, requireRole } = require("../middleware/auth");

var FALLBACK_THUMBNAIL =
  "https://images.unsplash.com/photo-1507514604110-ba3347c457f6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";
var CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
var CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
var CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

function requireCloudinaryConfig() {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary is not configured");
  }
}

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

function uploadBufferToCloudinary(file, folder) {
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
      file.originalname || "news-image.jpg",
    );
    formData.append("api_key", CLOUDINARY_API_KEY);
    formData.append("timestamp", timestamp);
    formData.append("folder", folder);
    formData.append("signature", signature);

    fetch(
      "https://api.cloudinary.com/v1_1/" +
        encodeURIComponent(CLOUDINARY_CLOUD_NAME) +
        "/image/upload",
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

function destroyCloudinaryAsset(publicId) {
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
      "/image/destroy",
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

function createSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function mapArticle(doc) {
  return {
    id: String(doc._id),
    slug: doc.slug,
    title: doc.title,
    shortDescription: doc.summary || "",
    summary: doc.summary || "",
    content: doc.content || "",
    thumbnail: doc.thumbnail || FALLBACK_THUMBNAIL,
    imageUrl: doc.thumbnail || FALLBACK_THUMBNAIL,
    imagePublicId: doc.imagePublicId || "",
    category: doc.category || "Tin tức",
    author: doc.authorName || "Ban quản trị",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    featured: Boolean(doc.featured),
    status: doc.status || "published",
  };
}

function toLimit(value, fallback) {
  var parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 50);
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  var normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}

async function findByIdOrSlug(identifier) {
  var byId = null;
  if (identifier && /^[a-fA-F0-9]{24}$/.test(identifier)) {
    byId = await News.findById(identifier).exec();
  }

  if (byId) return byId;
  return News.findOne({ slug: identifier }).exec();
}

router.get("/", async function (req, res, next) {
  try {
    var search = String(req.query.search || "").trim();
    var category = String(req.query.category || "").trim();
    var featuredRaw = req.query.featured;
    var isAdminMode = String(req.query.admin || "") === "true";

    var query = {};
    if (!isAdminMode) {
      query.status = "published";
    }

    if (category) {
      query.category = category;
    }

    if (featuredRaw === "true" || featuredRaw === "false") {
      query.featured = featuredRaw === "true";
    }

    if (search) {
      query.$or = [
        { title: new RegExp(search, "i") },
        { summary: new RegExp(search, "i") },
        { content: new RegExp(search, "i") },
        { category: new RegExp(search, "i") },
        { authorName: new RegExp(search, "i") },
      ];
    }

    var items = await News.find(query).sort({ createdAt: -1 }).exec();
    res.json(items.map(mapArticle));
  } catch (err) {
    next(err);
  }
});

router.get("/featured", async function (req, res, next) {
  try {
    var limit = toLimit(req.query.limit, 3);
    var items = await News.find({ status: "published", featured: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    res.json(items.map(mapArticle));
  } catch (err) {
    next(err);
  }
});

router.get("/all", async function (req, res, next) {
  try {
    var items = await News.find({ status: "published" })
      .sort({ createdAt: -1 })
      .exec();
    res.json(items.map(mapArticle));
  } catch (err) {
    next(err);
  }
});

router.get("/:identifier/related", async function (req, res, next) {
  try {
    var current = await findByIdOrSlug(req.params.identifier);
    if (!current) {
      return res.status(404).json({ error: "News not found" });
    }

    var limit = toLimit(req.query.limit, 3);
    var items = await News.find({
      _id: { $ne: current._id },
      status: "published",
      category: current.category,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    res.json(items.map(mapArticle));
  } catch (err) {
    next(err);
  }
});

router.get("/:identifier", async function (req, res, next) {
  try {
    var item = await findByIdOrSlug(req.params.identifier);
    if (!item) {
      return res.status(404).json({ error: "News not found" });
    }
    res.json(mapArticle(item));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  uploadNewsImage,
  async function (req, res, next) {
    var uploadedImage = null;
    try {
      var title = String(req.body.title || "").trim();
      var summary = String(
        req.body.summary || req.body.shortDescription || "",
      ).trim();
      var content = String(req.body.content || "").trim();
      var category = String(req.body.category || "Tin tức").trim();
      var thumbnail = String(
        req.body.thumbnail || req.body.imageUrl || "",
      ).trim();
      var featured = toBoolean(req.body.featured);
      var status = String(req.body.status || "published")
        .trim()
        .toLowerCase();

      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      if (!["draft", "published", "archived"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      var baseSlug = createSlug(title) || "tin-tuc";
      var slug = baseSlug;
      var seq = 1;

      while (await News.exists({ slug: slug })) {
        seq += 1;
        slug = baseSlug + "-" + seq;
      }

      uploadedImage = req.file
        ? await uploadBufferToCloudinary(req.file, "horse-racing/news")
        : null;
      var imageUrl = uploadedImage
        ? uploadedImage.secure_url || uploadedImage.url || ""
        : thumbnail;

      var item = await News.create({
        slug: slug,
        title: title,
        summary: summary,
        content: content,
        category: category,
        thumbnail: imageUrl || FALLBACK_THUMBNAIL,
        imagePublicId: uploadedImage ? uploadedImage.public_id || "" : "",
        featured: featured,
        status: status,
        authorName: req.user.fullName || req.user.username || "Ban quản trị",
        createdBy: req.user.id,
      });

      res.status(201).json(mapArticle(item));
    } catch (err) {
      if (uploadedImage && uploadedImage.public_id) {
        destroyCloudinaryAsset(uploadedImage.public_id).catch(function () {});
      }
      handleUploadError(err, res, next);
    }
  },
);

router.patch(
  "/:identifier",
  authenticate,
  requireRole("ADMIN"),
  uploadNewsImage,
  async function (req, res, next) {
    var uploadedImage = null;
    var oldImagePublicId = "";
    try {
      var item = await findByIdOrSlug(req.params.identifier);
      if (!item) {
        return res.status(404).json({ error: "News not found" });
      }
      oldImagePublicId = item.imagePublicId || "";

      var nextTitle = req.body.title;
      var nextSummary = req.body.summary;
      var nextShort = req.body.shortDescription;
      var nextContent = req.body.content;
      var nextCategory = req.body.category;
      var nextThumb = req.body.thumbnail || req.body.imageUrl;
      var nextStatus = req.body.status;
      var nextFeatured = req.body.featured;

      if (nextTitle !== undefined) item.title = String(nextTitle || "").trim();
      if (!item.title) {
        return res.status(400).json({ error: "Title is required" });
      }

      if (nextSummary !== undefined || nextShort !== undefined) {
        item.summary = String(nextSummary || nextShort || "").trim();
      }
      if (nextContent !== undefined)
        item.content = String(nextContent || "").trim();
      if (nextCategory !== undefined) {
        item.category = String(nextCategory || "Tin tức").trim() || "Tin tức";
      }
      if (req.file) {
        uploadedImage = await uploadBufferToCloudinary(
          req.file,
          "horse-racing/news",
        );
        item.thumbnail =
          uploadedImage.secure_url || uploadedImage.url || item.thumbnail;
        item.imagePublicId = uploadedImage.public_id || "";
      } else if (nextThumb !== undefined) {
        item.thumbnail = String(nextThumb || "").trim() || FALLBACK_THUMBNAIL;
        item.imagePublicId = "";
      }
      if (nextFeatured !== undefined) item.featured = toBoolean(nextFeatured);

      if (nextStatus !== undefined) {
        var status = String(nextStatus || "")
          .trim()
          .toLowerCase();
        if (!["draft", "published", "archived"].includes(status)) {
          return res.status(400).json({ error: "Invalid status" });
        }
        item.status = status;
      }

      var nextSlugBase = createSlug(item.title) || "tin-tuc";
      if (nextSlugBase !== item.slug) {
        var slug = nextSlugBase;
        var seq = 1;
        while (await News.exists({ slug: slug, _id: { $ne: item._id } })) {
          seq += 1;
          slug = nextSlugBase + "-" + seq;
        }
        item.slug = slug;
      }

      await item.save();
      if (
        uploadedImage &&
        uploadedImage.public_id &&
        oldImagePublicId &&
        oldImagePublicId !== uploadedImage.public_id
      ) {
        destroyCloudinaryAsset(oldImagePublicId).catch(function () {});
      }
      res.json(mapArticle(item));
    } catch (err) {
      if (uploadedImage && uploadedImage.public_id) {
        destroyCloudinaryAsset(uploadedImage.public_id).catch(function () {});
      }
      handleUploadError(err, res, next);
    }
  },
);

router.delete(
  "/:identifier",
  authenticate,
  requireRole("ADMIN"),
  async function (req, res, next) {
    try {
      var item = await findByIdOrSlug(req.params.identifier);
      if (!item) {
        return res.status(404).json({ error: "News not found" });
      }

      var imagePublicId = item.imagePublicId || "";
      await News.deleteOne({ _id: item._id }).exec();
      if (imagePublicId) {
        destroyCloudinaryAsset(imagePublicId).catch(function () {});
      }
      res.status(204).send();
    } catch (err) {
      handleUploadError(err, res, next);
    }
  },
);

module.exports = router;
