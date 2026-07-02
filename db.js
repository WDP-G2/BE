require("dotenv").config();
var mongoose = require("mongoose");

var uri = process.env.MONGODB_URI || "";

mongoose.set("strictQuery", true);

var connectPromise = Promise.resolve();

if (!uri) {
  console.warn("MONGODB_URI not set — skipping mongoose connect");
} else {
  connectPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 15000,
    })
    .then(function () {
      console.log(
        "Connected to MongoDB Atlas:",
        mongoose.connection.host,
        "/",
        mongoose.connection.name,
      );
      return mongoose;
    })
    .catch(function (err) {
      console.error("MongoDB Atlas connection error:", err.message || err);
      throw err;
    });
}

module.exports = mongoose;
module.exports.connectPromise = connectPromise;
