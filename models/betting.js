var mongoose = require("../db");
var Schema = mongoose.Schema;

var BetOptionSchema = new Schema(
  {
    participantId: { type: String, required: true },
    horseId: { type: String, default: "" },
    horseName: { type: String, default: "" },
    jockeyId: { type: String, default: "" },
    jockeyUsername: { type: String, default: "" },
    gateNumber: { type: Number },
    status: { type: String, default: "ACTIVE" },
  },
  { _id: false },
);

var BetMarketSchema = new Schema(
  {
    raceId: { type: Schema.Types.ObjectId, required: true, index: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", index: true },
    raceName: { type: String, default: "" },
    tournamentName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["DRAFT", "OPEN", "CLOSED", "SETTLING", "SETTLED", "CANCELLED"],
      default: "DRAFT",
      index: true,
    },
    minStake: { type: Number, default: 10000 },
    maxStake: { type: Number, default: 5000000 },
    note: { type: String, default: "" },
    options: { type: [BetOptionSchema], default: [] },
    openedAt: { type: Date },
    closedAt: { type: Date },
    settledAt: { type: Date },
    settlementStartedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

var BetSchema = new Schema(
  {
    marketId: { type: Schema.Types.ObjectId, ref: "BetMarket", required: true, index: true },
    raceId: { type: Schema.Types.ObjectId, required: true, index: true },
    raceName: { type: String, default: "" },
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament" },
    tournamentName: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    username: { type: String, default: "" },
    participantId: { type: String, required: true },
    horseId: { type: String, default: "" },
    horseName: { type: String, default: "" },
    stakeAmount: { type: Number, required: true },
    potentialPayoutAmount: { type: Number, default: 0 },
    winningTaxAmount: { type: Number, default: 0 },
    grossProfitAmount: { type: Number, default: 0 },
    netProfitAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["PLACED", "LOCKED", "WON", "LOST", "REFUNDED", "CANCELLED"],
      default: "PLACED",
    },
    placedAt: { type: Date, default: Date.now },
    lockedAt: { type: Date },
    settledAt: { type: Date },
    placementOperationId: { type: Schema.Types.ObjectId, ref: "WalletOperation", default: null },
    settlementOperationId: { type: Schema.Types.ObjectId, ref: "WalletOperation", default: null },
    idempotencyKey: { type: String, default: "", index: true },
  },
  { timestamps: true },
);

BetSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } } },
);

module.exports = {
  BetMarket: mongoose.model("BetMarket", BetMarketSchema),
  Bet: mongoose.model("Bet", BetSchema),
};
