var mongoose = require("../db");
var Schema = mongoose.Schema;

var JockeyChallengeResultSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true, index: true },
    jockeyId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    totalPoints: { type: Number, default: 0 },
    firstPlaces: { type: Number, default: 0 },
    secondPlaces: { type: Number, default: 0 },
    thirdPlaces: { type: Number, default: 0 },
    challengeRank: { type: Number, required: true },
    prizeAmount: { type: Number, default: 0 },
    payoutStatus: { type: String, enum: ["NOT_ELIGIBLE", "PENDING", "PAID", "UNPAID"], default: "NOT_ELIGIBLE" },
    finalizedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

JockeyChallengeResultSchema.index({ tournamentId: 1, jockeyId: 1 }, { unique: true });

module.exports = mongoose.model("JockeyChallengeResult", JockeyChallengeResultSchema);
