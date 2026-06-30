var mongoose = require("../db");
var Schema = mongoose.Schema;

var BetSchema = new Schema(
  {
    marketId: { type: Schema.Types.ObjectId, ref: "BetMarket", required: true, index: true },
    raceId: { type: Schema.Types.ObjectId, required: true, index: true },
    participantId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    stakeAmount: { type: Number, required: true },
    potentialPayoutAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PLACED", "LOCKED", "WON", "LOST", "CANCELLED", "UNPAID"],
      default: "PLACED",
      index: true,
    },
    stakeHoldKey: { type: String, default: "" },
    stakeCaptureKey: { type: String, default: "" },
    adminStakeCreditKey: { type: String, default: "" },
    stakeReleaseKey: { type: String, default: "" },
    profitAdminDebitKey: { type: String, default: "" },
    profitCreditKey: { type: String, default: "" },
    winningTaxPercent: { type: Number },
    winningTaxAmount: { type: Number },
    grossProfitAmount: { type: Number },
    netProfitAmount: { type: Number },
    placedAt: { type: Date, default: Date.now },
    lockedAt: { type: Date },
    settledAt: { type: Date },
  },
  { timestamps: true },
);

BetSchema.index({ raceId: 1, status: 1 });

module.exports = mongoose.model("Bet", BetSchema);
