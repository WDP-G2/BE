var mongoose = require("../db");
var Schema = mongoose.Schema;

var NotificationSchema = new Schema(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    referenceType: { type: String, required: true },
    referenceId: { type: String, required: true },
    metadataJson: { type: String, default: "" },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } },
);

NotificationSchema.index(
  { recipientId: 1, type: 1, referenceType: 1, referenceId: 1 },
  { unique: true },
);

module.exports = mongoose.model("Notification", NotificationSchema);
