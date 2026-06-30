var mongoose = require("../db");
var Schema = mongoose.Schema;

var RoleApplicationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["OWNER", "JOCKEY", "SPECTATOR", "REFEREE"], required: true, index: true },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    profile: { type: Schema.Types.Mixed, default: {} },
    kycVerificationId: { type: Schema.Types.ObjectId },
    reviewReason: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    createdBy: { type: String, default: "SYSTEM" },
    updatedBy: { type: String, default: "SYSTEM" },
  },
  { timestamps: true },
);

RoleApplicationSchema.index({ userId: 1, role: 1 }, { unique: true });

module.exports = mongoose.model("RoleApplication", RoleApplicationSchema);
