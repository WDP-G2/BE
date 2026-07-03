var News = require("../models/news");

function createSlug(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
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

async function generateUniqueSlug(title, excludeId) {
  var baseSlug = createSlug(title) || "tin-tuc";
  var slug = baseSlug;
  var seq = 1;
  var filter = function () {
    return excludeId ? { slug: slug, _id: { $ne: excludeId } } : { slug: slug };
  };
  while (await News.exists(filter())) {
    seq += 1;
    slug = baseSlug + "-" + seq;
  }
  return slug;
}

module.exports = {
  createSlug: createSlug,
  toLimit: toLimit,
  toBoolean: toBoolean,
  findByIdOrSlug: findByIdOrSlug,
  generateUniqueSlug: generateUniqueSlug,
};
