var mongoose = require("../db");
var Schema = mongoose.Schema;

var UserSchema = new Schema({
  name: { type: String },
  username: { type: String },
  fullName: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  role: { type: String, default: "USER" },
  pendingRole: { type: String },
  roleApprovalStatus: { type: String, default: "NONE" },
  roleReviewReason: { type: String, default: "" },
  roleReviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  roleReviewedAt: { type: Date },
  ownerBanUntil: { type: Date },
  avatarUrl: { type: String },
  location: { type: String },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", UserSchema);
