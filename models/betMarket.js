var mongoose = require("../db");
var Schema = mongoose.Schema;

var BetMarketSchema = new Schema(
  {
    raceId: { type: Schema.Types.ObjectId, required: true, index: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament" },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    minStake: { type: Number, required: true },
    maxStake: { type: Number, required: true },
    status: {
      type: String,
      enum: ["DRAFT", "OPEN", "CLOSED", "SETTLED", "CANCELLED"],
      default: "DRAFT",
      index: true,
    },
    note: { type: String, default: "" },
    openedAt: { type: Date },
    closedAt: { type: Date },
    settledAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true },
);

BetMarketSchema.index({ raceId: 1, status: 1 });

module.exports = mongoose.model("BetMarket", BetMarketSchema);
