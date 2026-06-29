var mongoose = require("../db");
var Schema = mongoose.Schema;

var RefereeSalaryConfigSchema = new Schema(
  {
    name: { type: String, required: true },
    raceType: { type: String, default: "Chung" },
    amount: { type: Number, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("RefereeSalaryConfig", RefereeSalaryConfigSchema);
