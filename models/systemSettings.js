var mongoose = require("../db");
var Schema = mongoose.Schema;
var { DEFAULT_RULES } = require("../utils/systemSettingsMapper");

var SystemSettingsSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    fees: {
      defaultRegistrationFee: { type: Number, default: 5000000 },
      lateCheckInFee: { type: Number, default: 500000 },
      entryFeePercent: { type: Number, default: 5 },
      winningTaxPercent: { type: Number, default: 10 },
      platformFeePercent: { type: Number, default: 2 },
    },
    raceDistances: {
      type: [Number],
      default: [1000, 1200, 1400, 1600, 1800, 2000, 2400],
    },
    rules: { type: String, default: DEFAULT_RULES },
    security: { type: Schema.Types.Mixed, default: {} },
    branding: { type: Schema.Types.Mixed, default: {} },
    emailTemplates: { type: Schema.Types.Mixed, default: {} },
    bettingEnabled: { type: Boolean, default: true },
    violationTypes: {
      type: [
        {
          code: { type: String, default: "" },
          label: { type: String, default: "" },
          active: { type: Boolean, default: true },
        },
      ],
      default: undefined,
    },
    violationPenaltyRules: {
      type: [
        {
          severity: { type: String, default: "" },
          resultAction: { type: String, default: "" },
          timePenaltyMillis: { type: Number, default: 0 },
        },
      ],
      default: undefined,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SystemSettings", SystemSettingsSchema);
