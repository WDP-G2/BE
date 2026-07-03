var Notification = require("../models/notification");
var { apiSuccess, apiError } = require("../utils/apiResponse");

function mapNotification(n) {
  return {
    id: String(n._id),
    type: n.type,
    title: n.title,
    message: n.message,
    readStatus: n.readStatus,
    read: n.readStatus === "READ",
    readAt: n.readAt,
    metadata: n.metadata || {},
    createdAt: n.createdAt,
  };
}

async function list(req, res) {
  var page = Math.max(0, Number(req.query.page || 0));
  var size = Math.max(1, Math.min(50, Number(req.query.size || 20)));
  var filter = { userId: req.user.id };
  var total = await Notification.countDocuments(filter).exec();
  var rows = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .skip(page * size)
    .limit(size)
    .exec();

  res.json(apiSuccess({
    content: rows.map(mapNotification),
    totalElements: total,
    totalPages: Math.ceil(total / size),
    number: page,
    size: size,
  }));
}

async function getUnreadCount(req, res) {
  var count = await Notification.countDocuments({ userId: req.user.id, readStatus: "UNREAD" }).exec();
  res.json(apiSuccess({ count: count, unreadCount: count }));
}

async function markRead(req, res) {
  var n = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { $set: { readStatus: "READ", readAt: new Date() } },
    { new: true },
  ).exec();
  if (!n) throw apiError("Không tìm thấy thông báo", 404);
  res.json(apiSuccess(mapNotification(n)));
}

async function markAllRead(req, res) {
  var result = await Notification.updateMany(
    { userId: req.user.id, readStatus: "UNREAD" },
    { $set: { readStatus: "READ", readAt: new Date() } },
  ).exec();
  res.json(apiSuccess({ count: result.modifiedCount || 0 }));
}

module.exports = {
  list: list,
  getUnreadCount: getUnreadCount,
  markRead: markRead,
  markAllRead: markAllRead,
};
