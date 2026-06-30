var mongoose = require("../db");
var Schema = mongoose.Schema;

var RacePrizeShareSettingSchema = new Schema(
  {
    rank: { type: Number, required: true, unique: true },
    jockeyPercent: { type: Number, default: 0 },
    createdBy: { type: String, default: "SYSTEM" },
    updatedBy: { type: String, default: "SYSTEM" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("RacePrizeShareSetting", RacePrizeShareSettingSchema);
