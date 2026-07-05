require("dotenv").config();
var dns = require("dns");
var mongoose = require("mongoose");

var uri = process.env.MONGODB_URI || "";

mongoose.set("strictQuery", true);

/** Windows: resolver mặc định có thể từ chối querySrv → dùng DNS công cộng */
if (uri.startsWith("mongodb+srv://")) {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
}

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
