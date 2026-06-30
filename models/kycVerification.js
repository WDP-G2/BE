var mongoose = require("../db");
var Schema = mongoose.Schema;

var KycVerificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    requestedRole: { type: String, enum: ["OWNER", "JOCKEY", "SPECTATOR", "REFEREE"] },
    status: { type: String, enum: ["PENDING", "PASSED", "FAILED"], default: "PENDING" },
    provider: { type: String, default: "FPT_AI" },
    ocrResult: { type: Schema.Types.Mixed, default: {} },
    faceMatchResult: { type: Schema.Types.Mixed, default: {} },
    frontImageUrl: { type: String, default: "" },
    backImageUrl: { type: String, default: "" },
    selfieImageUrl: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("KycVerification", KycVerificationSchema);
