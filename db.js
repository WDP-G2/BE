require("dotenv").config();
var mongoose = require("mongoose");
var uri = process.env.MONGODB_URI || "";

if (!uri) {
  console.warn("MONGODB_URI not set — skipping mongoose connect");
} else {
  mongoose
    .connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(function () {
      console.log("Connected to MongoDB");
    })
    .catch(function (err) {
      console.error("MongoDB connection error:", err.message || err);
    });
}

module.exports = mongoose;
