var mongoose = require("../db");
var Schema = mongoose.Schema;

var RaceRegistrationSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true, index: true },
    raceId: { type: Schema.Types.ObjectId, required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    horseId: { type: Schema.Types.ObjectId, ref: "Horse", required: true, index: true },
    jockeyId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jockeyInvitationId: { type: Schema.Types.ObjectId },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    entryFeeAmount: { type: Number, default: 0 },
    entryFeeDebitKey: { type: String, default: "" },
    entryFeeRefundKey: { type: String, default: "" },
    ownerNote: { type: String, default: "" },
    reviewNote: { type: String, default: "" },
    withdrawNote: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);

RaceRegistrationSchema.index({ raceId: 1, ownerId: 1, status: 1 });
RaceRegistrationSchema.index({ raceId: 1, horseId: 1, status: 1 });

module.exports = mongoose.model("RaceRegistration", RaceRegistrationSchema);
