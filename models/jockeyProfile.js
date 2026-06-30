var mongoose = require("../db");
var Schema = mongoose.Schema;

var JockeyProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    licenseNumber: { type: String, required: true, unique: true, trim: true },
    experienceYears: { type: Number, default: 0 },
    heightCm: { type: Number },
    weightKg: { type: Number },
    bio: { type: String, default: "" },
    awards: { type: String, default: "" },
    achievements: { type: String, default: "" },
    specialties: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    licenseDocumentUrl: { type: String, default: "" },
    kycVerificationId: { type: Schema.Types.ObjectId },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
      default: "PENDING",
      index: true,
    },
    reviewReason: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    createdBy: { type: String, default: "SYSTEM" },
    updatedBy: { type: String, default: "SYSTEM" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("JockeyProfile", JockeyProfileSchema);
