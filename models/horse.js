var mongoose = require("../db");
var Schema = mongoose.Schema;

var HorseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    breed: { type: String, default: "" },
    age: { type: Number },
    gender: { type: String, default: "" },
    color: { type: String, default: "" },
    heightCm: { type: Number },
    weightKg: { type: Number },
    birthDate: { type: Date },
    ownerName: { type: String, default: "" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    imageUrl: { type: String, default: "" },
    documentUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    licenseImageUrl: { type: String, default: "" },
    licenseImagePublicId: { type: String, default: "" },
    healthStatus: { type: String, default: "Chưa cập nhật" },
    wins: { type: Number, default: 0 },
    races: { type: Number, default: 0 },
    achievements: { type: [String], default: [] },
    history: { type: [String], default: [] },
    racingStatus: {
      type: String,
      enum: ["can-race", "cannot-race"],
      default: "can-race",
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
      default: "PENDING",
      index: true,
    },
    reviewReason: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    notes: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Horse", HorseSchema);
