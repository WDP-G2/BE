var newsService = require("../services/newsService");
var authService = require("../services/authService");
var adminService = require("../services/adminService");
var api = require("../utils/apiResponse");

async function record(req, action, referenceId, reason, metadata) {
  var admin = await authService.currentUser(req);
  await adminService.recordAudit(admin, action, "NEWS", referenceId, reason, null, metadata || {});
}

async function listPublic(req, res, next) {
  try {
    return api.ok(res, await newsService.listPublished());
  } catch (err) {
    next(err);
  }
}

async function listAll(req, res, next) {
  try {
    return api.ok(res, await newsService.listAll());
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    var item = await newsService.find(req.params.id);
    return item ? api.ok(res, item) : api.fail(res, 404, "News not found");
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    var item = await newsService.create(req.body || {});
    await record(req, "NEWS_CREATED", item && item.id, "News article created", { title: item && item.title });
    return api.ok(res, item, "News created");
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    var item = await newsService.update(req.params.id, req.body || {});
    if (item) await record(req, "NEWS_UPDATED", req.params.id, "News article updated", req.body || {});
    return api.ok(
      res,
      item,
      "News updated",
    );
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await newsService.remove(req.params.id);
    await record(req, "NEWS_DELETED", req.params.id, "News article deleted");
    return api.ok(res, null, "News deleted");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create: create,
  get: get,
  listAll: listAll,
  listPublic: listPublic,
  remove: remove,
  update: update,
};
