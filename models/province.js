var mongoose = require("../db");
var Schema = mongoose.Schema;

var ProvinceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Province", ProvinceSchema);
