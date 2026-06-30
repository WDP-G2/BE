var mongoose = require("../db");
var Schema = mongoose.Schema;

var JockeyInvitationSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ownerName: { type: String, default: "" },
    jockeyId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    jockeyProfileId: { type: Schema.Types.ObjectId, ref: "JockeyProfile" },
    jockeyName: { type: String, default: "" },
    horseId: { type: Schema.Types.ObjectId, ref: "Horse", required: true },
    horseName: { type: String, required: true },
    horseBreed: { type: String, default: "" },
    horseAge: { type: Number },
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    tournamentName: { type: String, default: "" },
    raceId: { type: Schema.Types.ObjectId },
    raceName: { type: String, default: "" },
    raceScheduledStartAt: { type: Date },
    raceScheduledEndAt: { type: Date },
    venueId: { type: Schema.Types.ObjectId, ref: "RaceVenue" },
    venueName: { type: String, default: "" },
    venueAddress: { type: String, default: "" },
    raceLabel: { type: String, default: "" },
    raceDate: { type: String, default: "" },
    raceTime: { type: String, default: "" },
    location: { type: String, default: "" },
    reward: { type: Number, default: 0 },
    remunerationAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "CANCELLED", "Chờ xử lý", "Đã chấp nhận", "Đã từ chối"],
      default: "PENDING",
    },
    message: { type: String, default: "" },
    responseNote: { type: String, default: "" },
    respondedAt: { type: Date },
    cancelledAt: { type: Date },
    createdBy: { type: String, default: "SYSTEM" },
    updatedBy: { type: String, default: "SYSTEM" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("JockeyInvitation", JockeyInvitationSchema);
