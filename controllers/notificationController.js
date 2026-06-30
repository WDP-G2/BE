var api = require("../utils/apiResponse");
var authService = require("../services/authService");
var service = require("../services/notificationService");

async function currentUser(req) {
  var user = await authService.currentUser(req);
  if (!user || !user._id) {
    var err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return user;
}

async function listMine(req, res, next) {
  try {
    var user = await currentUser(req);
    return api.ok(res, await service.listForUser(user._id, req.query || {}));
  } catch (err) { next(err); }
}
async function unreadCount(req, res, next) {
  try {
    var user = await currentUser(req);
    return api.ok(res, await service.unreadCount(user._id));
  } catch (err) { next(err); }
}
async function markRead(req, res, next) {
  try {
    var user = await currentUser(req);
    var item = await service.markRead(user._id, req.params.id);
    return item ? api.ok(res, item, "Notification marked as read") : api.fail(res, 404, "Notification not found");
  } catch (err) { next(err); }
}
async function markAllRead(req, res, next) {
  try {
    var user = await currentUser(req);
    return api.ok(res, { updated: await service.markAllRead(user._id) }, "All notifications marked as read");
  } catch (err) { next(err); }
}
async function adminList(req, res, next) {
  try { return api.ok(res, await service.adminList(req.query || {})); } catch (err) { next(err); }
}
async function createCampaign(req, res, next) {
  try {
    return api.ok(res, await service.createCampaign(req.body || {}, await authService.currentUser(req)), "Notification campaign created");
  } catch (err) { next(err); }
}
async function listCampaigns(req, res, next) {
  try { return api.ok(res, await service.listCampaigns(req.query || {})); } catch (err) { next(err); }
}
async function audienceCount(req, res, next) {
  try { return api.ok(res, await service.campaignAudienceCount(req.query || req.body || {})); } catch (err) { next(err); }
}
async function getCampaign(req, res, next) {
  try {
    var item = await service.getCampaign(req.params.id);
    return item ? api.ok(res, item) : api.fail(res, 404, "Notification campaign not found");
  } catch (err) { next(err); }
}

module.exports = {
  adminList: adminList,
  audienceCount: audienceCount,
  createCampaign: createCampaign,
  getCampaign: getCampaign,
  listCampaigns: listCampaigns,
  listMine: listMine,
  markAllRead: markAllRead,
  markRead: markRead,
  unreadCount: unreadCount,
};
