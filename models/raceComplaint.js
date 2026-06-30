var mongoose = require("../db");
var Schema = mongoose.Schema;

var RaceComplaintSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true, index: true },
    raceId: { type: Schema.Types.ObjectId, required: true, index: true },
    complainantOwnerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accusedOwnerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accusedParticipantId: { type: Schema.Types.ObjectId, ref: "RaceParticipant", required: true },
    status: { type: String, enum: ["PENDING", "RESOLVED", "REJECTED"], default: "PENDING", index: true },
    reason: { type: String, required: true },
    evidenceUrl: { type: String, default: "" },
    adminNote: { type: String, default: "" },
    ownerPrizeReturnAmount: { type: Number, default: 0 },
    fineAmount: { type: Number, default: 0 },
    totalPenaltyAmount: { type: Number, default: 0 },
    banUntil: { type: Date },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("RaceComplaint", RaceComplaintSchema);
