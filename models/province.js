var mongoose = require("../db");
var Schema = mongoose.Schema;

var VenueSchema = new Schema(
  {
    name: { type: String, required: true },
    address: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

var ProvinceSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, default: "" },
    active: { type: Boolean, default: true },
    venues: [VenueSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Province", ProvinceSchema);
