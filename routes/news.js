var express = require("express");
var router = express.Router();
var News = require("../models/news");
var { authenticate, requireRole } = require("../middleware/auth");

var FALLBACK_THUMBNAIL =
  "https://images.unsplash.com/photo-1507514604110-ba3347c457f6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080";

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
  async function (req, res, next) {
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
      var featured = Boolean(req.body.featured);
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

      var item = await News.create({
        slug: slug,
        title: title,
        summary: summary,
        content: content,
        category: category,
        thumbnail: thumbnail || FALLBACK_THUMBNAIL,
        featured: featured,
        status: status,
        authorName: req.user.fullName || req.user.username || "Ban quản trị",
        createdBy: req.user.id,
      });

      res.status(201).json(mapArticle(item));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/:identifier",
  authenticate,
  requireRole("ADMIN"),
  async function (req, res, next) {
    try {
      var item = await findByIdOrSlug(req.params.identifier);
      if (!item) {
        return res.status(404).json({ error: "News not found" });
      }

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
      if (nextThumb !== undefined) {
        item.thumbnail = String(nextThumb || "").trim() || FALLBACK_THUMBNAIL;
      }
      if (nextFeatured !== undefined) item.featured = Boolean(nextFeatured);

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
      res.json(mapArticle(item));
    } catch (err) {
      next(err);
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

      await News.deleteOne({ _id: item._id }).exec();
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
