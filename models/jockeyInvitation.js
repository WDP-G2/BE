var mongoose = require("../db");
var Schema = mongoose.Schema;

var JockeyInvitationSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ownerName: { type: String, default: "" },
    jockeyId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    jockeyName: { type: String, default: "" },
    horseId: { type: Schema.Types.ObjectId, ref: "Horse", required: true },
    horseName: { type: String, required: true },
    horseBreed: { type: String, default: "" },
    horseAge: { type: Number },
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    tournamentName: { type: String, default: "" },
    raceId: { type: Schema.Types.ObjectId },
    raceLabel: { type: String, default: "" },
    raceDate: { type: String, default: "" },
    raceTime: { type: String, default: "" },
    location: { type: String, default: "" },
    reward: { type: Number, default: 0 },
    rewardStatus: {
      type: String,
      enum: ["NONE", "HELD", "PAID", "REFUNDED"],
      default: "NONE",
      index: true,
    },
    rewardHoldOperationId: { type: Schema.Types.ObjectId, ref: "WalletOperation", default: null },
    rewardSettlementOperationId: { type: Schema.Types.ObjectId, ref: "WalletOperation", default: null },
    message: { type: String, default: "" },
    responseNote: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Chờ xử lý", "Đã chấp nhận", "Đã từ chối", "Đã hủy"],
      default: "Chờ xử lý",
    },
    respondedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true },
);

module.exports = mongoose.model("JockeyInvitation", JockeyInvitationSchema);
