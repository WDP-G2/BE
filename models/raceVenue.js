var mongoose = require("../db");
var Schema = mongoose.Schema;

var RaceVenueSchema = new Schema(
  {
    provinceId: { type: Schema.Types.ObjectId, ref: "Province", required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

RaceVenueSchema.index({ provinceId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("RaceVenue", RaceVenueSchema);
