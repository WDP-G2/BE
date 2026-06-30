var mongoose = require("../db");
var Schema = mongoose.Schema;

var RaceParticipantSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true, index: true },
    raceId: { type: Schema.Types.ObjectId, required: true, index: true },
    registrationId: { type: Schema.Types.ObjectId, ref: "RaceRegistration", required: true, unique: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    horseId: { type: Schema.Types.ObjectId, ref: "Horse", required: true },
    jockeyId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    gateNumber: { type: Number },
    status: {
      type: String,
      enum: ["REGISTERED", "CHECKED_IN", "RUNNING", "FINISHED", "DISQUALIFIED", "ABSENT"],
      default: "REGISTERED",
    },
    checkInNote: { type: String, default: "" },
    checkedInAt: { type: Date },
    checkedInBy: { type: Schema.Types.ObjectId, ref: "User" },
    lateCheckInFeeAmount: { type: Number, default: 0 },
    lateCheckInFeeDebitKey: { type: String, default: "" },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } },
);

RaceParticipantSchema.index({ raceId: 1, horseId: 1 }, { unique: true });
RaceParticipantSchema.index({ raceId: 1, gateNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("RaceParticipant", RaceParticipantSchema);
