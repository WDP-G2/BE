var mongoose = require("../db");
var Schema = mongoose.Schema;

var FinanceSettingsSchema = new Schema(
  {
    key: { type: String, default: "singleton", unique: true },
    betWinningTaxPercent: { type: Number, default: 0 },
    bettingEnabled: { type: Boolean, default: false },
    createdBy: { type: String, default: "SYSTEM" },
    updatedBy: { type: String, default: "SYSTEM" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("FinanceSettings", FinanceSettingsSchema);
