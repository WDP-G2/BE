var mongoose = require("../db");
var Schema = mongoose.Schema;

var NotificationDeliverySchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "NotificationCampaign", required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    channel: { type: String, enum: ["IN_APP", "EMAIL"], required: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "SENT", "FAILED", "SKIPPED"],
      default: "PENDING",
      index: true,
    },
    errorMessage: { type: String, default: "" },
    sentAt: { type: Date },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } },
);

NotificationDeliverySchema.index({ campaignId: 1, recipientId: 1, channel: 1 }, { unique: true });

module.exports = mongoose.model("NotificationDelivery", NotificationDeliverySchema);
