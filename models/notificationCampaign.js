var mongoose = require("../db");
var Schema = mongoose.Schema;

var NotificationCampaignSchema = new Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    audienceType: { type: String, enum: ["ALL", "ROLE"], default: "ALL" },
    audienceRole: { type: String, default: "" },
    channels: { type: [String], default: ["IN_APP"] },
    scheduledAt: { type: Date, default: Date.now, index: true },
    status: {
      type: String,
      enum: ["SCHEDULED", "PROCESSING", "SENDING", "COMPLETED", "FAILED", "PARTIAL_FAILED", "CANCELLED"],
      default: "SCHEDULED",
      index: true,
    },
    createdById: { type: Schema.Types.ObjectId, ref: "User" },
    recipientCount: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } },
);

module.exports = mongoose.model("NotificationCampaign", NotificationCampaignSchema);
