var mongoose = require("../db");
var Schema = mongoose.Schema;

var UserSchema = new Schema({
  name: { type: String },
  username: { type: String },
  fullName: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String },
  role: { type: String, default: "USER" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", UserSchema);
