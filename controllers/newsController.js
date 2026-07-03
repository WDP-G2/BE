var News = require("../models/news");
var { mapArticle, FALLBACK_THUMBNAIL } = require("../utils/newsMapper");
var {
  uploadBufferToCloudinary,
  destroyCloudinaryAsset,
} = require("../utils/cloudinaryUpload");
var newsService = require("../services/newsService");
var { handleUploadError } = require("../middleware/newsUpload");

async function list(req, res, next) {
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
}

async function listFeatured(req, res, next) {
  try {
    var limit = newsService.toLimit(req.query.limit, 3);
    var items = await News.find({ status: "published", featured: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    res.json(items.map(mapArticle));
  } catch (err) {
    next(err);
  }
}

async function listAllPublished(req, res, next) {
  try {
    var items = await News.find({ status: "published" })
      .sort({ createdAt: -1 })
      .exec();
    res.json(items.map(mapArticle));
  } catch (err) {
    next(err);
  }
}

async function getRelated(req, res, next) {
  try {
    var current = await newsService.findByIdOrSlug(req.params.identifier);
    if (!current) {
      return res.status(404).json({ error: "News not found" });
    }

    var limit = newsService.toLimit(req.query.limit, 3);
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
}

async function getByIdentifier(req, res, next) {
  try {
    var item = await newsService.findByIdOrSlug(req.params.identifier);
    if (!item) {
      return res.status(404).json({ error: "News not found" });
    }
    res.json(mapArticle(item));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
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
    var featured = newsService.toBoolean(req.body.featured);
    var status = String(req.body.status || "published")
      .trim()
      .toLowerCase();

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    if (!["draft", "published", "archived"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    var slug = await newsService.generateUniqueSlug(title);

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
}

async function update(req, res, next) {
  var uploadedImage = null;
  var oldImagePublicId = "";
  try {
    var item = await newsService.findByIdOrSlug(req.params.identifier);
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
    if (nextFeatured !== undefined) item.featured = newsService.toBoolean(nextFeatured);

    if (nextStatus !== undefined) {
      var status = String(nextStatus || "")
        .trim()
        .toLowerCase();
      if (!["draft", "published", "archived"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      item.status = status;
    }

    var nextSlugBase = newsService.createSlug(item.title) || "tin-tuc";
    if (nextSlugBase !== item.slug) {
      item.slug = await newsService.generateUniqueSlug(item.title, item._id);
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
}

async function remove(req, res, next) {
  try {
    var item = await newsService.findByIdOrSlug(req.params.identifier);
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
}

module.exports = {
  list: list,
  listFeatured: listFeatured,
  listAllPublished: listAllPublished,
  getRelated: getRelated,
  getByIdentifier: getByIdentifier,
  create: create,
  update: update,
  remove: remove,
};
