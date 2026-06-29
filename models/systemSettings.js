var mongoose = require("../db");
var Schema = mongoose.Schema;

var SystemSettingsSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    fees: {
      entryFeePercent: { type: Number, default: 5 },
      winningTaxPercent: { type: Number, default: 10 },
      platformFeePercent: { type: Number, default: 2 },
    },
    raceDistances: { type: [Number], default: [1000, 1200, 1400, 1600, 1800, 2000, 2400] },
    rules: { type: String, default: "" },
    security: { type: Schema.Types.Mixed, default: {} },
    branding: { type: Schema.Types.Mixed, default: {} },
    emailTemplates: { type: Schema.Types.Mixed, default: {} },
    bettingEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SystemSettings", SystemSettingsSchema);
