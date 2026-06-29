var mongoose = require("../db");
var Schema = mongoose.Schema;

var NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, default: "GENERAL" },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    readStatus: {
      type: String,
      enum: ["UNREAD", "READ"],
      default: "UNREAD",
      index: true,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model("Notification", NotificationSchema);
