var mongoose = require("../db");
var Schema = mongoose.Schema;

var RoleApplicationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: {
      type: String,
      enum: ["OWNER", "JOCKEY", "REFEREE", "SPECTATOR"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    fullName: { type: String, default: "" },
    phone: { type: String, default: "" },
    note: { type: String, default: "" },
    profileData: { type: Schema.Types.Mixed, default: {} },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    rejectReason: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("RoleApplication", RoleApplicationSchema);
