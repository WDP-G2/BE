var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var EvidenceSchema = new Schema(
  {
    url: String,
    name: String,
    size: Number,
    mimeType: String,
    publicId: String,
  },
  { _id: false },
);

var ViolationSchema = new Schema(
  {
    raceId: { type: Schema.Types.ObjectId, required: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    raceName: String,
    refereeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    refereeName: String,
    participantId: { type: Schema.Types.ObjectId },
    horseNo: Number,
    horseName: String,
    jockeyName: String,
    type: { type: String, default: "Khác" },
    severity: {
      type: String,
      enum: ["Cảnh cáo", "Phạt nhẹ", "Phạt nặng", "Loại"],
      default: "Phạt nhẹ",
    },
    description: String,
    penalty: String,
    occurredAt: { type: String, default: "" },
    evidence: [EvidenceSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Violation", ViolationSchema);
