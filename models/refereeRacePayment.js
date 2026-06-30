var mongoose = require("../db");
var Schema = mongoose.Schema;

var RefereeRacePaymentSchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
    raceId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    refereeId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    salaryConfigId: { type: Schema.Types.ObjectId, ref: "RefereeSalaryConfig", required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ["HELD", "PAID", "RELEASED"], default: "HELD", index: true },
    holdIdempotencyKey: { type: String, required: true },
    captureIdempotencyKey: { type: String, required: true },
    creditIdempotencyKey: { type: String, required: true },
    heldAt: { type: Date, default: Date.now },
    paidAt: { type: Date },
    releasedAt: { type: Date },
  },
  { timestamps: true },
);

module.exports = mongoose.model("RefereeRacePayment", RefereeRacePaymentSchema);
