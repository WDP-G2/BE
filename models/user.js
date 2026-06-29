var mongoose = require("../db");
var Schema = mongoose.Schema;

var UserSchema = new Schema(
  {
    name: { type: String },
    username: { type: String },
    fullName: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    role: { type: String, default: "USER" },
    active: { type: Boolean, default: true },
    location: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", UserSchema);
