var mongoose = require("../db");
var Schema = mongoose.Schema;

var AdminAuditLogSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, required: true, trim: true },
    referenceType: { type: String, default: "", index: true },
    referenceId: { type: String, default: "", index: true },
    amount: { type: Number },
    reason: { type: String, default: "" },
    metadata: { type: String, default: "" },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } },
);

AdminAuditLogSchema.index({ referenceType: 1, referenceId: 1 });

module.exports = mongoose.model("AdminAuditLog", AdminAuditLogSchema);
