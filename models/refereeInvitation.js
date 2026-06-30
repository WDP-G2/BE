var mongoose = require("../db");
var Schema = mongoose.Schema;

var RefereeInvitationSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    refereeId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    raceId: { type: Schema.Types.ObjectId, required: true, index: true },
    salaryConfigId: { type: Schema.Types.ObjectId, ref: "RefereeSalaryConfig", required: true },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    message: { type: String, default: "" },
    responseNote: { type: String, default: "" },
    respondedAt: { type: Date },
    cancelledAt: { type: Date },
    createdBy: { type: String, default: "SYSTEM" },
    updatedBy: { type: String, default: "SYSTEM" },
  },
  { timestamps: true },
);

RefereeInvitationSchema.index({ raceId: 1, refereeId: 1, status: 1 });

module.exports = mongoose.model("RefereeInvitation", RefereeInvitationSchema);
