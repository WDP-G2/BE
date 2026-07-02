var mongoose = require("../db");
var Schema = mongoose.Schema;

var RefereeInvitationSchema = new Schema(
  {
    raceId: { type: Schema.Types.ObjectId, required: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    tournamentName: { type: String, default: "" },
    tournamentLocation: { type: String, default: "" },
    raceName: { type: String, default: "" },
    raceDate: { type: String, default: "" },
    raceTime: { type: String, default: "" },
    refereeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    refereeName: { type: String, default: "" },
    salaryConfigId: { type: Schema.Types.ObjectId, ref: "RefereeSalaryConfig" },
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

module.exports = mongoose.model("RefereeInvitation", RefereeInvitationSchema);
