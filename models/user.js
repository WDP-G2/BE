var mongoose = require("../db");
var Schema = mongoose.Schema;

var UserSchema = new Schema(
  {
    name: { type: String },
    username: { type: String },
    fullName: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    role: { type: String, default: "USER" },
    active: { type: Boolean, default: true },
    pendingRole: { type: String, default: null },
    roleApprovalStatus: {
      type: String,
      enum: ["NONE", "PENDING", "APPROVED", "REJECTED"],
      default: "NONE",
    },
    roleReviewReason: { type: String, default: "" },
    roleReviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    roleReviewedAt: { type: Date, default: null },
    location: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", UserSchema);
