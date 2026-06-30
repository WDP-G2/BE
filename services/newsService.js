var News = require("../models/news");
var ids = require("../utils/ids");
var mapper = require("../utils/documentMapper");

async function listPublished() {
  var items = await News.find({ status: "published" })
    .sort({ createdAt: -1 })
    .exec();
  return mapper.toPlainList(items);
}

async function listAll() {
  var items = await News.find({}).sort({ createdAt: -1 }).exec();
  return mapper.toPlainList(items);
}

async function find(identifier) {
  var item = null;
  if (ids.isObjectId(identifier)) {
    item = await News.findById(identifier).exec();
  }
  if (!item) item = await News.findOne({ slug: identifier }).exec();
  return mapper.toPlain(item);
}

async function create(payload) {
  var title = payload.title || "News " + Date.now();
  var item = await News.create(
    Object.assign({}, payload, {
      title: title,
      slug: payload.slug || ids.createSlug(title) + "-" + Date.now(),
    }),
  );
  return mapper.toPlain(item);
}

async function update(id, payload) {
  var item = await News.findByIdAndUpdate(id, payload, { new: true }).exec();
  return mapper.toPlain(item);
}

async function remove(id) {
  await News.findByIdAndDelete(id).exec();
}

module.exports = {
  create: create,
  find: find,
  listAll: listAll,
  listPublished: listPublished,
  remove: remove,
  update: update,
};
