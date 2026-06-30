var mongoose = require("../db");
var Schema = mongoose.Schema;

var RefereeSalaryConfigSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    raceType: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("RefereeSalaryConfig", RefereeSalaryConfigSchema);
