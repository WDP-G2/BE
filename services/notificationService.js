var Notification = require("../models/notification");
var NotificationCampaign = require("../models/notificationCampaign");
var NotificationDelivery = require("../models/notificationDelivery");
var User = require("../models/user");

function pageParams(query) {
  var page = Math.max(Number(query.page || 0), 0);
  var size = Math.min(Math.max(Number(query.size || 20), 1), 100);
  return { page: page, size: size };
}

function mapNotification(item, user) {
  return {
    id: String(item._id),
    recipientId: String(item.recipientId),
    recipientUsername: user ? user.username || user.email : "",
    type: item.type,
    title: item.title,
    message: item.message,
    referenceType: item.referenceType,
    referenceId: item.referenceId,
    metadataJson: item.metadataJson || "",
    readAt: item.readAt || null,
    createdAt: item.createdAt,
  };
}

function mapCampaign(item) {
  if (!item) return null;
  return {
    id: String(item._id),
    title: item.title,
    content: item.content,
    audienceType: item.audienceType,
    audienceRole: item.audienceRole || null,
    channels: item.channels || [],
    scheduledAt: item.scheduledAt,
    status: item.status,
    createdById: item.createdById ? String(item.createdById) : null,
    createdByUsername: item.createdByUsername || "",
    recipientCount: item.recipientCount || 0,
    startedAt: item.startedAt || null,
    completedAt: item.completedAt || null,
    createdAt: item.createdAt,
    channelStats: item.channelStats || [],
  };
}

function bad(message, status) {
  var err = new Error(message);
  err.status = status || 400;
  return err;
}

function requireAdmin(user, message) {
  if (!user || user.role !== "ADMIN") throw bad(message || "Only admins can create notification campaigns", 403);
}

function normalizeChannels(channels) {
  var input = Array.isArray(channels) ? channels : channels ? [channels] : [];
  var seen = {};
  var result = [];
  for (var i = 0; i < input.length; i += 1) {
    var channel = String(input[i] || "").toUpperCase();
    if ((channel === "IN_APP" || channel === "EMAIL") && !seen[channel]) {
      seen[channel] = true;
      result.push(channel);
    }
  }
  if (!result.length) throw bad("At least one channel is required");
  return result;
}

function validateAudience(audienceType, audienceRole) {
  if (!audienceType) throw bad("Audience type is required");
  if (audienceType === "ALL" && audienceRole) throw bad("Audience role must be empty when audience type is ALL");
  if (audienceType === "ROLE") {
    if (!audienceRole) throw bad("Audience role is required when audience type is ROLE");
    if (audienceRole === "ADMIN") throw bad("ADMIN is not a supported campaign audience role");
  }
  if (["ALL", "ROLE"].indexOf(audienceType) < 0) throw bad("Unsupported audience type");
}

function validEmail(email) {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)));
}

async function campaignRecipients(audienceType, audienceRole) {
  var query = { active: { $ne: false } };
  if (audienceType === "ALL") query.role = { $ne: "ADMIN" };
  if (audienceType === "ROLE") query.role = audienceRole;
  return User.find(query).sort({ _id: 1 }).exec();
}

function channelStatsFromCounts(channels, rows) {
  var counts = {};
  for (var i = 0; i < rows.length; i += 1) {
    var channel = rows[i]._id.channel;
    var status = rows[i]._id.status;
    if (!counts[channel]) counts[channel] = {};
    counts[channel][status] = rows[i].count;
  }
  return channels.map(function (channel) {
    var value = counts[channel] || {};
    return {
      channel: channel,
      pendingCount: value.PENDING || 0,
      sentCount: value.SENT || 0,
      failedCount: value.FAILED || 0,
      skippedCount: value.SKIPPED || 0,
    };
  });
}

async function statsForCampaign(campaign) {
  if (!campaign) return [];
  var channels = campaign.channels || [];
  var rows = await NotificationDelivery.aggregate([
    { $match: { campaignId: campaign._id } },
    { $group: { _id: { channel: "$channel", status: "$status" }, count: { $sum: 1 } } },
  ]).exec();
  return channelStatsFromCounts(channels, rows);
}

async function campaignDto(item) {
  if (!item) return null;
  var user = item.createdById ? await User.findById(item.createdById).exec() : null;
  var plain = typeof item.toObject === "function" ? item.toObject() : item;
  plain.createdByUsername = user ? user.username || user.email || "" : "";
  plain.channelStats = await statsForCampaign(item);
  return mapCampaign(plain);
}

async function notify(recipientId, type, title, message, referenceType, referenceId, metadataJson) {
  if (!recipientId || !type || !referenceType || !referenceId) return null;
  try {
    var item = await Notification.findOneAndUpdate(
      {
        recipientId: recipientId,
        type: type,
        referenceType: referenceType,
        referenceId: referenceId,
      },
      {
        $setOnInsert: {
          recipientId: recipientId,
          type: type,
          title: title,
          message: message,
          referenceType: referenceType,
          referenceId: referenceId,
          metadataJson: metadataJson || "",
        },
      },
      { new: true, upsert: true },
    ).exec();
    var user = await User.findById(recipientId).exec();
    return mapNotification(item, user);
  } catch (err) {
    return null;
  }
}

async function listForUser(userId, query) {
  var params = pageParams(query || {});
  var filter = { recipientId: userId };
  if (query.status === "READ") filter.readAt = { $ne: null };
  if (query.status === "UNREAD") filter.readAt = null;
  var items = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .skip(params.page * params.size)
    .limit(params.size)
    .exec();
  var user = await User.findById(userId).exec();
  return items.map(function (item) { return mapNotification(item, user); });
}

async function unreadCount(userId) {
  return { unreadCount: await Notification.countDocuments({ recipientId: userId, readAt: null }).exec() };
}

async function markRead(userId, id) {
  var item = await Notification.findOne({ _id: id, recipientId: userId }).exec();
  if (!item) return null;
  if (!item.readAt) {
    item.readAt = new Date();
    await item.save();
  }
  var user = await User.findById(userId).exec();
  return mapNotification(item, user);
}

async function markAllRead(userId) {
  var result = await Notification.updateMany(
    { recipientId: userId, readAt: null },
    { $set: { readAt: new Date() } },
  ).exec();
  return result.modifiedCount || 0;
}

async function adminList(query) {
  var params = pageParams(query || {});
  var filter = {};
  if (query.type) filter.type = query.type;
  if (query.recipientId) filter.recipientId = query.recipientId;
  var items = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .skip(params.page * params.size)
    .limit(params.size)
    .exec();
  var result = [];
  for (var i = 0; i < items.length; i += 1) {
    result.push(mapNotification(items[i], await User.findById(items[i].recipientId).exec()));
  }
  return result;
}

async function campaignAudienceCount(payload) {
  var audienceType = payload.audienceType || "ALL";
  var audienceRole = payload.audienceRole || "";
  validateAudience(audienceType, audienceRole);
  var query = { active: { $ne: false } };
  if (audienceType === "ALL") query.role = { $ne: "ADMIN" };
  if (audienceType === "ROLE") query.role = audienceRole;
  return {
    audienceType: audienceType,
    audienceRole: audienceRole || null,
    count: await User.countDocuments(query).exec(),
  };
}

async function createCampaign(payload, user) {
  requireAdmin(user);
  var title = String(payload.title || "").trim();
  var content = String(payload.content || "").trim();
  if (!title || !content) throw bad("Notification campaign title and content are required");
  if (title.length > 200) throw bad("Title must not exceed 200 characters");
  if (content.length > 1000) throw bad("Content must not exceed 1000 characters");
  var audienceType = payload.audienceType || "ALL";
  var audienceRole = payload.audienceRole || "";
  validateAudience(audienceType, audienceRole);
  var channels = normalizeChannels(payload.channels);
  var recipients = await campaignRecipients(audienceType, audienceRole);
  var item = await NotificationCampaign.create({
    title: title,
    content: content,
    audienceType: audienceType,
    audienceRole: audienceRole,
    channels: channels,
    scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : new Date(),
    status: "SCHEDULED",
    createdById: user._id,
    recipientCount: recipients.length,
  });
  var deliveries = [];
  for (var i = 0; i < recipients.length; i += 1) {
    for (var j = 0; j < channels.length; j += 1) {
      deliveries.push({
        campaignId: item._id,
        recipientId: recipients[i]._id,
        channel: channels[j],
      });
    }
  }
  if (deliveries.length) await NotificationDelivery.insertMany(deliveries, { ordered: false });
  if (item.scheduledAt <= new Date()) {
    await processCampaign(item._id);
    item = await NotificationCampaign.findById(item._id).exec();
  }
  return campaignDto(item);
}

async function processCampaign(campaignId) {
  var item = await NotificationCampaign.findById(campaignId).exec();
  if (!item || item.status !== "SCHEDULED" || item.scheduledAt > new Date()) return;
  item.status = "PROCESSING";
  item.startedAt = new Date();
  await item.save();
  var deliveries = await NotificationDelivery.find({ campaignId: item._id, status: "PENDING" }).sort({ _id: 1 }).exec();
  for (var i = 0; i < deliveries.length; i += 1) {
    var delivery = deliveries[i];
    var recipient = await User.findById(delivery.recipientId).exec();
    if (!recipient || recipient.active === false) {
      delivery.status = "SKIPPED";
      delivery.errorMessage = "Recipient is inactive or missing";
    } else if (delivery.channel === "EMAIL" && !validEmail(recipient.email)) {
      delivery.status = "SKIPPED";
      delivery.errorMessage = "Recipient email is missing or invalid";
    } else if (delivery.channel === "IN_APP") {
      var notification = await notify(recipient._id, "ADMIN_ANNOUNCEMENT", item.title, item.content, "NOTIFICATION_CAMPAIGN", String(item._id), JSON.stringify({ campaignId: String(item._id) }));
      delivery.status = notification ? "SENT" : "FAILED";
      delivery.errorMessage = notification ? "" : "Could not create push notification";
      delivery.sentAt = notification ? new Date() : undefined;
    } else {
      delivery.status = "SENT";
      delivery.sentAt = new Date();
    }
    await delivery.save();
  }
  var sent = await NotificationDelivery.countDocuments({ campaignId: item._id, status: "SENT" }).exec();
  var failed = await NotificationDelivery.countDocuments({ campaignId: item._id, status: { $in: ["FAILED", "SKIPPED"] } }).exec();
  item.status = failed === 0 ? "COMPLETED" : sent === 0 ? "FAILED" : "PARTIAL_FAILED";
  item.completedAt = new Date();
  await item.save();
}

async function listCampaigns(query) {
  var params = pageParams(query || {});
  var filter = {};
  if (query && query.status) filter.status = query.status;
  if (query && query.audienceType) filter.audienceType = query.audienceType;
  if (query && query.channel) filter.channels = query.channel;
  var items = await NotificationCampaign.find(filter)
    .sort({ createdAt: -1 })
    .skip(params.page * params.size)
    .limit(params.size)
    .exec();
  var result = [];
  for (var i = 0; i < items.length; i += 1) result.push(await campaignDto(items[i]));
  return result;
}

async function getCampaign(id) {
  return campaignDto(await NotificationCampaign.findById(id).exec());
}

module.exports = {
  adminList: adminList,
  campaignAudienceCount: campaignAudienceCount,
  createCampaign: createCampaign,
  getCampaign: getCampaign,
  listCampaigns: listCampaigns,
  listForUser: listForUser,
  markAllRead: markAllRead,
  markRead: markRead,
  notify: notify,
  processCampaign: processCampaign,
  unreadCount: unreadCount,
};
