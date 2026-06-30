var mongoose = require("../db");
var Schema = mongoose.Schema;

var RaceResultSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true, index: true },
    raceId: { type: Schema.Types.ObjectId, required: true, index: true },
    participantId: { type: Schema.Types.ObjectId, ref: "RaceParticipant", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    horseId: { type: Schema.Types.ObjectId, ref: "Horse", required: true },
    jockeyId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rank: { type: Number },
    finishTimeMillis: { type: Number },
    status: {
      type: String,
      enum: ["FINISHED", "DISQUALIFIED", "ABSENT"],
      default: "FINISHED",
    },
    jockeyChallengePoints: { type: Number, default: 0 },
    prizeAmount: { type: Number, default: 0 },
    ownerPrizeAmount: { type: Number, default: 0 },
    jockeyPrizeAmount: { type: Number, default: 0 },
    jockeyPrizePercent: { type: Number, default: 0 },
    payoutStatus: { type: String, enum: ["NOT_ELIGIBLE", "PENDING", "PAID", "UNPAID"], default: "NOT_ELIGIBLE" },
    note: { type: String, default: "" },
    finalizedBy: { type: Schema.Types.ObjectId, ref: "User" },
    finalizedAt: { type: Date },
  },
  { timestamps: { createdAt: "createdAt", updatedAt: false } },
);

RaceResultSchema.index({ raceId: 1, participantId: 1 }, { unique: true });
RaceResultSchema.index({ raceId: 1, rank: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("RaceResult", RaceResultSchema);
